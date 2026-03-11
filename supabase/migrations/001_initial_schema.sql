-- 1. ingredients (食材マスタ)
CREATE TABLE public.ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit TEXT NOT NULL, -- 単位 (例: g, ml, 個)
    threshold NUMERIC NOT NULL DEFAULT 0, -- 発注アラート閾値
    current_stock NUMERIC NOT NULL DEFAULT 0, -- 現在庫
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- 使用停止フラグ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. menu_items (メニューマスタ)
CREATE TABLE public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- 販売終了フラグ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. recipes (レシピ - 中間テーブル)
-- どのメニューに、どの食材が、どれだけ必要か
CREATE TABLE public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
    quantity_required NUMERIC NOT NULL, -- 必要な量 (1食あたり)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(menu_item_id, ingredient_id)
);

-- 4. inventory_logs (棚卸記録)
CREATE TABLE public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
    actual_quantity NUMERIC NOT NULL, -- 実測の在庫量
    counted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- 棚卸実行日時
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. daily_sales (売上記録)
CREATE TABLE public.daily_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE, -- 売上日
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    quantity_sold INTEGER NOT NULL DEFAULT 0, -- 販売数
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 行レベルセキュリティ (RLS) の有効化 (MVPではフルアクセス許可)
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access" ON public.ingredients FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access" ON public.ingredients FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access" ON public.ingredients FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access" ON public.ingredients FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read access" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access" ON public.menu_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access" ON public.menu_items FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access" ON public.menu_items FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read access" ON public.recipes FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access" ON public.recipes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access" ON public.recipes FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access" ON public.recipes FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read access" ON public.inventory_logs FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access" ON public.inventory_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access" ON public.inventory_logs FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access" ON public.inventory_logs FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read access" ON public.daily_sales FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access" ON public.daily_sales FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access" ON public.daily_sales FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access" ON public.daily_sales FOR DELETE USING (true);

-- Functions & Triggers for updated_at (optional but good practice)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ingredients_modtime
BEFORE UPDATE ON public.ingredients
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_menu_items_modtime
BEFORE UPDATE ON public.menu_items
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
