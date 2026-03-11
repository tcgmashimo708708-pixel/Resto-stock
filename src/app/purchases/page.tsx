"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Ingredient } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Save, RefreshCw, Truck, Trash2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

type PurchaseHistory = {
    id: string;
    ingredient_id: string;
    purchased_quantity: number;
    purchased_at: string;
    created_at: string;
    ingredient: {
        id: string;
        name: string;
        unit: string;
    };
};

export default function PurchasesPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // 仕入日 (YYYY-MM-DD形式、デフォルトは今日)
    const [purchaseDate, setPurchaseDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    );

    // 食材IDをキーにした入力値（仕入量と仕入単価）
    const [inputValues, setInputValues] = useState<Record<string, { qty: string, cost: string }>>({});

    // 最近の仕入履歴
    const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistory[]>([]);

    const fetchIngredientsAndHistory = async () => {
        setIsLoading(true);
        // 食材一覧の取得
        const { data: ingredientData, error: ingredientError } = await supabase
            .from("ingredients")
            .select("*")
            .eq("is_active", true)
            .order("name");

        if (ingredientError) {
            toast.error("食材の取得に失敗しました");
            console.error(ingredientError);
        } else {
            setIngredients(ingredientData || []);
            // リロード時に初期値をセット (数量は空、単価はDBの値)
            const initialValues: Record<string, { qty: string, cost: string }> = {};
            ingredientData?.forEach(item => {
                initialValues[item.id] = {
                    qty: "",
                    cost: item.unit_cost !== null ? String(item.unit_cost) : "0"
                };
            });
            setInputValues(initialValues);
        }

        // 直近の仕入履歴を取得 (最大50件)
        const { data: historyData, error: historyError } = await supabase
            .from("purchase_logs")
            .select(`
                id, ingredient_id, purchased_quantity, purchased_at, created_at,
                ingredient:ingredients(id, name, unit)
            `)
            .order("created_at", { ascending: false })
            .limit(50);

        if (!historyError && historyData) {
            setPurchaseHistory(historyData as any as PurchaseHistory[]);
        }

        setIsLoading(false);
    };

    useEffect(() => {
        fetchIngredientsAndHistory();
    }, []);

    const handleInputChange = (id: string, field: 'qty' | 'cost', value: string) => {
        setInputValues(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: value
            }
        }));
    };

    // 全ての変更を一括で保存する
    const handleSaveAll = async () => {
        setIsSaving(true);
        let successCount = 0;
        let errorCount = 0;

        for (const item of ingredients) {
            const inputData = inputValues[item.id];
            if (!inputData) continue;

            const addedValueStr = inputData.qty;
            if (addedValueStr === undefined || addedValueStr === "") continue;

            const addedStock = Number(addedValueStr);
            if (isNaN(addedStock) || addedStock <= 0) continue; // 仕入量が0以下の場合は無視

            const costStr = inputData.cost;
            const newCost = costStr !== "" && !isNaN(Number(costStr)) ? Number(costStr) : item.unit_cost;

            // 1. purchase_logs に記録
            const { error: logError } = await supabase
                .from("purchase_logs")
                .insert([{
                    ingredient_id: item.id,
                    purchased_quantity: addedStock,
                    purchased_at: new Date(purchaseDate).toISOString(),
                }]);

            if (logError) {
                console.error("Purchase log target error:", logError);
                errorCount++;
                continue;
            }

            // 2. ingredients の current_stock と unit_cost を更新
            const newStock = Number(item.current_stock) + addedStock;
            const { error: updateError } = await supabase
                .from("ingredients")
                .update({ current_stock: newStock, unit_cost: newCost })
                .eq("id", item.id);

            if (updateError) {
                errorCount++;
            } else {
                successCount++;
            }
        }

        if (errorCount > 0) {
            toast.error(`${errorCount}件の仕入登録に失敗しました`);
        }
        if (successCount > 0) {
            toast.success(`${successCount}件の仕入れを登録し、在庫を加算しました`);
            fetchIngredientsAndHistory(); // 最新データを再取得 + 入力リセット
        } else if (errorCount === 0) {
            toast.info("入力されたデータはありません");
        }

        setIsSaving(false);
    };

    // 仕入履歴の削除（同時に現在庫をロールバック）
    const handleDeleteHistory = async (historyId: string, ingredientId: string, purchasedQty: number) => {
        if (!confirm("この仕入記録を削除しますか？\n※加算された在庫が自動的に元に戻ります（ロールバック）")) return;

        setIsLoading(true);
        try {
            // 1. 対象食材の現在庫を取得して減算
            const { data: ingData } = await supabase
                .from("ingredients")
                .select("current_stock")
                .eq("id", ingredientId)
                .single();

            if (ingData) {
                const newStock = ingData.current_stock - purchasedQty; // ロールバックなので減算
                await supabase
                    .from("ingredients")
                    .update({ current_stock: newStock })
                    .eq("id", ingredientId);
            }

            // 2. 履歴（purchase_logs）の削除
            const { error: deleteError } = await supabase
                .from("purchase_logs")
                .delete()
                .eq("id", historyId);

            if (deleteError) throw deleteError;

            toast.success("仕入記録を削除し、在庫を元に戻しました");
            fetchIngredientsAndHistory();
        } catch (e) {
            console.error(e);
            toast.error("削除処理に失敗しました");
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">仕入入力</h2>
                    <p className="text-muted-foreground">納品された食材の数量を入力してください。入力した数が現在の在庫に加算されます。</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="outline" size="lg" onClick={fetchIngredientsAndHistory} disabled={isLoading || isSaving} className="flex-1 md:flex-none">
                        <RefreshCw className={`w-5 h-5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        再読み込み
                    </Button>
                    <Button size="lg" onClick={handleSaveAll} disabled={isLoading || isSaving} className="flex-1 md:flex-none">
                        <Save className="w-5 h-5 mr-2" />
                        {isSaving ? "保存中..." : "一括登録"}
                    </Button>
                </div>
            </div>

            <div className="bg-card border rounded-xl p-4 sm:p-6 mb-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex-1">
                        <h3 className="text-lg font-bold">仕入日</h3>
                        <p className="text-sm text-muted-foreground">食材が入荷した日付を選択してください</p>
                    </div>
                    <Input
                        type="date"
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                        className="w-full sm:w-48 text-lg font-semibold"
                    />
                </div>
            </div>

            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                {isLoading ? (
                    <div className="p-8 text-center text-muted-foreground">読み込み中...</div>
                ) : ingredients.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">食材が登録されていません</div>
                ) : (
                    <div className="divide-y">
                        {ingredients.map((item) => (
                            <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <h3 className="text-lg font-bold">{item.name}</h3>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        現在の在庫: {item.current_stock} {item.unit}
                                        <span className="ml-3 truncate">現在の単価: ¥{item.unit_cost}</span>
                                        {item.current_stock < item.threshold && (
                                            <span className="ml-2 text-destructive font-bold">(発注警告)</span>
                                        )}
                                    </p>
                                </div>

                                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full md:w-auto mt-2 md:mt-0">
                                    <div className="flex flex-col items-end sm:items-start w-full sm:w-auto">
                                        <label className="text-xs text-muted-foreground mb-1">仕入数量</label>
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <div className="relative flex-1 sm:flex-none">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">+</span>
                                                <Input
                                                    type="number"
                                                    value={inputValues[item.id]?.qty ?? ""}
                                                    onChange={(e) => handleInputChange(item.id, 'qty', e.target.value)}
                                                    className="text-xl text-right font-bold w-full sm:w-32 h-12 pl-8"
                                                    placeholder="0"
                                                    min="0"
                                                    inputMode="decimal"
                                                    pattern="[0-9]*"
                                                />
                                            </div>
                                            <span className="text-sm font-medium w-8 text-muted-foreground">{item.unit}</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end sm:items-start w-full sm:w-auto border-t sm:border-t-0 sm:border-l sm:pl-4 pt-2 sm:pt-0">
                                        <label className="text-xs text-muted-foreground mb-1">単価(上書き)</label>
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <div className="relative flex-1 sm:flex-none">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">¥</span>
                                                <Input
                                                    type="number"
                                                    value={inputValues[item.id]?.cost ?? ""}
                                                    onChange={(e) => handleInputChange(item.id, 'cost', e.target.value)}
                                                    className="text-xl text-right font-bold w-full sm:w-32 h-12 pl-8"
                                                    min="0"
                                                    inputMode="decimal"
                                                    pattern="[0-9]*"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* タブレット用のフローティング保存ボタン（画面下部固定）※画面が小さい時のみ表示 */}
            <div className="fixed bottom-6 right-6 md:hidden">
                <Button size="lg" className="rounded-full shadow-lg h-14 px-6 text-lg" onClick={handleSaveAll} disabled={isLoading || isSaving}>
                    <Save className="w-6 h-6 mr-2" />
                    保存
                </Button>
            </div>
            <div className="pt-8 mb-20 md:mb-0">
                <Card>
                    <CardHeader className="bg-muted/30 pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            最近の仕入履歴（訂正）
                        </CardTitle>
                        <CardDescription>誤って入力した仕入れ情報を取り消したい場合は、ここから削除してください。在庫も自動で減算されて元に戻ります。</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 border-t">
                        <Table className="hidden md:table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>入力日時</TableHead>
                                    <TableHead>仕入日</TableHead>
                                    <TableHead>食材</TableHead>
                                    <TableHead className="text-right">仕入数</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {purchaseHistory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">履歴がありません</TableCell>
                                    </TableRow>
                                ) : (
                                    purchaseHistory.map((history) => (
                                        <TableRow key={history.id}>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {format(new Date(history.created_at), "MM/dd HH:mm")}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {format(new Date(history.purchased_at), "yyyy/MM/dd")}
                                            </TableCell>
                                            <TableCell>
                                                {history.ingredient?.name || "不明な食材"}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                {history.purchased_quantity} {history.ingredient?.unit}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDeleteHistory(history.id, history.ingredient_id, history.purchased_quantity)}
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
                            {purchaseHistory.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">履歴がありません</div>
                            ) : (
                                purchaseHistory.map((history) => (
                                    <div key={history.id} className="border rounded-lg p-4 shadow-sm bg-card flex flex-col gap-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="text-xs text-muted-foreground flex gap-2">
                                                    <span>入力: {format(new Date(history.created_at), "MM/dd HH:mm")}</span>
                                                    <span>仕入: {format(new Date(history.purchased_at), "MM/dd")}</span>
                                                </div>
                                                <div className="font-bold text-lg mt-1">{history.ingredient?.name || "不明な食材"}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-lg text-primary">
                                                    {history.purchased_quantity} <span className="text-sm font-normal text-muted-foreground">{history.ingredient?.unit}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex justify-end pt-2 border-t mt-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive border-destructive/30 hover:bg-destructive hover:text-white"
                                                onClick={() => handleDeleteHistory(history.id, history.ingredient_id, history.purchased_quantity)}
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
        </div>
    );
}
