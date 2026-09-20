import { Injectable } from '@nestjs/common';
import { AssetStatus, TradeRejectReason, TransactionType } from '../../constants/enums';
import { RISK_WEIGHT_LIMITS, WEIGHT_EPSILON } from '../../constants/risk';
import { HoldingRecord } from '../holdings/holdings.service';
import { Quote } from '../market/market.service';
import { PortfolioRecord } from '../portfolios/portfolios.service';

export interface RiskCheckInput {
  portfolio: PortfolioRecord;
  symbol: string;
  holdings: HoldingRecord[];
  existingHolding?: HoldingRecord;
  quote?: Quote;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  /** 按资产代码解析最新市值价格（行情缺失时回退持仓记录价） */
  resolvePrice: (symbol: string) => number;
}

export interface RiskCheckReport {
  approved: boolean;
  reason: TradeRejectReason | null;
  message: string;
  weightLimit: number | null;
  weightBefore: number | null;
  weightAfter: number | null;
  projectedQuantity: number | null;
  projectedRealizedPnl: number | null;
}

const roundWeight = (value: number) => Number(value.toFixed(6));

/**
 * 组合风险与交易校验：纯函数式校验，不修改任何业务状态。
 * 校验未通过时由调用方保留原状态（交易记录、持仓成本、组合总值均不变）。
 */
@Injectable()
export class RiskControlService {
  check(input: RiskCheckInput): RiskCheckReport {
    const { portfolio, symbol, holdings, existingHolding, quote, type, quantity, price, fee, resolvePrice } = input;

    // 1. 行情校验：行情缺失或资产不可交易时拒绝，保留原状态（分红不依赖行情）
    if (type !== TransactionType.DIVIDEND) {
      if (!quote) {
        return this.reject(TradeRejectReason.MARKET_DATA_MISSING, `资产 ${symbol} 缺少行情数据，交易被拒绝，组合保持原状态`);
      }
      if (quote.status !== AssetStatus.ACTIVE) {
        return this.reject(TradeRejectReason.ASSET_NOT_TRADEABLE, `资产 ${symbol} 当前状态为 ${quote.status}，不可交易，组合保持原状态`);
      }
    }

    // 2. 分红：仅要求持仓存在，不做风险校验
    if (type === TransactionType.DIVIDEND) {
      if (!existingHolding) {
        return this.reject(TradeRejectReason.HOLDING_NOT_FOUND, `组合内不存在 ${symbol} 持仓，无法记录分红`);
      }
      return this.pass('校验通过');
    }

    const marketPrice = (quote as Quote).price;
    const portfolioValue = holdings.reduce((sum, item) => sum + item.quantity * resolvePrice(item.symbol), 0);
    const assetValue = (existingHolding?.quantity ?? 0) * marketPrice;
    const weightBefore = portfolioValue > 0 ? assetValue / portfolioValue : 0;

    // 3. 卖出校验：不得超过可用数量；清仓只结算已实现盈亏
    if (type === TransactionType.SELL) {
      if (!existingHolding) {
        return this.reject(TradeRejectReason.HOLDING_NOT_FOUND, `组合内不存在 ${symbol} 持仓，无法卖出`);
      }
      const available = existingHolding.quantity;
      if (quantity > available + WEIGHT_EPSILON) {
        return this.reject(TradeRejectReason.INSUFFICIENT_QUANTITY, `卖出数量 ${quantity} 超过可用数量 ${available}，整笔拒绝`);
      }
      const remaining = Math.max(Number((available - quantity).toFixed(8)), 0);
      const totalAfter = Math.max(portfolioValue - quantity * marketPrice, 0);
      const assetAfter = Math.max(assetValue - quantity * marketPrice, 0);
      return {
        approved: true,
        reason: null,
        message: remaining === 0 ? '清仓卖出，仅结算已实现盈亏' : '校验通过',
        weightLimit: null,
        weightBefore: roundWeight(weightBefore),
        weightAfter: roundWeight(totalAfter > 0 ? assetAfter / totalAfter : 0),
        projectedQuantity: remaining,
        projectedRealizedPnl: Number(((price - existingHolding.avgCost) * quantity - fee).toFixed(2)),
      };
    }

    // 4. 买入校验：按组合风险等级计算单资产权重，触碰上限整笔拒绝
    const weightLimit = RISK_WEIGHT_LIMITS[portfolio.riskLevel];
    const addedValue = quantity * marketPrice;
    const totalAfter = portfolioValue + addedValue;
    const weightAfter = totalAfter > 0 ? (assetValue + addedValue) / totalAfter : 0;
    const projectedQuantity = (existingHolding?.quantity ?? 0) + quantity;
    const report = {
      weightLimit,
      weightBefore: roundWeight(weightBefore),
      weightAfter: roundWeight(weightAfter),
      projectedQuantity,
      projectedRealizedPnl: null,
    };

    // 空仓组合的首笔建仓豁免权重上限
    const hasPositions = holdings.some((item) => item.quantity > 0);
    if (hasPositions && weightAfter > weightLimit + WEIGHT_EPSILON) {
      return {
        approved: false,
        reason: TradeRejectReason.WEIGHT_LIMIT_EXCEEDED,
        message: `买入后 ${symbol} 权重 ${(weightAfter * 100).toFixed(2)}% 将超过 ${portfolio.riskLevel} 组合单资产上限 ${(weightLimit * 100).toFixed(0)}%，整笔拒绝`,
        ...report,
      };
    }
    return { approved: true, reason: null, message: '校验通过', ...report };
  }

  private reject(reason: TradeRejectReason, message: string): RiskCheckReport {
    return {
      approved: false,
      reason,
      message,
      weightLimit: null,
      weightBefore: null,
      weightAfter: null,
      projectedQuantity: null,
      projectedRealizedPnl: null,
    };
  }

  private pass(message: string): RiskCheckReport {
    return {
      approved: true,
      reason: null,
      message,
      weightLimit: null,
      weightBefore: null,
      weightAfter: null,
      projectedQuantity: null,
      projectedRealizedPnl: null,
    };
  }
}
