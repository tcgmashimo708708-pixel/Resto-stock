-- =============================================
-- 004: 業者管理テーブルの追加（発注スケジュール機能）
-- =============================================

-- 1. 業者テーブル
-- order_days: 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土, 7=月初一括
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    order_days INTEGER[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 食材-業者の中間テーブル
CREATE TABLE IF NOT EXISTS ingredient_suppliers (
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    PRIMARY KEY (ingredient_id, supplier_id)
);

-- 3. 業者の初期データを挿入
-- 同一業者が複数曜日に出る場合は order_days にまとめる

INSERT INTO suppliers (name, order_days) VALUES
    ('トーホー',       ARRAY[1, 3]),       -- 月・水
    ('オルビス',       ARRAY[1, 3, 4, 5, 0]),  -- 月・水・木・金・日
    ('GVS',           ARRAY[2, 6]),       -- 火・土
    ('本社倉庫',       ARRAY[2, 0]),       -- 火・日
    ('高瀬物産',       ARRAY[2, 4, 0]),    -- 火・木・日
    ('めいらく',       ARRAY[3, 0]),       -- 水・日
    ('タカナシ',       ARRAY[4, 6]),       -- 木・土
    ('中沢酒店',       ARRAY[7]),          -- 月初
    ('榛名倶楽部',     ARRAY[7]),          -- 月初
    ('町田商店',       ARRAY[7]),          -- 月初
    ('UCC',           ARRAY[7]),          -- 月初
    ('陶豆屋',         ARRAY[7])           -- 月初
ON CONFLICT (name) DO UPDATE SET order_days = EXCLUDED.order_days;
