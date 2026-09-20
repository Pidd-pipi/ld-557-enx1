import { RiskLevel } from './enums';

/**
 * 组合风险等级对应的单一资产权重上限。
 * 买入成交后该资产占组合总值的比例触碰上限即整笔拒绝。
 */
export const SINGLE_ASSET_WEIGHT_LIMIT: Record<RiskLevel, number> = {
  [RiskLevel.CONSERVATIVE]: 0.2,
  [RiskLevel.MODERATE]: 0.4,
  [RiskLevel.AGGRESSIVE]: 0.8,
};
