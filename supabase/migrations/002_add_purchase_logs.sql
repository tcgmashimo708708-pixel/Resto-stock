-- 6. purchase_logs (仕入記録)
CREATE TABLE public.purchase_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
    purchased_quantity NUMERIC NOT NULL, -- 仕入れた量
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- 仕入れ日時
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 行レベルセキュリティ (RLS) の有効化 (MVPではフルアクセス許可)
ALTER TABLE public.purchase_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access" ON public.purchase_logs FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access" ON public.purchase_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access" ON public.purchase_logs FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access" ON public.purchase_logs FOR DELETE USING (true);
