"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Ingredient } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Save, RefreshCw, Trash2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

type InventoryHistory = {
    id: string;
    ingredient_id: string;
    actual_quantity: number;
    counted_at: string;
    ingredient: {
        id: string;
        name: string;
        unit: string;
    };
};

export default function InventoryPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // 対象の月度 (YYYY-MM形式、デフォルトは今月)
    const [targetMonth, setTargetMonth] = useState<string>(new Date().toISOString().slice(0, 7));

    // 食材IDをキーにした入力値（文字列として保持し、入力中の空文字などを許容する）
    const [inputValues, setInputValues] = useState<Record<string, string>>({});

    // 最近の棚卸履歴
    const [inventoryHistory, setInventoryHistory] = useState<InventoryHistory[]>([]);

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
            // 現在庫を初期値としてセット
            const initialValues: Record<string, string> = {};
            ingredientData?.forEach(item => {
                initialValues[item.id] = String(item.current_stock);
            });
            setInputValues(initialValues);
        }

        // 直近の棚卸履歴を取得 (最大50件)
        const { data: historyData, error: historyError } = await supabase
            .from("inventory_logs")
            .select(`
                id, ingredient_id, actual_quantity, counted_at,
                ingredient:ingredients(id, name, unit)
            `)
            .order("counted_at", { ascending: false })
            .limit(50);

        if (!historyError && historyData) {
            setInventoryHistory(historyData as any as InventoryHistory[]);
        }

        setIsLoading(false);
    };

    useEffect(() => {
        fetchIngredientsAndHistory();
    }, []);

    const handleInputChange = (id: string, value: string) => {
        setInputValues(prev => ({ ...prev, [id]: value }));
    };

    // 全ての変更を一括で保存する
    const handleSaveAll = async () => {
        setIsSaving(true);
        let successCount = 0;
        let errorCount = 0;

        for (const item of ingredients) {
            const newValueStr = inputValues[item.id];
            if (newValueStr === undefined || newValueStr === "") continue;

            const newStock = Number(newValueStr);
            if (isNaN(newStock) || newStock < 0) continue;

            // 在庫数が変わっていない場合はスキップ（効率化）
            if (newStock === item.current_stock) continue;

            // 1. inventory_logs に記録 (対象の月を保持するならcounted_atに月末日付などを入れることも可能ですが、MVPとして現在時刻で打刻します)
            const { error: logError } = await supabase
                .from("inventory_logs")
                .insert([{
                    ingredient_id: item.id,
                    actual_quantity: newStock,
                }]);

            if (logError) {
                errorCount++;
                continue;
            }

            // 2. ingredients の current_stock を更新
            const { error: updateError } = await supabase
                .from("ingredients")
                .update({ current_stock: newStock })
                .eq("id", item.id);

            if (updateError) {
                errorCount++;
            } else {
                successCount++;
            }
        }

        if (errorCount > 0) {
            toast.error(`${errorCount}件の更新に失敗しました`);
        }
        if (successCount > 0) {
            toast.success(`${successCount}件の在庫を更新しました`);
            fetchIngredientsAndHistory(); // 最新データを再取得
        } else if (errorCount === 0) {
            toast.info("変更されたデータはありません");
        }

        setIsSaving(false);
    };

    // 棚卸履歴の削除（在庫数はロールバックしない方針）
    const handleDeleteHistory = async (historyId: string) => {
        if (!confirm("この棚卸記録を削除しますか？\n※履歴のみが削除され、現在の在庫数は変更されません。")) return;

        setIsLoading(true);
        try {
            const { error: deleteError } = await supabase
                .from("inventory_logs")
                .delete()
                .eq("id", historyId);

            if (deleteError) throw deleteError;

            toast.success("棚卸記録を削除しました");
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
                    <h2 className="text-3xl font-bold tracking-tight">実地棚卸（月末）</h2>
                    <p className="text-muted-foreground">月末の営業終了後に、実際の在庫数を入力してズレを補正してください。</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="outline" size="lg" onClick={fetchIngredientsAndHistory} disabled={isLoading || isSaving} className="flex-1 md:flex-none">
                        <RefreshCw className={`w-5 h-5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        再読み込み
                    </Button>
                    <Button size="lg" onClick={handleSaveAll} disabled={isLoading || isSaving} className="flex-1 md:flex-none">
                        <Save className="w-5 h-5 mr-2" />
                        {isSaving ? "保存中..." : "一括保存"}
                    </Button>
                </div>
            </div>

            <div className="bg-card border rounded-xl p-4 sm:p-6 mb-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex-1">
                        <h3 className="text-lg font-bold">棚卸対象月度</h3>
                        <p className="text-sm text-muted-foreground">入力する実地棚卸の月度を選択してください</p>
                    </div>
                    <Input
                        type="month"
                        value={targetMonth}
                        onChange={(e) => setTargetMonth(e.target.value)}
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
                            <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold">{item.name}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        システム上の現在庫: {item.current_stock} {item.unit}
                                        {item.current_stock < item.threshold && (
                                            <span className="ml-2 text-destructive font-bold">(発注警告)</span>
                                        )}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <Input
                                        type="number"
                                        value={inputValues[item.id] ?? ""}
                                        onChange={(e) => handleInputChange(item.id, e.target.value)}
                                        className="text-xl text-right font-bold w-full sm:w-32 h-14"
                                        placeholder="0"
                                    />
                                    <span className="text-lg font-medium w-12 text-muted-foreground">{item.unit}</span>
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
                            最近の棚卸履歴（削除のみ）
                        </CardTitle>
                        <CardDescription>
                            誤って入力した履歴を削除できます。（在庫数は棚卸し前の状態に戻らないため、在庫数が違っている場合は再度棚卸項目から正しい数量を送信してください）
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 border-t">
                        <Table className="hidden md:table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>入力日時</TableHead>
                                    <TableHead>食材</TableHead>
                                    <TableHead className="text-right">入力数量</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {inventoryHistory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">履歴がありません</TableCell>
                                    </TableRow>
                                ) : (
                                    inventoryHistory.map((history) => (
                                        <TableRow key={history.id}>
                                            <TableCell className="text-muted-foreground font-medium">
                                                {format(new Date(history.counted_at), "yyyy/MM/dd HH:mm")}
                                            </TableCell>
                                            <TableCell>
                                                {history.ingredient?.name || "不明な食材"}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                {history.actual_quantity} {history.ingredient?.unit}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDeleteHistory(history.id)}
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
                            {inventoryHistory.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">履歴がありません</div>
                            ) : (
                                inventoryHistory.map((history) => (
                                    <div key={history.id} className="border rounded-lg p-4 shadow-sm bg-card flex flex-col gap-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="text-xs text-muted-foreground">
                                                    {format(new Date(history.counted_at), "MM/dd HH:mm")}
                                                </div>
                                                <div className="font-bold text-lg mt-1">{history.ingredient?.name || "不明な食材"}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-lg text-primary">
                                                    {history.actual_quantity} <span className="text-sm font-normal text-muted-foreground">{history.ingredient?.unit}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex justify-end pt-2 border-t mt-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive border-destructive/30 hover:bg-destructive hover:text-white"
                                                onClick={() => handleDeleteHistory(history.id)}
                                            >
                                                <Trash2 className="w-4 h-4 mr-1" />
                                                履歴を削除
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
