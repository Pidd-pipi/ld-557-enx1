import { HttpException, HttpStatus } from '@nestjs/common';
import { TradeRejectCode, TradeStatus } from '../../../constants/enums';
import { TradeResultRecord } from '../interfaces/trade-result.interface';

/** 交易整笔拒绝：HTTP 422，携带持久化的交易结果供调用方查询 */
export class TradeRejectedException extends HttpException {
  constructor(result: TradeResultRecord, code: TradeRejectCode) {
    super(
      { status: TradeStatus.REJECTED, code, result },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
