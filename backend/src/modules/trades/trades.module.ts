import { Module } from '@nestjs/common';
import { HoldingsModule } from '../holdings/holdings.module';
import { MarketModule } from '../market/market.module';
import { PortfoliosModule } from '../portfolios/portfolios.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { RiskControlService } from './risk-control.service';
import { TradeResultsService } from './trade-results.service';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';

@Module({
  imports: [PortfoliosModule, MarketModule, HoldingsModule, TransactionsModule],
  controllers: [TradesController],
  providers: [TradesService, RiskControlService, TradeResultsService],
})
export class TradesModule {}
