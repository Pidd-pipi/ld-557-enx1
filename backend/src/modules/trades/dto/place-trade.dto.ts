import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TransactionType } from '../../../constants/enums';

export class PlaceTradeDto {
  @ApiProperty({ example: 'AAPL' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: [TransactionType.BUY, TransactionType.SELL], description: '交易方向：买入 / 卖出（分红仍走交易记录接口）' })
  @IsIn([TransactionType.BUY, TransactionType.SELL])
  type: TransactionType.BUY | TransactionType.SELL;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0.000001)
  quantity: number;

  @ApiProperty({ example: 190.5, required: false, description: '委托价格；缺省时按最新行情价成交' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({ example: 1.5, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @ApiProperty({ example: '2026-09-20T09:00:00.000Z', required: false })
  @IsOptional()
  @IsDateString()
  executedAt?: string;
}
