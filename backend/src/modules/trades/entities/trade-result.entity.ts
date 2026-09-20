import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TradeRejectCode, TradeStatus, TransactionType } from '../../../constants/enums';

/**
 * 交易校验结果：无论通过（ACCEPTED）还是整笔拒绝（REJECTED）都留痕，
 * 支持“交易结果查询”。拒绝记录不关联 transactionId（交易记录未生成）。
 */
@Entity('trade_results')
export class TradeResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  portfolioId: number;

  @Column({ nullable: true })
  holdingId: number;

  @Column()
  symbol: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  quantity: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  price: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  fee: string;

  @Column({ type: 'enum', enum: TradeStatus })
  status: TradeStatus;

  @Column({ type: 'enum', enum: TradeRejectCode, nullable: true })
  rejectCode: TradeRejectCode | null;

  @Column({ type: 'text', default: '' })
  rejectReason: string;

  @Column({ nullable: true })
  transactionId: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  realizedPnl: string;

  @CreateDateColumn()
  createdAt: Date;
}
