import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserDecorator } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../types/request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RiskPrecheckDto } from './dto/risk-precheck.dto';
import { RiskService } from './risk.service';

@ApiTags('risk')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portfolios/:portfolioId/risk')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Post('precheck')
  @ApiOperation({ summary: '交易风险预检（行情、可交易状态、可用数量、单资产权重），不落库不改状态' })
  precheck(
    @Param('portfolioId', ParseIntPipe) portfolioId: number,
    @Body() dto: RiskPrecheckDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.riskService.inspect(portfolioId, dto, user);
  }
}
