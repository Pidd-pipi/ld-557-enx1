import { TradeRejectCode, TradeStatus, TransactionType } from '../../../constants/enums';

/** 交易校验结果（内存态/接口返回共用） */
export interface TradeResultRecord {
  id: number;
  portfolioId: number;
  holdingId: number | null;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  status: TradeStatus;
  rejectCode: TradeRejectCode | null;
  rejectReason: string;
  transactionId: number | null;
  realizedPnl: number;
  executedAt: string;
}
