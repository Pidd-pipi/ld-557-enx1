import { Injectable } from '@nestjs/common';
import { TransactionType } from '../../constants/enums';
import { CurrentUser } from '../../types/request';
import { paginate } from '../../utils/pagination';
import { HoldingsService } from '../holdings/holdings.service';

export interface TransactionRecord {
  id: number;
  holdingId: number;
  portfolioId: number;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
}

export interface RecordTransactionInput {
  holdingId: number;
  portfolioId: number;
  type: TransactionType;
  quantity: number;
  price: number;
  fee?: number;
  executedAt?: string;
}

@Injectable()
export class TransactionsService {
  private readonly transactions: TransactionRecord[] = [
    { id: 1, holdingId: 1, portfolioId: 1, type: TransactionType.BUY, quantity: 10, price: 180, fee: 1, executedAt: new Date().toISOString() },
  ];
  private nextId = 2;

  constructor(private readonly holdingsService: HoldingsService) {}

  listByHolding(holdingId: number, user: CurrentUser) {
    this.holdingsService.findOwned(holdingId, user);
    return this.transactions.filter((item) => item.holdingId === holdingId);
  }

  listByPortfolio(portfolioId: number, user: CurrentUser, page = 1, pageSize = 20) {
    this.holdingsService.listByPortfolio(portfolioId, user);
    return paginate(this.transactions.filter((item) => item.portfolioId === portfolioId), page, pageSize);
  }

  /**
   * 追加交易记录（仅在交易校验通过后由 TradesService 调用）。
   * 被拒绝的交易不会进入本列表。
   */
  record(input: RecordTransactionInput) {
    const transaction: TransactionRecord = {
      id: this.nextId++,
      holdingId: input.holdingId,
      portfolioId: input.portfolioId,
      type: input.type,
      quantity: input.quantity,
      price: input.price,
      fee: input.fee ?? 0,
      executedAt: input.executedAt ?? new Date().toISOString(),
    };
    this.transactions.push(transaction);
    return transaction;
  }
}
