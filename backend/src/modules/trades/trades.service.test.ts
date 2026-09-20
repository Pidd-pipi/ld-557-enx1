import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import {
  PortfolioType,
  RiskLevel,
  TradeRejectReason,
  TradeStatus,
  TransactionType,
  UserRole,
} from '../../constants/enums';
import { RISK_WEIGHT_LIMITS } from '../../constants/risk';
import { CurrentUser } from '../../types/request';
import { HoldingsService } from '../holdings/holdings.service';
import { MarketService } from '../market/market.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import { TransactionsService } from '../transactions/transactions.service';
import { RiskControlService } from './risk-control.service';
import { TradeResultsService } from './trade-results.service';
import { TradesService } from './trades.service';

const owner: CurrentUser = { id: 1, email: 'owner@example.com', role: UserRole.USER };
const stranger: CurrentUser = { id: 2, email: 'stranger@example.com', role: UserRole.USER };
const admin: CurrentUser = { id: 99, email: 'admin@example.com', role: UserRole.ADMIN };

function buildStack() {
  const portfolios = new PortfoliosService();
  const market = new MarketService();
  const holdings = new HoldingsService(market, portfolios);
  const transactions = new TransactionsService(holdings);
  const results = new TradeResultsService();
  const trades = new TradesService(portfolios, market, holdings, transactions, new RiskControlService(), results);
  return { portfolios, market, holdings, transactions, results, trades };
}

function createPortfolio(stack: ReturnType<typeof buildStack>, riskLevel = RiskLevel.MODERATE) {
  return stack.portfolios.create({ name: '测试组合', type: PortfolioType.MIXED, riskLevel }, owner);
}

