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
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum TradeRejectCode {
  MARKET_QUOTE_MISSING = 'MARKET_QUOTE_MISSING',
  ASSET_NOT_TRADABLE = 'ASSET_NOT_TRADABLE',
  INSUFFICIENT_QUANTITY = 'INSUFFICIENT_QUANTITY',
  WEIGHT_LIMIT_EXCEEDED = 'WEIGHT_LIMIT_EXCEEDED',
}

