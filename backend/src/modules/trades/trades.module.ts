import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HoldingsModule } from '../holdings/holdings.module';
import { PortfoliosModule } from '../portfolios/portfolios.module';
import { RiskModule } from '../risk/risk.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';

@Module({
  imports: [
    PortfoliosModule,
    HoldingsModule,
    RiskModule,
    AuditModule,
    forwardRef(() => TransactionsModule),
  ],
  controllers: [TradesController],
  providers: [TradesService],
  exports: [TradesService],
})
export class TradesModule {}
