import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { TransactionType } from '../../constants/enums';
import { CurrentUser } from '../../types/request';
import { paginate } from '../../utils/pagination';
import { HoldingsService } from '../holdings/holdings.service';
import { TradesService } from '../trades/trades.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

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

@Injectable()
export class TransactionsService {
  private readonly transactions: TransactionRecord[] = [
    { id: 1, holdingId: 1, portfolioId: 1, type: TransactionType.BUY, quantity: 10, price: 180, fee: 1, executedAt: new Date().toISOString() },
  ];
  private nextId = 2;

  constructor(
    private readonly holdingsService: HoldingsService,
    @Inject(forwardRef(() => TradesService))
    private readonly tradesService: TradesService,
  ) {}

  listByHolding(holdingId: number, user: CurrentUser) {
    this.holdingsService.findOwned(holdingId, user);
    return this.transactions.filter((item) => item.holdingId === holdingId);
  }

  listByPortfolio(portfolioId: number, user: CurrentUser, page = 1, pageSize = 20) {
    this.holdingsService.listByPortfolio(portfolioId, user);
    return paginate(this.transactions.filter((item) => item.portfolioId === portfolioId), page, pageSize);
  }

  /**
   * 兼容旧入口：买入/卖出走统一的组合风险与交易校验流程；
   * 拒绝时抛 TradeRejectedException（HTTP 422），任何状态都不变。
   * 分红不改变持仓数量与成本，仅记录交易流水。
   */
  create(holdingId: number, dto: CreateTransactionDto, user: CurrentUser) {
    const holding = this.holdingsService.findOwned(holdingId, user);
    if (dto.type === TransactionType.DIVIDEND) {
      return this.record({
        holdingId,
        portfolioId: holding.portfolioId,
        type: TransactionType.DIVIDEND,
        quantity: dto.quantity,
        price: dto.price,
        fee: dto.fee ?? 0,
        executedAt: dto.executedAt ?? new Date().toISOString(),
      });
    }

    const result = this.tradesService.placeTrade(holding.portfolioId, {
      symbol: holding.symbol,
      type: dto.type,
      quantity: dto.quantity,
      price: dto.price,
      fee: dto.fee,
      executedAt: dto.executedAt,
    }, user);
    return this.transactions.find((item) => item.id === result.transactionId);
  }

  /** 底层流水落库：仅在校验通过后由交易模块调用 */
  record(input: Omit<TransactionRecord, 'id'>): TransactionRecord {
    const transaction: TransactionRecord = { id: this.nextId++, ...input };
    this.transactions.push(transaction);
    return transaction;
  }
}
