"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { MenuItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Save, Trash2, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type DailySaleHistory = {
    id: string;
    date: string;
    quantity_sold: number;
    created_at: string;
    menu_item: {
        id: string;
        name: string;
        is_active: boolean;
    };
};

export default function SalesPage() {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

    // メニューIDをキーにした売上数量
    const [salesData, setSalesData] = useState<Record<string, string>>({});

    // 最近の売上履歴
    const [salesHistory, setSalesHistory] = useState<DailySaleHistory[]>([]);

    const fetchMenuAndHistory = async () => {
        setIsLoading(true);
        // メニュー一覧（is_activeを問わずすべて取得し、入力用グループ分けと履歴表示の両方で使う）
        // ※ただし、入力画面には is_active=true しか出さない
        const { data: menuData, error: menuError } = await supabase
            .from("menu_items")
            .select("*")
            .order("category")
            .order("name");

        if (menuError) {
            toast.error("メニューの取得に失敗しました");
        } else {
            setMenuItems(menuData || []);
        }

        // 直近の売上履歴を取得 (最大50件)
        const { data: historyData, error: historyError } = await supabase
            .from("daily_sales")
            .select(`
                id, date, quantity_sold, created_at,
                menu_item:menu_items(id, name, is_active)
            `)
            .order("created_at", { ascending: false })
            .limit(50);

        if (!historyError && historyData) {
            // 型を合わせるためのキャスト
            // (menu_itemsは単一オブジェクトとして取得される設定になっているはずなので as any 等を利用)
            setSalesHistory(historyData as any as DailySaleHistory[]);
        }

        setIsLoading(false);
    };

    useEffect(() => {
        fetchMenuAndHistory();
    }, []);

    const handleInputChange = (id: string, value: string) => {
        setSalesData(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = async () => {
        if (!selectedDate) {
            toast.error("日付を選択してください");
            return;
        }

        setIsSaving(true);
        let successCount = 0;
        let errorCount = 0;

        const entries = Object.entries(salesData).filter(([_, qtyStr]) => {
            const q = Number(qtyStr);
            return !isNaN(q) && q > 0;
        });

        if (entries.length === 0) {
            toast.warning("販売数量が入力されていません");
            setIsSaving(false);
            return;
        }

        // 各売上アイテムとそれに紐づく在庫の減算処理
        for (const [menuId, qtyStr] of entries) {
            const quantitySold = Number(qtyStr);

            // 1. 売上を記録
            const { error: salesError } = await supabase
                .from("daily_sales")
                .insert([{
                    date: selectedDate,
                    menu_item_id: menuId,
                    quantity_sold: quantitySold,
                }]);

            if (salesError) {
                errorCount++;
                continue;
            }

            // 2. このメニューのレシピ（必要な食材と量）を取得
            const { data: recipes, error: recipeError } = await supabase
                .from("recipes")
                .select("ingredient_id, quantity_required")
                .eq("menu_item_id", menuId);

            if (!recipeError && recipes) {
                // 3. 各食材の在庫を減算 (理論在庫の更新)
                for (const recipe of recipes) {
                    const totalUsed = recipe.quantity_required * quantitySold;

                    // ingredient の現在の stock を取得して減算 (MVPではRPCを使っていないためフロントで2回通信するが、許容範囲)
                    const { data: ingData } = await supabase
                        .from("ingredients")
                        .select("current_stock")
                        .eq("id", recipe.ingredient_id)
                        .single();

                    if (ingData) {
                        const newStock = ingData.current_stock - totalUsed;
                        await supabase
                            .from("ingredients")
                            .update({ current_stock: newStock })
                            .eq("id", recipe.ingredient_id);
                    }
                }
            }

            successCount++;
        }

        if (errorCount > 0) {
            toast.error(`一部の売上入力に失敗しました (${errorCount}件)`);
        } else {
            toast.success(`${successCount}件の売上を記録し、理論在庫を減算しました`);
            setSalesData({}); // 入力をクリア
            fetchMenuAndHistory(); // 履歴を更新
        }

        setIsSaving(false);
    };

    // 売上履歴の削除（同時に理論在庫をロールバック）
    const handleDeleteHistory = async (historyId: string, menuId: string, quantitySold: number) => {
        if (!confirm("この売上記録を削除しますか？\n※関連する食材の在庫が自動的に元に戻ります（ロールバック）")) return;

        setIsLoading(true);
        try {
            // 1. レシピを取得して在庫をロールバック
            const { data: recipes, error: recipeError } = await supabase
                .from("recipes")
                .select("ingredient_id, quantity_required")
                .eq("menu_item_id", menuId);

            if (recipeError) throw recipeError;

            if (recipes) {
                for (const recipe of recipes) {
                    const totalUsed = recipe.quantity_required * quantitySold;

                    const { data: ingData } = await supabase
                        .from("ingredients")
                        .select("current_stock")
                        .eq("id", recipe.ingredient_id)
                        .single();

                    if (ingData) {
                        const newStock = ingData.current_stock + totalUsed; // ロールバックなので加算
                        await supabase
                            .from("ingredients")
                            .update({ current_stock: newStock })
                            .eq("id", recipe.ingredient_id);
                    }
                }
            }

            // 2. 履歴（daily_sales）の削除
            const { error: deleteError } = await supabase
                .from("daily_sales")
                .delete()
                .eq("id", historyId);

            if (deleteError) throw deleteError;

            toast.success("売上記録を削除し、在庫を元に戻しました");
            fetchMenuAndHistory();
        } catch (e) {
            console.error(e);
            toast.error("削除処理に失敗しました");
            setIsLoading(false);
        }
    };

    // カテゴリごとにメニューをグループ化 (アクティブなメニューだけ入力欄に出す)
    const activeMenuOnly = menuItems.filter(m => m.is_active);
    const groupedMenu = activeMenuOnly.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, MenuItem[]>);

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">日次売上入力</h2>
                    <p className="text-muted-foreground">売上数を入力すると、レシピに基づき自動で在庫が減算されます。</p>
                </div>
            </div>

            <Card>
                <CardHeader className="bg-muted/50 pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-primary" />
                        売上日の選択
                    </CardTitle>
                    <CardDescription>入力する売上情報を紐付ける日付を指定してください</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                    <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full md:w-64 h-12 text-lg"
                    />
                </CardContent>
            </Card>

            <div className="space-y-6">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-xl font-bold">メニュー別 販売数</h3>
                    <Button size="lg" onClick={handleSave} disabled={isLoading || isSaving} className="hidden md:flex">
                        <Save className="w-5 h-5 mr-2" />
                        {isSaving ? "保存中..." : "売上を登録して在庫を減算"}
                    </Button>
                </div>

                {isLoading ? (
                    <div className="text-center p-12 border rounded-xl bg-card text-muted-foreground">読み込み中...</div>
                ) : menuItems.length === 0 ? (
                    <div className="text-center p-12 border rounded-xl bg-card text-muted-foreground">メニューが登録されていません</div>
                ) : (
                    Object.entries(groupedMenu).map(([category, items]) => (
                        <div key={category} className="border rounded-xl bg-card overflow-hidden shadow-sm">
                            <div className="bg-muted px-4 py-3 font-semibold text-sm">{category}</div>
                            <div className="divide-y">
                                {items.map(item => (
                                    <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <h4 className="font-bold text-lg">{item.name}</h4>
                                            <p className="text-muted-foreground text-sm">¥{item.price.toLocaleString()}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                value={salesData[item.id] || ""}
                                                onChange={(e) => handleInputChange(item.id, e.target.value)}
                                                className="text-2xl text-right font-bold w-full sm:w-32 h-16"
                                                inputMode="decimal"
                                                pattern="[0-9]*"
                                            />
                                            <span className="w-8 text-muted-foreground font-medium">食</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* モバイル用固定ボタン */}
            <div className="fixed bottom-6 right-6 md:hidden">
                <Button size="lg" className="rounded-full shadow-lg h-14 px-6 text-lg" onClick={handleSave} disabled={isLoading || isSaving}>
                    <Save className="w-6 h-6 mr-2" />
                    保存
                </Button>
            </div>

            <div className="pt-8">
                <Card>
                    <CardHeader className="bg-muted/30 pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            最近の入力履歴（訂正）
                        </CardTitle>
                        <CardDescription>入力した売上情報を取り消したい場合は、ここから削除してください。在庫も自動で元に戻ります。</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 border-t">
                        <Table className="hidden md:table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>入力日時</TableHead>
                                    <TableHead>売上日</TableHead>
                                    <TableHead>メニュー</TableHead>
                                    <TableHead className="text-right">販売数</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {salesHistory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">履歴がありません</TableCell>
                                    </TableRow>
                                ) : (
                                    salesHistory.map((history) => (
                                        <TableRow key={history.id}>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {format(new Date(history.created_at), "MM/dd HH:mm")}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {format(new Date(history.date), "yyyy/MM/dd")}
                                            </TableCell>
                                            <TableCell>
                                                {history.menu_item?.name || "不明なメニュー"}
                                                {!history.menu_item?.is_active && (
                                                    <span className="ml-2 text-xs text-destructive font-bold">(販売終了)</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">{history.quantity_sold} 食</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDeleteHistory(history.id, history.menu_item.id, history.quantity_sold)}
                                                >
                                                    <Trash2 className="w-4 h-4 mr-1" />
                                                    取消
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>

                        {/* モバイル向けカード形式の履歴リスト */}
                        <div className="md:hidden flex flex-col gap-3 p-4">
                            {salesHistory.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">履歴がありません</div>
                            ) : (
                                salesHistory.map((history) => (
                                    <div key={history.id} className="border rounded-lg p-4 shadow-sm bg-card flex flex-col gap-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="text-xs text-muted-foreground flex gap-2">
                                                    <span>入力: {format(new Date(history.created_at), "MM/dd HH:mm")}</span>
                                                    <span>売上: {format(new Date(history.date), "MM/dd")}</span>
                                                </div>
                                                <div className="font-bold text-lg mt-1">
                                                    {history.menu_item?.name || "不明なメニュー"}
                                                    {!history.menu_item?.is_active && (
                                                        <span className="ml-2 text-xs text-destructive font-bold">(終了)</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-lg text-primary">
                                                    {history.quantity_sold} <span className="text-sm font-normal text-muted-foreground">食</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex justify-end pt-2 border-t mt-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive border-destructive/30 hover:bg-destructive hover:text-white"
                                                onClick={() => handleDeleteHistory(history.id, history.menu_item.id, history.quantity_sold)}
                                            >
                                                <Trash2 className="w-4 h-4 mr-1" />
                                                取消（在庫を戻す）
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="h-20 md:h-0"></div> {/* モバイルスクロールバッファ */}
        </div>
    );
}
