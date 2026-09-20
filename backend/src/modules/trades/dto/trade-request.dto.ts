import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TransactionType } from '../../../constants/enums';

export class TradeRequestDto {
  @ApiProperty({ example: 'AAPL' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.BUY })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0.000001)
  quantity: number;

  @ApiProperty({ example: 190.5 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 1.5, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @ApiProperty({ example: '2026-06-16T09:00:00.000Z', required: false })
  @IsOptional()
  @IsDateString()
  executedAt?: string;
}
