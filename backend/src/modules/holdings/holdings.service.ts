import { Injectable, NotFoundException } from '@nestjs/common';
import { CurrentUser } from '../../types/request';
import { CreateHoldingDto } from './dto/create-holding.dto';
import { MarketService } from '../market/market.service';
import { PortfoliosService } from '../portfolios/portfolios.service';

export interface HoldingRecord {
  id: number;
  portfolioId: number;
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  pnl: number;
  realizedPnl: number;
}

@Injectable()
export class HoldingsService {
  private readonly holdings: HoldingRecord[] = [
    { id: 1, portfolioId: 1, symbol: 'AAPL', quantity: 10, avgCost: 180, currentPrice: 195.2, pnl: 152, realizedPnl: 0 },
  ];
  private nextId = 2;

  constructor(
    private readonly marketService: MarketService,
    private readonly portfoliosService: PortfoliosService,
  ) {}

  listByPortfolio(portfolioId: number, user: CurrentUser) {
    this.portfoliosService.findOwned(portfolioId, user);
    return this.revalueAll(this.holdings.filter((item) => item.portfolioId === portfolioId));
  }

  /** 只读快照：归属校验 + 按最新行情估值，但不回写内存状态（供风险预检使用） */
  snapshotByPortfolio(portfolioId: number, user: CurrentUser) {
    this.portfoliosService.findOwned(portfolioId, user);
    return this.holdings
      .filter((item) => item.portfolioId === portfolioId)
      .map((item) => this.evaluate(item));
  }

  findOwned(id: number, user: CurrentUser) {
    const holding = this.holdings.find((item) => item.id === id);
    if (!holding) throw new NotFoundException('holding not found');
    this.portfoliosService.findOwned(holding.portfolioId, user);
    return this.revalue(holding);
  }

  create(portfolioId: number, dto: CreateHoldingDto, user: CurrentUser) {
    this.portfoliosService.findOwned(portfolioId, user);
    const currentPrice = this.marketService.currentPrice(dto.symbol);
    const holding: HoldingRecord = {
      id: this.nextId++,
      portfolioId,
      symbol: dto.symbol.toUpperCase(),
      quantity: dto.quantity,
      avgCost: dto.avgCost,
      currentPrice,
      pnl: (currentPrice - dto.avgCost) * dto.quantity,
      realizedPnl: 0,
    };
    this.holdings.push(holding);
    this.recomputePortfolioValue(portfolioId);
    return holding;
  }

  delete(id: number, user: CurrentUser) {
    const holding = this.findOwned(id, user);
    const index = this.holdings.findIndex((item) => item.id === id);
    this.holdings.splice(index, 1);
    this.recomputePortfolioValue(holding.portfolioId);
    return { deleted: true, id };
  }

  /**
   * 买入成交：已有持仓则加权平均成本，否则建仓。
   * 调用方（交易校验模块）必须先完成权重与行情校验。
   */
  executeBuy(portfolioId: number, symbol: string, quantity: number, price: number) {
    const normalized = symbol.toUpperCase();
    const existing = this.findBySymbol(portfolioId, normalized);
    if (existing) {
      const newQuantity = existing.quantity + quantity;
      existing.avgCost = ((existing.avgCost * existing.quantity) + (price * quantity)) / newQuantity;
      existing.quantity = Number(newQuantity.toFixed(6));
      this.revalue(existing);
      this.recomputePortfolioValue(portfolioId);
      return existing;
    }

    const holding: HoldingRecord = {
      id: this.nextId++,
      portfolioId,
      symbol: normalized,
      quantity,
      avgCost: price,
      currentPrice: this.marketService.findQuote(normalized)?.price ?? price,
      pnl: 0,
      realizedPnl: 0,
    };
    this.holdings.push(holding);
    this.recomputePortfolioValue(portfolioId);
    return holding;
  }

  /**
   * 卖出成交：数量不足由风险预检拦截，这里做防御性校验。
   * 返回本次卖出结算的已实现盈亏；清仓后持仓保留（数量 0），只结算已实现盈亏。
   */
  executeSell(portfolioId: number, symbol: string, quantity: number, price: number, fee = 0) {
    const holding = this.requireBySymbol(portfolioId, symbol.toUpperCase());
    if (quantity > holding.quantity) {
      throw new Error(`insufficient quantity: holding ${holding.quantity}, sell ${quantity}`);
    }

    const realizedPnlDelta = Number(((price - holding.avgCost) * quantity - fee).toFixed(2));
    holding.realizedPnl = Number((holding.realizedPnl + realizedPnlDelta).toFixed(2));
    holding.quantity = Number((holding.quantity - quantity).toFixed(6));
    // 清仓后持仓保留，avgCost 保留作为已实现盈亏的成本依据
    this.revalue(holding);
    this.recomputePortfolioValue(portfolioId, realizedPnlDelta);
    return { holding, realizedPnlDelta };
  }

  private findBySymbol(portfolioId: number, symbol: string) {
    return this.holdings.find(
      (item) => item.portfolioId === portfolioId && item.symbol === symbol,
    );
  }

  private requireBySymbol(portfolioId: number, symbol: string) {
    const holding = this.findBySymbol(portfolioId, symbol);
    if (!holding) throw new NotFoundException('holding not found');
    return holding;
  }

  private revalueAll(items: HoldingRecord[]) {
    return items.map((item) => this.revalue(item));
  }

  /** 只读估值：返回副本，不修改原持仓 */
  private evaluate(holding: HoldingRecord): HoldingRecord {
    const quote = this.marketService.findQuote(holding.symbol);
    const currentPrice = quote ? quote.price : holding.currentPrice;
    return {
      ...holding,
      currentPrice,
      pnl: Number(((currentPrice - holding.avgCost) * holding.quantity).toFixed(2)),
    };
  }

  private revalue(holding: HoldingRecord) {
    const quote = this.marketService.findQuote(holding.symbol);
    // 行情缺失时保留上一次价格，避免估值被清零
    if (quote) holding.currentPrice = quote.price;
    holding.pnl = Number(((holding.currentPrice - holding.avgCost) * holding.quantity).toFixed(2));
    return holding;
  }

  private recomputePortfolioValue(portfolioId: number, realizedPnlDelta = 0) {
    const total = this.revalueAll(this.holdings.filter((item) => item.portfolioId === portfolioId))
      .reduce((sum, item) => sum + item.currentPrice * item.quantity, 0);
    this.portfoliosService.setTotalValue(portfolioId, total, realizedPnlDelta);
  }
}
