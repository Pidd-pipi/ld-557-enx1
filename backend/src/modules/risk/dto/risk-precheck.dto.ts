import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TransactionType } from '../../../constants/enums';

export class RiskPrecheckDto {
  @ApiProperty({ example: 'AAPL', description: '资产代码；买入可对新代码预检，卖出必须是组合内已有持仓' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: TransactionType, enumName: 'TransactionType', description: '仅支持 BUY / SELL' })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0.000001)
  quantity: number;

  @ApiProperty({ example: 190.5, required: false, description: '委托价格；缺省时取最新行情价' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}
