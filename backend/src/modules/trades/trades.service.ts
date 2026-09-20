import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, TradeStatus, TransactionType } from '../../constants/enums';
import { CurrentUser } from '../../types/request';
import { round2 } from '../../utils/decimal';
import { AuditService } from '../audit/audit.service';
import { HoldingsService } from '../holdings/holdings.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import { RiskService } from '../risk/risk.service';
import { TransactionsService } from '../transactions/transactions.service';
import { PlaceTradeDto } from './dto/place-trade.dto';
import { TradeRejectedException } from './exceptions/trade-rejected.exception';
import { TradeResultRecord } from './interfaces/trade-result.interface';

@Injectable()
export class TradesService {
  private readonly results: TradeResultRecord[] = [];
  private nextId = 1;

  constructor(
    private readonly riskService: RiskService,
    private readonly holdingsService: HoldingsService,
    private readonly portfoliosService: PortfoliosService,
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService: TransactionsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * 下单（买入/卖出）：先做风险预检；任一规则不通过即整笔拒绝，
   * 交易记录、持仓成本、组合总值全部保持原状。拒绝结果同样持久化可查。
   */
  placeTrade(portfolioId: number, dto: PlaceTradeDto, user: CurrentUser): TradeResultRecord {
    const symbol = dto.symbol.toUpperCase();
    const fee = dto.fee ?? 0;
    const executedAt = dto.executedAt ?? new Date().toISOString();

    const precheck = this.riskService.inspect(portfolioId, {
      symbol,
      type: dto.type,
      quantity: dto.quantity,
      price: dto.price,
    }, user);

    if (!precheck.passed || precheck.tradePrice === null) {
      const violation = precheck.violations[0];
      const rejected = this.saveResult({
        portfolioId,
        holdingId: null,
        symbol,
        type: dto.type,
        quantity: dto.quantity,
        price: precheck.tradePrice ?? dto.price ?? 0,
        fee,
        status: TradeStatus.REJECTED,
        rejectCode: violation?.code ?? null,
        rejectReason: violation?.message ?? 'risk precheck failed',
        transactionId: null,
        realizedPnl: 0,
        executedAt,
      });
      this.auditService.log({
        userId: user.id,
        action: AuditAction.CREATE,
        target: 'trade',
        targetId: String(rejected.id),
        newValue: { status: rejected.status, rejectCode: rejected.rejectCode, symbol, type: dto.type, quantity: dto.quantity },
      });
      throw new TradeRejectedException(rejected, rejected.rejectCode ?? violation!.code);
    }

    const price = precheck.tradePrice;

    if (dto.type === TransactionType.BUY) {
      const holding = this.holdingsService.executeBuy(portfolioId, symbol, dto.quantity, price);
      const transaction = this.transactionsService.record({
        holdingId: holding.id,
        portfolioId,
        type: TransactionType.BUY,
        quantity: dto.quantity,
        price,
        fee,
        executedAt,
      });
      const accepted = this.saveResult({
        portfolioId,
        holdingId: holding.id,
        symbol,
        type: TransactionType.BUY,
        quantity: dto.quantity,
        price,
        fee,
        status: TradeStatus.ACCEPTED,
        rejectCode: null,
        rejectReason: '',
        transactionId: transaction.id,
        realizedPnl: 0,
        executedAt,
      });
      this.auditService.log({
        userId: user.id,
        action: AuditAction.CREATE,
        target: 'trade',
        targetId: String(accepted.id),
        oldValue: { quantity: precheck.availableQuantity, avgCost: precheck.avgCost },
        newValue: { status: accepted.status, holdingId: holding.id, transactionId: transaction.id, quantity: holding.quantity, avgCost: holding.avgCost },
      });
      return accepted;
    }

    const { holding, realizedPnlDelta } = this.holdingsService.executeSell(
      portfolioId,
      symbol,
      dto.quantity,
      price,
      fee,
    );
    const transaction = this.transactionsService.record({
      holdingId: holding.id,
      portfolioId,
      type: TransactionType.SELL,
      quantity: dto.quantity,
      price,
      fee,
      executedAt,
    });
    const accepted = this.saveResult({
      portfolioId,
      holdingId: holding.id,
      symbol,
      type: TransactionType.SELL,
      quantity: dto.quantity,
      price,
      fee,
      status: TradeStatus.ACCEPTED,
      rejectCode: null,
      rejectReason: '',
      transactionId: transaction.id,
      realizedPnl: round2(realizedPnlDelta),
      executedAt,
    });
    this.auditService.log({
      userId: user.id,
      action: AuditAction.CREATE,
      target: 'trade',
      targetId: String(accepted.id),
      oldValue: { quantity: holding.quantity + dto.quantity },
      newValue: {
        status: accepted.status,
        holdingId: holding.id,
        transactionId: transaction.id,
        quantity: holding.quantity,
        realizedPnl: accepted.realizedPnl,
      },
    });
    return accepted;
  }

  listByPortfolio(portfolioId: number, user: CurrentUser, type?: TransactionType, status?: TradeStatus) {
    this.portfoliosService.findOwned(portfolioId, user);
    return this.results
      .filter((item) => item.portfolioId === portfolioId)
      .filter((item) => (type ? item.type === type : true))
      .filter((item) => (status ? item.status === status : true))
      .slice()
      .reverse();
  }

  findOne(id: number, user: CurrentUser) {
    const result = this.results.find((item) => item.id === id);
    if (!result) throw new NotFoundException('trade result not found');
    this.portfoliosService.findOwned(result.portfolioId, user);
    return result;
  }

  private saveResult(partial: Omit<TradeResultRecord, 'id'>): TradeResultRecord {
    const result: TradeResultRecord = { id: this.nextId++, ...partial };
    this.results.push(result);
    return result;
  }
}
