"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, TrendingUp, Carrot, UtensilsCrossed, Truck, CalendarCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Ingredient, MenuItem } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// =====================
// 発注スケジュール用型定義
// =====================
type Supplier = { id: string; name: string; order_days: number[] };
type IngredientWithStock = Ingredient & { suppliers?: string[], isCRankDependent?: boolean };

// 現在在庫の状態判定
// 🔴 不足: current_stock < threshold
// 🟡 要注意: threshold <= current_stock < threshold * 2
type StockLevel = "shortage" | "warning" | "ok";
const getStockLevel = (current: number, threshold: number): StockLevel => {
    if (current < threshold) return "shortage";
    if (threshold > 0 && current < threshold * 2) return "warning";
    return "ok";
};

// 曜日ラベル
const DAY_LABELS: Record<number, string> = {
    0: "日曜", 1: "月曜", 2: "火曜", 3: "水曜", 4: "木曜", 5: "金曜", 6: "土曜", 7: "月初",
};

export default function Dashboard() {
    const [warnings, setWarnings] = useState<Ingredient[]>([]);
    const [stats, setStats] = useState({ todaySales: 0, activeIngredients: 0, activeMenus: 0 });
    const [isLoading, setIsLoading] = useState(true);

    // 発注スケジュール
    const [todaySuppliers, setTodaySuppliers] = useState<Supplier[]>([]);
    const [supplierIngredients, setSupplierIngredients] = useState<Record<string, IngredientWithStock[]>>({});
    const [scheduleLoading, setScheduleLoading] = useState(true);
    const [todayLabel, setTodayLabel] = useState("");

    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);

            // 1. 在庫警告
            const { data: ingData } = await supabase.from("ingredients").select("*").eq("is_active", true);
            if (ingData) {
                setWarnings(ingData.filter(i => i.current_stock < i.threshold));
                setStats(s => ({ ...s, activeIngredients: ingData.length }));
            }

            // 2. アクティブなメニュー数
            const { count: menuCount } = await supabase.from("menu_items").select("*", { count: "exact", head: true }).eq("is_active", true);
            if (menuCount !== null) setStats(s => ({ ...s, activeMenus: menuCount }));

            // 3. 本日の売上
            const today = new Date().toISOString().split("T")[0];
            const { data: salesData } = await supabase.from("daily_sales").select("quantity_sold, menu_item_id").eq("date", today);
            if (salesData && salesData.length > 0) {
                const { data: allMenus } = await supabase.from("menu_items").select("id, price");
                if (allMenus) {
                    const menuPriceMap = new Map((allMenus as any[]).map((m) => [m.id, m.price]));
                    const totalSales = salesData.reduce((acc: number, sale: { quantity_sold: number; menu_item_id: string }) => {
                        return acc + (menuPriceMap.get(sale.menu_item_id) || 0) * sale.quantity_sold;
                    }, 0);
                    setStats(s => ({ ...s, todaySales: totalSales }));
                }
            }
            setIsLoading(false);
        };
        fetchDashboardData();
    }, []);

    // 発注スケジュールのフェッチ
    useEffect(() => {
        const fetchSchedule = async () => {
            setScheduleLoading(true);
            const now = new Date();
            const jsDay = now.getDay(); // 0=日〜6=土
            const dayOfMonth = now.getDate();
            const isMonthStart = dayOfMonth === 1;

            // 今日が何の発注日か（月初+曜日両方チェック）
            const targetDays = new Set<number>([jsDay]);
            if (isMonthStart) targetDays.add(7);

            const label = isMonthStart
                ? `${dayOfMonth}日（月初・${DAY_LABELS[jsDay]}）`
                : `${DAY_LABELS[jsDay]}（${now.getMonth() + 1}/${dayOfMonth}）`;
            setTodayLabel(label);

            // 今日の発注業者を取得（order_days の重複チェック）
            const { data: allSuppliers } = await supabase.from("suppliers").select("*");
            if (!allSuppliers) { setScheduleLoading(false); return; }

            const todaySupp = allSuppliers.filter((s: Supplier) =>
                s.order_days && s.order_days.some((d: number) => targetDays.has(d))
            );
            setTodaySuppliers(todaySupp);

            if (todaySupp.length === 0) { setScheduleLoading(false); return; }

            // 各業者に紐づく食材（在庫不足 or 閾値に近い）を取得
            const suppIds = todaySupp.map((s: Supplier) => s.id);

            // ingredient_suppliersから業者IDに紐づく食材IDを取得
            const { data: isRows } = await supabase
                .from("ingredient_suppliers")
                .select("ingredient_id, supplier_id")
                .in("supplier_id", suppIds);

            if (!isRows) { setScheduleLoading(false); return; }

            // 食材一覧取得
            const ingIds = [...new Set(isRows.map((r: any) => r.ingredient_id))];
            let allIngData: Ingredient[] = [];
            if (ingIds.length > 0) {
                const { data } = await supabase.from("ingredients").select("*").in("id", ingIds).eq("is_active", true);
                allIngData = data || [];
            }

            // =====================================
            // Cランクメニューの特定（利益ベースABC分析に基づく）
            // =====================================
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const dStr = thirtyDaysAgo.toISOString().split("T")[0];

            // 過去30日の売上
            const { data: recentSales } = await supabase.from("daily_sales").select("menu_item_id, quantity_sold").gte("date", dStr);
            const { data: allMenusAndRecipes } = await supabase.from("menu_items").select(`id, price, recipes(ingredient_id, quantity_required, ingredient:ingredients(unit_cost))`).eq("is_active", true);

            const cRankIngredientIds = new Set<string>();
            if (recentSales && allMenusAndRecipes) {
                let totalGrossProfitAll = 0;
                const menuProfits = allMenusAndRecipes.map((menu: any) => {
                    const salesQty = recentSales.filter((s: any) => s.menu_item_id === menu.id).reduce((sum, s) => sum + s.quantity_sold, 0);
                    // 原価計算
                    const unitCost = (menu.recipes || []).reduce((sum: number, r: any) => sum + ((r.ingredient?.unit_cost || 0) * r.quantity_required), 0);
                    const grossProfit = Math.max(0, menu.price - unitCost) * salesQty;
                    totalGrossProfitAll += grossProfit;
                    return { id: menu.id, grossProfit, recipes: menu.recipes };
                }).sort((a, b) => b.grossProfit - a.grossProfit);

                let cumulative = 0;
                const cRankMenuIds = new Set(menuProfits.map(menu => {
                    cumulative += menu.grossProfit;
                    const percentage = totalGrossProfitAll > 0 ? (cumulative / totalGrossProfitAll) * 100 : 0;
                    if (percentage > 90) return menu.id; // Cランク
                    return null;
                }).filter(Boolean));

                // Cランクメニューに使われている食材IDをまとめる
                allMenusAndRecipes.forEach((menu: any) => {
                    if (cRankMenuIds.has(menu.id)) {
                        (menu.recipes || []).forEach((r: any) => cRankIngredientIds.add(r.ingredient_id));
                    }
                });
            }

            // =====================================
            // 業者ごとに食材をグループ化（在庫不足 or 閾値×2未満のみ）
            // =====================================
            const map: Record<string, IngredientWithStock[]> = {};
            for (const s of todaySupp) {
                const ingIdsForSupp = isRows.filter((r: any) => r.supplier_id === s.id).map((r: any) => r.ingredient_id);
                const filtered = allIngData
                    .filter(ing => ingIdsForSupp.includes(ing.id) && getStockLevel(ing.current_stock, ing.threshold) !== "ok")
                    .map(ing => ({ ...ing, isCRankDependent: cRankIngredientIds.has(ing.id) }))
                    .sort((a, b) => a.current_stock - a.threshold - (b.current_stock - b.threshold));
                map[s.id] = filtered;
            }
            setSupplierIngredients(map);
            setScheduleLoading(false);
        };
        fetchSchedule();
    }, []);

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">ダッシュボード</h2>
                <p className="text-muted-foreground">システムサマリーと在庫アラート</p>
            </div>

            {/* ===== KPI ===== */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className={warnings.length > 0 ? "border-destructive/50 bg-destructive/5" : ""}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">在庫警告</CardTitle>
                        <AlertTriangle className={`h-4 w-4 ${warnings.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${warnings.length > 0 ? "text-destructive" : ""}`}>
                            {isLoading ? "-" : `${warnings.length} 件`}
                        </div>
                        <p className="text-xs text-muted-foreground">閾値を下回っている食材</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">本日の売上（概算）</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? "-" : `¥${stats.todaySales.toLocaleString()}`}</div>
                        <p className="text-xs text-muted-foreground">今日入力された売上合計</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">登録食材数</CardTitle>
                        <Carrot className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? "-" : stats.activeIngredients}</div>
                        <p className="text-xs text-muted-foreground">使用中のアクティブな食材</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">提供メニュー数</CardTitle>
                        <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? "-" : stats.activeMenus}</div>
                        <p className="text-xs text-muted-foreground">販売中のメニュー</p>
                    </CardContent>
                </Card>
            </div>

            {/* ===== 在庫警告 + 発注スケジュール ===== */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* 発注が必要な食材 */}
                <Card className="col-span-4 border-destructive/20 border-2">
                    <CardHeader className="bg-destructive/5">
                        <CardTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="w-5 h-5" />
                            発注が必要な食材
                        </CardTitle>
                        <CardDescription>現在庫が発注点（閾値）を下回っているため、補充が必要です。</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {isLoading ? (
                            <div className="text-sm text-center py-6 text-muted-foreground">読み込み中...</div>
                        ) : warnings.length === 0 ? (
                            <div className="text-sm text-center py-6 text-muted-foreground">現在、在庫不足の食材はありません。</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>食材名</TableHead>
                                        <TableHead>現在庫</TableHead>
                                        <TableHead>発注アラート閾値</TableHead>
                                        <TableHead>不足分</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {warnings.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-bold">{item.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="destructive" className="text-sm px-2">
                                                    {item.current_stock} <span className="ml-1 text-xs opacity-80">{item.unit}</span>
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {item.threshold} <span className="text-xs">{item.unit}</span>
                                            </TableCell>
                                            <TableCell className="font-medium text-destructive">
                                                {item.threshold - item.current_stock} <span className="text-xs opacity-80">{item.unit}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* システム情報 */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>最近の操作・システム情報</CardTitle>
                        <CardDescription>設定や棚卸の状況</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm space-y-4">
                            <div className="p-4 bg-muted/50 rounded-lg">
                                <p className="font-semibold mb-1">💡 使い方：</p>
                                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                    <li><strong>月末の実地棚卸</strong> で在庫を正し、</li>
                                    <li><strong>日次売上</strong> を入力すると自動減算されます。</li>
                                    <li>新しい商品は <strong>食材/メニュー管理</strong> から登録してください。</li>
                                </ul>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ===== 今日の発注スケジュール ===== */}
            <Card>
                <CardHeader className="bg-primary/5 border-b">
                    <CardTitle className="flex items-center gap-2 text-primary">
                        <CalendarCheck className="w-5 h-5" />
                        今日の発注スケジュール
                        {todayLabel && (
                            <Badge variant="outline" className="ml-2 font-normal text-xs">{todayLabel}</Badge>
                        )}
                    </CardTitle>
                    <CardDescription>
                        🔴 在庫不足（閾値未満）　🟡 要注意（閾値の2倍未満）の食材を業者別に表示しています
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-5">
                    {scheduleLoading ? (
                        <p className="text-sm text-muted-foreground text-center py-6">読み込み中...</p>
                    ) : todaySuppliers.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">今日は発注予定の業者がありません。</p>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {todaySuppliers.map(s => {
                                const ings = supplierIngredients[s.id] || [];
                                return (
                                    <div key={s.id} className="border rounded-lg overflow-hidden">
                                        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 font-semibold text-sm border-b">
                                            <Truck className="w-4 h-4 shrink-0 text-muted-foreground" />
                                            {s.name}
                                        </div>
                                        {ings.length === 0 ? (
                                            <p className="text-xs text-muted-foreground px-4 py-3">✅ 発注が必要な食材はありません</p>
                                        ) : (
                                            <ul className="divide-y">
                                                {ings.map(ing => {
                                                    const level = getStockLevel(ing.current_stock, ing.threshold);
                                                    return (
                                                        <li key={ing.id} className="flex items-center justify-between px-4 py-2 text-sm flex-wrap gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <span>{level === "shortage" ? "🔴" : "🟡"}</span>
                                                                <span className="font-medium">{ing.name}</span>
                                                                {ing.isCRankDependent && (
                                                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 border-destructive/50 text-destructive/80 bg-destructive/10">
                                                                        ⚠️ 見直し推奨 (Cランク使用)
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-right shrink-0 ml-auto">
                                                                <span className={level === "shortage" ? "text-destructive font-bold" : "text-yellow-600 font-bold"}>
                                                                    {ing.current_stock}
                                                                </span>
                                                                <span className="text-muted-foreground">/{ing.threshold} {ing.unit}</span>
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
