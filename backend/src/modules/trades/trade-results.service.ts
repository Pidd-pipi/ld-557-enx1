import { Injectable, NotFoundException } from '@nestjs/common';
import { TradeRejectReason, TradeStatus, TransactionType } from '../../constants/enums';

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
  reason: TradeRejectReason | null;
  message: string;
  weightLimit: number | null;
  weightBefore: number | null;
  weightAfter: number | null;
  realizedPnl: number | null;
  transactionId: number | null;
  requestedBy: number;
  createdAt: string;
}

/**
 * 交易结果存储：无论成交还是被拒绝，每次交易尝试都会留下可查询的结果。
 * 被拒绝的交易只体现在这里，不会进入交易记录、持仓与组合总值。
 */
@Injectable()
export class TradeResultsService {
  private readonly results: TradeResultRecord[] = [];
  private nextId = 1;

  append(input: Omit<TradeResultRecord, 'id' | 'createdAt'>) {
    const result: TradeResultRecord = {
      ...input,
      id: this.nextId++,
      createdAt: new Date().toISOString(),
    };
    this.results.push(result);
    return result;
  }

  findById(id: number) {
    const result = this.results.find((item) => item.id === id);
    if (!result) throw new NotFoundException('trade result not found');
    return result;
  }

  listByPortfolio(portfolioId: number) {
    return this.results
      .filter((item) => item.portfolioId === portfolioId)
      .sort((a, b) => b.id - a.id);
  }
}
