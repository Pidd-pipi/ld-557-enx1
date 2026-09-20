import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserDecorator } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../types/request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TradeStatus, TransactionType } from '../../constants/enums';
import { PlaceTradeDto } from './dto/place-trade.dto';
import { TradesService } from './trades.service';

@ApiTags('trades')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Post('portfolios/:portfolioId/trades')
  @ApiOperation({ summary: '组合下单（买入/卖出）：风险校验通过才成交，触碰上限整笔拒绝' })
  place(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Body() dto: PlaceTradeDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.tradesService.placeTrade(portfolioId, dto, user);
  }

  @Get('portfolios/:portfolioId/trades')
  @ApiOperation({ summary: '查询组合的交易校验结果（接受/拒绝均含），支持类型与状态筛选' })
  list(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Query('type') type: TransactionType,
    @Query('status') status: TradeStatus,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.tradesService.listByPortfolio(portfolioId, user, type, status);
  }

  @Get('trades/:id')
  @ApiOperation({ summary: '按 ID 查询单笔交易结果' })
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUserDecorator() user: CurrentUser) {
    return this.tradesService.findOne(id, user);
  }
}
