import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 组合风险与交易校验模块：
 * - holdings/portfolios 增加 realized_pnl（卖出结算的已实现盈亏）
 * - trade_results 表持久化每笔下单的校验结果（ACCEPTED / REJECTED）
 */
export class AddRiskTradeValidation1720000000000 implements MigrationInterface {
  name = 'AddRiskTradeValidation1720000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE holdings ADD COLUMN realized_pnl DECIMAL(18,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE portfolios ADD COLUMN realized_pnl DECIMAL(18,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`CREATE TYPE trade_status AS ENUM ('ACCEPTED','REJECTED')`);
    await queryRunner.query(`CREATE TYPE trade_reject_code AS ENUM ('MARKET_QUOTE_MISSING','ASSET_NOT_TRADABLE','INSUFFICIENT_QUANTITY','WEIGHT_LIMIT_EXCEEDED')`);
    await queryRunner.query(`
      CREATE TABLE trade_results (
        id SERIAL PRIMARY KEY,
        portfolio_id INT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
        holding_id INT,
        symbol VARCHAR NOT NULL,
        type transaction_type NOT NULL,
        quantity DECIMAL(18,6) NOT NULL,
        price DECIMAL(18,4) NOT NULL,
        fee DECIMAL(18,2) DEFAULT 0,
        status trade_status NOT NULL,
        reject_code trade_reject_code,
        reject_reason TEXT DEFAULT '',
        transaction_id INT,
        realized_pnl DECIMAL(18,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS trade_results`);
    await queryRunner.query(`DROP TYPE IF EXISTS trade_reject_code`);
    await queryRunner.query(`DROP TYPE IF EXISTS trade_status`);
    await queryRunner.query(`ALTER TABLE portfolios DROP COLUMN IF EXISTS realized_pnl`);
    await queryRunner.query(`ALTER TABLE holdings DROP COLUMN IF EXISTS realized_pnl`);
  }
}
