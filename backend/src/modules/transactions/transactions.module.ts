import { forwardRef, Module } from '@nestjs/common';
import { HoldingsModule } from '../holdings/holdings.module';
import { TradesModule } from '../trades/trades.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [HoldingsModule, forwardRef(() => TradesModule)],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
