import { RiskLevel } from './enums';

/**
 * 单资产权重上限：买入后该资产市值 / 组合总市值 不得超过该比例。
 * 权重一律按当前行情市值计算。
 */
export const RISK_WEIGHT_LIMITS: Record<RiskLevel, number> = {
  [RiskLevel.CONSERVATIVE]: 0.2,
  [RiskLevel.MODERATE]: 0.4,
  [RiskLevel.AGGRESSIVE]: 0.6,
};

/** 浮点比较容差 */
export const WEIGHT_EPSILON = 1e-9;