describe('组合风险与交易校验模块', () => {
  describe('买入权重上限', () => {
    it('空仓组合首笔建仓豁免权重上限', () => {
      const stack = buildStack();
      const portfolio = createPortfolio(stack);
      const result = stack.trades.execute(portfolio.id, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 10, price: 190 }, owner);
      assert.equal(result.status, TradeStatus.EXECUTED);
      assert.equal(result.weightAfter, 1);
    });

    it('触碰单资产权重上限时整笔拒绝，且交易记录、持仓成本与组合总值均不变化', () => {
      const stack = buildStack();
      const portfolio = createPortfolio(stack);
      stack.trades.execute(portfolio.id, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 10, price: 190 }, owner);

      const before = {
        transactions: stack.transactions.listByPortfolio(portfolio.id, owner).total,
        avgCost: stack.holdings.findBySymbol(portfolio.id, 'AAPL')!.avgCost,
        quantity: stack.holdings.findBySymbol(portfolio.id, 'AAPL')!.quantity,
        totalValue: stack.portfolios.findOwned(portfolio.id, owner).totalValue,
      };

      // AAPL 市值 1952，买入 3 股 VOO（1537.32）后权重 44.06% > MODERATE 上限 40%
      const rejected = stack.trades.execute(portfolio.id, { symbol: 'VOO', type: TransactionType.BUY, quantity: 3, price: 512 }, owner);
      assert.equal(rejected.status, TradeStatus.REJECTED);
      assert.equal(rejected.reason, TradeRejectReason.WEIGHT_LIMIT_EXCEEDED);
      assert.equal(rejected.weightLimit, RISK_WEIGHT_LIMITS[RiskLevel.MODERATE]);
      assert.ok(rejected.weightAfter! > RISK_WEIGHT_LIMITS[RiskLevel.MODERATE]);
      assert.equal(rejected.transactionId, null);

      // 状态零变化
      assert.equal(stack.transactions.listByPortfolio(portfolio.id, owner).total, before.transactions);
      assert.equal(stack.holdings.findBySymbol(portfolio.id, 'AAPL')!.avgCost, before.avgCost);
      assert.equal(stack.holdings.findBySymbol(portfolio.id, 'AAPL')!.quantity, before.quantity);
      assert.equal(stack.portfolios.findOwned(portfolio.id, owner).totalValue, before.totalValue);
      assert.equal(stack.holdings.findBySymbol(portfolio.id, 'VOO'), undefined);
    });

    it('未触碰上限的买入正常成交并重算持仓成本与组合总值', () => {
      const stack = buildStack();
      const portfolio = createPortfolio(stack, RiskLevel.AGGRESSIVE);
      stack.trades.execute(portfolio.id, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 10, price: 190 }, owner);

      // 买入 2 股 VOO（1024.88）后权重 34.43% < 60%
      const executed = stack.trades.execute(portfolio.id, { symbol: 'VOO', type: TransactionType.BUY, quantity: 2, price: 512 }, owner);
      assert.equal(executed.status, TradeStatus.EXECUTED);
      assert.ok(executed.transactionId);

      const voo = stack.holdings.findBySymbol(portfolio.id, 'VOO')!;
      assert.equal(voo.quantity, 2);
      assert.equal(voo.avgCost, 512);
      // 组合总值 = 10*195.2 + 2*512.44 = 2976.88
      assert.equal(stack.portfolios.findOwned(portfolio.id, owner).totalValue, 2976.88);

      // 加仓 1 股 VOO：权重 44.06% < 60%，加权平均成本 = (512*2 + 520*1) / 3
      const added = stack.trades.execute(portfolio.id, { symbol: 'VOO', type: TransactionType.BUY, quantity: 1, price: 520 }, owner);
      assert.equal(added.status, TradeStatus.EXECUTED);
      assert.equal(voo.quantity, 3);
      assert.ok(Math.abs(voo.avgCost - 1544 / 3) < 1e-9);
    });

    it('不同风险等级适用不同权重上限', () => {
      const stack = buildStack();
      const conservative = createPortfolio(stack, RiskLevel.CONSERVATIVE);
      stack.trades.execute(conservative.id, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 10, price: 190 }, owner);
      // 保守型上限 20%：买入 1 股 VOO 后权重 512.44/2464.44 ≈ 20.79% → 拒绝
      const rejected = stack.trades.execute(conservative.id, { symbol: 'VOO', type: TransactionType.BUY, quantity: 1, price: 512 }, owner);
      assert.equal(rejected.status, TradeStatus.REJECTED);
      assert.equal(rejected.reason, TradeRejectReason.WEIGHT_LIMIT_EXCEEDED);

      const aggressive = createPortfolio(stack, RiskLevel.AGGRESSIVE);
      stack.trades.execute(aggressive.id, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 10, price: 190 }, owner);
      // 激进型上限 60%：同样买 3 股 VOO（44.06%）→ 通过
      const executed = stack.trades.execute(aggressive.id, { symbol: 'VOO', type: TransactionType.BUY, quantity: 3, price: 512 }, owner);
      assert.equal(executed.status, TradeStatus.EXECUTED);
    });
  });

  describe('风险预检', () => {
    it('预检返回试算结果且不产生任何状态变化', () => {
      const stack = buildStack();
      const portfolio = createPortfolio(stack);
      stack.trades.execute(portfolio.id, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 10, price: 190 }, owner);

      const before = {
        transactions: stack.transactions.listByPortfolio(portfolio.id, owner).total,
        totalValue: stack.portfolios.findOwned(portfolio.id, owner).totalValue,
        results: stack.results.listByPortfolio(portfolio.id).length,
      };

      const report = stack.trades.precheck(portfolio.id, { symbol: 'VOO', type: TransactionType.BUY, quantity: 3, price: 512 }, owner);
      assert.equal(report.approved, false);
      assert.equal(report.reason, TradeRejectReason.WEIGHT_LIMIT_EXCEEDED);
      assert.equal(report.weightLimit, 0.4);
      assert.ok(report.weightAfter! > 0.4);
      assert.ok(report.quote);

      const okReport = stack.trades.precheck(portfolio.id, { symbol: 'VOO', type: TransactionType.BUY, quantity: 2, price: 512 }, owner);
      assert.equal(okReport.approved, true);

      // 预检不落任何状态
      assert.equal(stack.transactions.listByPortfolio(portfolio.id, owner).total, before.transactions);
      assert.equal(stack.portfolios.findOwned(portfolio.id, owner).totalValue, before.totalValue);
      assert.equal(stack.results.listByPortfolio(portfolio.id).length, before.results);
    });
  });

  describe('卖出校验', () => {
    it('卖出超过可用数量时整笔拒绝且状态不变', () => {
      const stack = buildStack();
      // 种子组合 1 持有 10 股 AAPL（成本 180）
      const rejected = stack.trades.execute(1, { symbol: 'AAPL', type: TransactionType.SELL, quantity: 11, price: 200 }, owner);
      assert.equal(rejected.status, TradeStatus.REJECTED);
      assert.equal(rejected.reason, TradeRejectReason.INSUFFICIENT_QUANTITY);

      const holding = stack.holdings.findBySymbol(1, 'AAPL')!;
      assert.equal(holding.quantity, 10);
      assert.equal(holding.avgCost, 180);
      assert.equal(stack.transactions.listByPortfolio(1, owner).total, 1);
    });

    it('卖出无持仓的资产被拒绝', () => {
      const stack = buildStack();
      const rejected = stack.trades.execute(1, { symbol: 'VOO', type: TransactionType.SELL, quantity: 1, price: 500 }, owner);
      assert.equal(rejected.status, TradeStatus.REJECTED);
      assert.equal(rejected.reason, TradeRejectReason.HOLDING_NOT_FOUND);
    });

    it('清仓后只结算已实现盈亏', () => {
      const stack = buildStack();
      const result = stack.trades.execute(1, { symbol: 'AAPL', type: TransactionType.SELL, quantity: 10, price: 200, fee: 5 }, owner);
      assert.equal(result.status, TradeStatus.EXECUTED);
      // 已实现盈亏 = (200 - 180) * 10 - 5 = 195
      assert.equal(result.realizedPnl, 195);

      const holding = stack.holdings.findBySymbol(1, 'AAPL')!;
      assert.equal(holding.quantity, 0);
      assert.equal(holding.pnl, 0);
      assert.equal(stack.portfolios.findOwned(1, owner).totalValue, 0);
    });

    it('部分卖出按比例结算已实现盈亏并保留剩余持仓', () => {
      const stack = buildStack();
      const result = stack.trades.execute(1, { symbol: 'AAPL', type: TransactionType.SELL, quantity: 4, price: 200 }, owner);
      assert.equal(result.status, TradeStatus.EXECUTED);
      assert.equal(result.realizedPnl, 80);

      const holding = stack.holdings.findBySymbol(1, 'AAPL')!;
      assert.equal(holding.quantity, 6);
      assert.equal(holding.avgCost, 180);
    });
  });

  describe('行情与资产状态', () => {
    it('行情缺失时拒绝交易并保留原状态', () => {
      const stack = buildStack();
      const before = stack.portfolios.findOwned(1, owner).totalValue;
      const rejected = stack.trades.execute(1, { symbol: 'NOPE', type: TransactionType.BUY, quantity: 1, price: 1 }, owner);
      assert.equal(rejected.status, TradeStatus.REJECTED);
      assert.equal(rejected.reason, TradeRejectReason.MARKET_DATA_MISSING);
      assert.equal(stack.portfolios.findOwned(1, owner).totalValue, before);
      assert.equal(stack.transactions.listByPortfolio(1, owner).total, 1);
    });

    it('资产停牌时不可交易并保留原状态', () => {
      const stack = buildStack();
      const rejected = stack.trades.execute(1, { symbol: 'XYZ', type: TransactionType.BUY, quantity: 100, price: 12 }, owner);
      assert.equal(rejected.status, TradeStatus.REJECTED);
      assert.equal(rejected.reason, TradeRejectReason.ASSET_NOT_TRADEABLE);
      assert.equal(stack.holdings.findBySymbol(1, 'XYZ'), undefined);
      assert.equal(stack.transactions.listByPortfolio(1, owner).total, 1);
    });
  });

  describe('权限控制', () => {
    it('普通账户不能处理他人组合，管理员可处理全部组合', () => {
      const stack = buildStack();
      assert.throws(
        () => stack.trades.execute(1, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 1, price: 190 }, stranger),
        ForbiddenException,
      );
      assert.throws(
        () => stack.trades.precheck(1, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 1, price: 190 }, stranger),
        ForbiddenException,
      );

      const byAdmin = stack.trades.execute(1, { symbol: 'AAPL', type: TransactionType.SELL, quantity: 1, price: 200 }, admin);
      assert.equal(byAdmin.status, TradeStatus.EXECUTED);
    });

    it('交易结果查询遵循同样的数据范围', () => {
      const stack = buildStack();
      const result = stack.trades.execute(1, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 1, price: 190 }, owner);
      assert.equal(stack.trades.resultById(result.id, owner).id, result.id);
      assert.equal(stack.trades.resultById(result.id, admin).id, result.id);
      assert.throws(() => stack.trades.resultById(result.id, stranger), ForbiddenException);
      assert.throws(() => stack.trades.resultsByPortfolio(1, stranger), ForbiddenException);
    });
  });

  describe('交易结果查询', () => {
    it('成交与被拒绝的交易都可查询，且被拒绝的交易不进入交易记录', () => {
      const stack = buildStack();
      const portfolio = createPortfolio(stack);
      const executed = stack.trades.execute(portfolio.id, { symbol: 'AAPL', type: TransactionType.BUY, quantity: 10, price: 190 }, owner);
      const rejected = stack.trades.execute(portfolio.id, { symbol: 'VOO', type: TransactionType.BUY, quantity: 3, price: 512 }, owner);

      const list = stack.trades.resultsByPortfolio(portfolio.id, owner);
      assert.equal(list.total, 2);
      assert.deepEqual(list.list.map((item) => item.status).sort(), [TradeStatus.EXECUTED, TradeStatus.REJECTED]);

      // 只有成交的交易进入交易记录
      assert.equal(stack.transactions.listByPortfolio(portfolio.id, owner).total, 1);
      assert.ok(executed.transactionId);
      assert.equal(rejected.transactionId, null);
    });

    it('兼容入口（按持仓记录交易）走同一套校验引擎', () => {
      const stack = buildStack();
      const executed = stack.trades.executeForHolding(1, { type: TransactionType.SELL, quantity: 1, price: 200 }, owner);
      assert.equal(executed.status, TradeStatus.EXECUTED);
      assert.equal(stack.holdings.findBySymbol(1, 'AAPL')!.quantity, 9);

      const rejected = stack.trades.executeForHolding(1, { type: TransactionType.SELL, quantity: 999, price: 200 }, owner);
      assert.equal(rejected.status, TradeStatus.REJECTED);
      assert.equal(rejected.reason, TradeRejectReason.INSUFFICIENT_QUANTITY);
    });

    it('分红只记录交易，不变更持仓数量与成本', () => {
      const stack = buildStack();
      const result = stack.trades.execute(1, { symbol: 'AAPL', type: TransactionType.DIVIDEND, quantity: 10, price: 0.5 }, owner);
      assert.equal(result.status, TradeStatus.EXECUTED);
      const holding = stack.holdings.findBySymbol(1, 'AAPL')!;
      assert.equal(holding.quantity, 10);
      assert.equal(holding.avgCost, 180);
      assert.equal(stack.transactions.listByPortfolio(1, owner).total, 2);
    });
  });
});
