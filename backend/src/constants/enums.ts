export enum PortfolioType {
  STOCK = 'STOCK',
  FUND = 'FUND',
  BOND = 'BOND',
  MIXED = 'MIXED',
  CRYPTO = 'CRYPTO',
}

export enum RiskLevel {
  CONSERVATIVE = 'CONSERVATIVE',
  MODERATE = 'MODERATE',
  AGGRESSIVE = 'AGGRESSIVE',
}

export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL',
  DIVIDEND = 'DIVIDEND',
}

export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELISTED = 'DELISTED',
}

export enum UserRole {
  USER = 'USER',
  PREMIUM = 'PREMIUM',
  ADMIN = 'ADMIN',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export enum TradeStatus {
  EXECUTED = 'EXECUTED',
  REJECTED = 'REJECTED',
}

export enum TradeRejectReason {
  MARKET_DATA_MISSING = 'MARKET_DATA_MISSING',
  ASSET_NOT_TRADEABLE = 'ASSET_NOT_TRADEABLE',
  WEIGHT_LIMIT_EXCEEDED = 'WEIGHT_LIMIT_EXCEEDED',
  INSUFFICIENT_QUANTITY = 'INSUFFICIENT_QUANTITY',
  HOLDING_NOT_FOUND = 'HOLDING_NOT_FOUND',
}

