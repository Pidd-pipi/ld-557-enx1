import { Injectable } from '@nestjs/common';
import { AssetStatus, RiskLevel, TradeRejectCode, TransactionType } from '../../constants/enums';
import { SINGLE_ASSET_WEIGHT_LIMIT } from '../../constants/risk-limits';
import { CurrentUser } from '../../types/request';
import { round2, round4, round6 } from '../../utils/decimal';
import { HoldingsService } from '../holdings/holdings.service';
import { MarketService } from '../market/market.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import { RiskPrecheckDto } from './dto/risk-precheck.dto';

export interface RiskViolation {
  code: TradeRejectCode;
  message: string;
}

export interface RiskPrecheckResult {
  portfolioId: number;
  riskLevel: RiskLevel;
  symbol: string;
  type: TransactionType;
  quantity: number;
  tradePrice: number | null;
  orderAmount: number;
  assetTradable: boolean;
  availableQuantity: number;
  avgCost: number | null;
  openingPosition: boolean;
  currentWeight: number;
  projectedWeight: number;
  weightLimit: number;
  passed: boolean;
  violations: RiskViolation[];
}

@Injectable()
export class RiskService {
  constructor(
    private readonly marketService: MarketService,
    private readonly portfoliosService: PortfoliosService,
    private readonly holdingsService: HoldingsService,
  ) {}

  /** 风险预检：不落库、不改状态，返回是否通过及触碰的规则 */
  inspect(portfolioId: number, dto: RiskPrecheckDto, user: CurrentUser): RiskPrecheckResult {
    const portfolio = this.portfoliosService.findOwned(portfolioId, user);
    const symbol = dto.symbol.toUpperCase();
    const quote = this.marketService.findQuote(symbol);
    const holding = this.holdingsService.snapshotByPortfolio(portfolioId, user)
      .find((item) => item.symbol === symbol);
    const tradePrice = dto.price ?? quote?.price ?? null;

    const violations: RiskViolation[] = [];

    // 1. 行情缺失：预检不可放行，交易时必须整笔拒绝并保留原状态
    if (!quote) {
      violations.push({ code: TradeRejectCode.MARKET_QUOTE_MISSING, message: `market quote missing for ${symbol}` });
    } else if (quote.status !== AssetStatus.ACTIVE) {
      violations.push({ code: TradeRejectCode.ASSET_NOT_TRADABLE, message: `asset ${symbol} is ${quote.status} and not tradable` });
    }

    // 2. 卖出不得超过可用数量
    const availableQuantity = holding?.quantity ?? 0;
    if (dto.type === TransactionType.SELL && dto.quantity > availableQuantity + 1e-9) {
      violations.push({
        code: TradeRejectCode.INSUFFICIENT_QUANTITY,
        message: `sell quantity ${dto.quantity} exceeds available ${availableQuantity}`,
      });
    }

    // 3. 买入按组合风险等级校验单资产权重上限。
    // 空组合的首笔建仓视为开仓（openingPosition），豁免集中度上限；
    // 否则任何空组合的第一笔买入权重恒为 100%，组合将永远无法建仓。
    const weightLimit = SINGLE_ASSET_WEIGHT_LIMIT[portfolio.riskLevel];
    const currentTotal = portfolio.totalValue;
    const currentAssetValue = holding ? holding.currentPrice * holding.quantity : 0;
    const orderAmount = round2((tradePrice ?? 0) * dto.quantity);
    const currentWeight = this.weightOf(currentAssetValue, currentTotal);
    const projectedWeight = dto.type === TransactionType.BUY
      ? this.weightOf(currentAssetValue + orderAmount, currentTotal + orderAmount)
      : currentWeight;
    const openingPosition = dto.type === TransactionType.BUY && currentTotal <= 0;

    if (!openingPosition && dto.type === TransactionType.BUY && projectedWeight + 1e-9 >= weightLimit) {
      violations.push({
        code: TradeRejectCode.WEIGHT_LIMIT_EXCEEDED,
        message: `projected single-asset weight ${round4(projectedWeight)} reaches limit ${weightLimit} for ${portfolio.riskLevel} portfolio`,
      });
    }

    return {
      portfolioId,
      riskLevel: portfolio.riskLevel,
      symbol,
      type: dto.type,
      quantity: dto.quantity,
      tradePrice: tradePrice === null ? null : round4(tradePrice),
      orderAmount,
      assetTradable: Boolean(quote && quote.status === AssetStatus.ACTIVE),
      availableQuantity: round6(availableQuantity),
      avgCost: holding ? round4(holding.avgCost) : null,
      openingPosition,
      currentWeight: round4(currentWeight),
      projectedWeight: round4(projectedWeight),
      weightLimit,
      passed: violations.length === 0,
      violations,
    };
  }

  private weightOf(part: number, whole: number) {
    if (whole <= 0) return 0;
    return part / whole;
  }
}
