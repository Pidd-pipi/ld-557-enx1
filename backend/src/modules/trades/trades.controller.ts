import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserDecorator } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../types/request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTransactionDto } from '../transactions/dto/create-transaction.dto';
import { TradeRequestDto } from './dto/trade-request.dto';
import { TradesService } from './trades.service';

@ApiTags('trades')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @ApiOperation({ summary: '风险预检：按组合风险等级试算单资产权重，不产生任何状态变化' })
  @Post('portfolios/:portfolioId/risk-check')
  precheck(@Param('portfolioId', ParseIntPipe) portfolioId: number, @Body() dto: TradeRequestDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.tradesService.precheck(portfolioId, dto, user);
  }

  @ApiOperation({ summary: '组合风险概览：各资产当前权重与单资产上限' })
  @Get('portfolios/:portfolioId/risk')
  riskOverview(@Param('portfolioId', ParseIntPipe) portfolioId: number, @CurrentUserDecorator() user: CurrentUser) {
    return this.tradesService.riskOverview(portfolioId, user);
  }

  @ApiOperation({ summary: '执行交易：先风险校验，触碰上限整笔拒绝并保留原状态' })
  @Post('portfolios/:portfolioId/trades')
  execute(@Param('portfolioId', ParseIntPipe) portfolioId: number, @Body() dto: TradeRequestDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.tradesService.execute(portfolioId, dto, user);
  }

  @ApiOperation({ summary: '组合交易结果列表（含被拒绝的交易）' })
  @Get('portfolios/:portfolioId/trades')
  results(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.tradesService.resultsByPortfolio(portfolioId, user, Number(page), Number(pageSize));
  }

  @ApiOperation({ summary: '单笔交易结果查询' })
  @Get('trades/:id')
  result(@Param('id', ParseIntPipe) id: number, @CurrentUserDecorator() user: CurrentUser) {
    return this.tradesService.resultById(id, user);
  }

  @ApiOperation({ summary: '按持仓记录交易（兼容入口，走同一套风险校验引擎）' })
  @Post('holdings/:holdingId/transactions')
  createForHolding(@Param('holdingId', ParseIntPipe) holdingId: number, @Body() dto: CreateTransactionDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.tradesService.executeForHolding(holdingId, dto, user);
  }
}
