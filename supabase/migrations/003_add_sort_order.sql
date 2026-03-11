-- 食材テーブルに並び順カラムを追加
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- メニューテーブルに並び順カラムを追加
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sort_order INTEGER;
