import { Injectable } from '@nestjs/common';
import { TradeStatus, TransactionType } from '../../constants/enums';
import { RISK_WEIGHT_LIMITS, WEIGHT_EPSILON } from '../../constants/risk';
import { CurrentUser } from '../../types/request';
import { paginate } from '../../utils/pagination';
import { HoldingsService } from '../holdings/holdings.service';
import { MarketService } from '../market/market.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import { CreateTransactionDto } from '../transactions/dto/create-transaction.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { TradeRequestDto } from './dto/trade-request.dto';
import { RiskControlService } from './risk-control.service';
import { TradeResultsService } from './trade-results.service';

/**
 * 组合风险与交易编排：先校验后落账。
 * 校验未通过时整笔拒绝——交易记录、持仓成本与组合总值均保持不变，
 * 仅追加一条 REJECTED 交易结果供查询。
 */
@Injectable()
export class TradesService {
  constructor(
    private readonly portfoliosService: PortfoliosService,
    private readonly marketService: MarketService,
    private readonly holdingsService: HoldingsService,
    private readonly transactionsService: TransactionsService,
    private readonly riskControlService: RiskControlService,
    private readonly tradeResultsService: TradeResultsService,
  ) {}

  /** 风险预检：只校验，不产生任何状态变化，也不落交易结果 */
  precheck(portfolioId: number, dto: TradeRequestDto, user: CurrentUser) {
    const context = this.buildContext(portfolioId, dto.symbol, user);
    const report = this.riskControlService.check({
      ...context,
      type: dto.type,
      quantity: dto.quantity,
      price: dto.price,
      fee: dto.fee ?? 0,
    });
    return {
      ...report,
      portfolioId,
      symbol: context.symbol,
      type: dto.type,
      quantity: dto.quantity,
      price: dto.price,
      fee: dto.fee ?? 0,
      quote: context.quote
        ? { symbol: context.quote.symbol, price: context.quote.price, status: context.quote.status }
        : null,
      checkedAt: new Date().toISOString(),
    };
  }

  /** 执行交易：校验通过才变更持仓/记录交易，否则整笔拒绝 */
  execute(portfolioId: number, dto: TradeRequestDto, user: CurrentUser) {
    const context = this.buildContext(portfolioId, dto.symbol, user);
    const fee = dto.fee ?? 0;
    const report = this.riskControlService.check({
      ...context,
      type: dto.type,
      quantity: dto.quantity,
      price: dto.price,
      fee,
    });

    if (!report.approved) {
      return this.tradeResultsService.append({
        portfolioId,
        holdingId: context.existingHolding?.id ?? null,
        symbol: context.symbol,
        type: dto.type,
        quantity: dto.quantity,
        price: dto.price,
        fee,
        status: TradeStatus.REJECTED,
        reason: report.reason,
        message: report.message,
        weightLimit: report.weightLimit,
        weightBefore: report.weightBefore,
        weightAfter: report.weightAfter,
        realizedPnl: null,
        transactionId: null,
        requestedBy: user.id,
      });
    }

    let holding = context.existingHolding;
    let realizedPnl: number | null = null;
    if (dto.type === TransactionType.BUY) {
      holding = holding
        ? this.holdingsService.applyBuy(holding, dto.quantity, dto.price)
        : this.holdingsService.createFromTrade(portfolioId, context.symbol, dto.quantity, dto.price);
    } else if (dto.type === TransactionType.SELL) {
      realizedPnl = report.projectedRealizedPnl;
      holding = this.holdingsService.applySell(holding!, dto.quantity);
    }
    // DIVIDEND 不变更持仓数量与成本

    const transaction = this.transactionsService.record({
      holdingId: holding!.id,
      portfolioId,
      type: dto.type,
      quantity: dto.quantity,
      price: dto.price,
      fee,
      executedAt: dto.executedAt,
    });
    if (dto.type !== TransactionType.DIVIDEND) {
      this.holdingsService.recomputePortfolioValue(portfolioId);
    }

    return this.tradeResultsService.append({
      portfolioId,
      holdingId: holding!.id,
      symbol: context.symbol,
      type: dto.type,
      quantity: dto.quantity,
      price: dto.price,
      fee,
      status: TradeStatus.EXECUTED,
      reason: null,
      message: report.message,
      weightLimit: report.weightLimit,
      weightBefore: report.weightBefore,
      weightAfter: report.weightAfter,
      realizedPnl,
      transactionId: transaction.id,
      requestedBy: user.id,
    });
  }

  /** 兼容入口：按持仓记录交易，走同一套风险校验引擎 */
  executeForHolding(holdingId: number, dto: CreateTransactionDto, user: CurrentUser) {
    const holding = this.holdingsService.findOwned(holdingId, user);
    return this.execute(
      holding.portfolioId,
      { symbol: holding.symbol, type: dto.type, quantity: dto.quantity, price: dto.price, fee: dto.fee, executedAt: dto.executedAt },
      user,
    );
  }

  /** 组合当前各资产权重与风险上限 */
  riskOverview(portfolioId: number, user: CurrentUser) {
    const portfolio = this.portfoliosService.findOwned(portfolioId, user);
    const weightLimit = RISK_WEIGHT_LIMITS[portfolio.riskLevel];
    const positions = this.holdingsService.listRawByPortfolio(portfolioId).map((holding) => {
      const price = this.marketService.findQuote(holding.symbol)?.price ?? holding.currentPrice;
      return {
        holdingId: holding.id,
        symbol: holding.symbol,
        quantity: holding.quantity,
        price,
        value: Number((holding.quantity * price).toFixed(2)),
      };
    });
    const totalValue = positions.reduce((sum, item) => sum + item.value, 0);
    return {
      portfolioId,
      riskLevel: portfolio.riskLevel,
      weightLimit,
      totalValue: Number(totalValue.toFixed(2)),
      positions: positions.map((item) => {
        const weight = totalValue > 0 ? item.value / totalValue : 0;
        return {
          ...item,
          weight: Number(weight.toFixed(6)),
          withinLimit: weight <= weightLimit + WEIGHT_EPSILON,
        };
      }),
    };
  }

  /** 单笔交易结果查询：普通账户仅本人组合，ADMIN 可查全部 */
  resultById(id: number, user: CurrentUser) {
    const result = this.tradeResultsService.findById(id);
    this.portfoliosService.findOwned(result.portfolioId, user);
    return result;
  }

  resultsByPortfolio(portfolioId: number, user: CurrentUser, page = 1, pageSize = 20) {
    this.portfoliosService.findOwned(portfolioId, user);
    return paginate(this.tradeResultsService.listByPortfolio(portfolioId), page, pageSize);
  }

  private buildContext(portfolioId: number, symbol: string, user: CurrentUser) {
    // 普通账户只能操作本人组合，管理员可处理全部组合
    const portfolio = this.portfoliosService.findOwned(portfolioId, user);
    const normalized = symbol.toUpperCase();
    return {
      portfolio,
      symbol: normalized,
      holdings: this.holdingsService.listRawByPortfolio(portfolioId),
      existingHolding: this.holdingsService.findBySymbol(portfolioId, normalized),
      quote: this.marketService.findQuote(normalized),
      resolvePrice: (asset: string) => this.priceOf(portfolioId, asset),
    };
  }

  private priceOf(portfolioId: number, symbol: string) {
    const quote = this.marketService.findQuote(symbol);
    if (quote) return quote.price;
    return this.holdingsService.findBySymbol(portfolioId, symbol)?.currentPrice ?? 0;
  }
}
