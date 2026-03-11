-- =============================================
-- 005: 食材テーブルに仕入単価カラムを追加（原価管理・粗利分析用）
-- =============================================

-- ingredients テーブルに unit_cost (仕入単価) カラムを追加
ALTER TABLE ingredients
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 既存の食材データに対して仮の仕入単価を設定する場合（運用に合わせて後から画面で修正可能）
-- UPDATE ingredients SET unit_cost = 0 WHERE unit_cost IS NULL;
