"use client";

import { useState, useEffect } from "react";
import { format, subMonths, differenceInDays } from "date-fns";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Download, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell
} from 'recharts';

type ABCItem = {
    menu_item_id: string;
    name: string;
    category: string;
    price: number;
    unitCost: number;
    unitGrossProfit: number;
    totalQuantity: number;
    salesAmount: number;
    grossProfit: number;
    cumulativeGrossProfit: number;
    cumulativePercentage: number;
    rank: 'A' | 'B' | 'C';
    is_active: boolean;
};

type SuggestedStock = {
    ingredient_id: string;
    name: string;
    unit: string;
    totalConsumption: number;
    dailyAverage: number;
    currentStock: number;
    currentThreshold: number;
    suggestedThreshold: number;
};

export default function AbcAnalysisPage() {
    const [startDate, setStartDate] = useState(format(subMonths(new Date(), 1), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [isLoading, setIsLoading] = useState(false);
    const [analysisData, setAnalysisData] = useState<ABCItem[]>([]);

    // カテゴリ絞り込み用
    const [selectedCategory, setSelectedCategory] = useState<string>("すべて");

    // 目安在庫の計算用
    const [safetyDays, setSafetyDays] = useState<number>(7); // デフォルト7日分
    const [suggestedStockData, setSuggestedStockData] = useState<SuggestedStock[]>([]);

    const fetchAnalysis = async () => {
        if (!startDate || !endDate) return;
        setIsLoading(true);

        const daysDiff = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
        const periodDays = Math.max(1, daysDiff);

        try {
            // 1. 指定期間の売上データを取得
            const { data: sales, error: salesError } = await supabase
                .from("daily_sales")
                .select("menu_item_id, quantity_sold")
                .gte("date", startDate)
                .lte("date", endDate);

            if (salesError) throw salesError;

            // 2. メニューマスターを取得 (全件 または カテゴリ絞り込み)
            // 売上実績には販売終了(is_active=false)も含まれるため、全て取得する
            let menusQuery = supabase
                .from("menu_items")
                .select("id, name, price, category, is_active");

            if (selectedCategory !== "すべて") {
                menusQuery = menusQuery.eq("category", selectedCategory);
            }

            const { data: menus, error: menusError } = await menusQuery;

            if (menusError) throw menusError;

            // 3. レシピと食材マスターを取得 (分析と目安在庫計算用)
            const [recipesRes, ingredientsRes] = await Promise.all([
                supabase.from("recipes").select("menu_item_id, ingredient_id, quantity_required"),
                supabase.from("ingredients").select("id, name, unit, current_stock, threshold, unit_cost").eq("is_active", true)
            ]);
            if (recipesRes.error) throw recipesRes.error;
            if (ingredientsRes.error) throw ingredientsRes.error;

            // 食材単価・レシピからの原価計算マップ作成
            const ingredientCosts = new Map<string, number>();
            ingredientsRes.data?.forEach(ing => {
                ingredientCosts.set(ing.id, ing.unit_cost || 0);
            });

            const recipeCostMap = new Map<string, number>();
            recipesRes.data?.forEach(r => {
                const cost = ingredientCosts.get(r.ingredient_id) || 0;
                const currentCost = recipeCostMap.get(r.menu_item_id) || 0;
                recipeCostMap.set(r.menu_item_id, currentCost + (cost * r.quantity_required));
            });

            // メニューIDごとの売上集計
            const salesMap = new Map<string, number>();
            sales?.forEach(s => {
                const current = salesMap.get(s.menu_item_id) || 0;
                salesMap.set(s.menu_item_id, current + s.quantity_sold);
            });

            // メニュー情報と結合し、原価と粗利額を算出
            let items: Omit<ABCItem, 'cumulativeGrossProfit' | 'cumulativePercentage' | 'rank'>[] = [];
            let totalGrossProfitAll = 0;

            menus?.forEach(menu => {
                const qty = salesMap.get(menu.id) || 0;
                if (qty > 0) {
                    const unitCost = recipeCostMap.get(menu.id) || 0;
                    const unitGrossProfit = menu.price - unitCost;
                    const salesAmount = qty * menu.price;
                    const grossProfit = qty * unitGrossProfit;

                    totalGrossProfitAll += grossProfit;
                    items.push({
                        menu_item_id: menu.id,
                        name: menu.name,
                        category: menu.category,
                        price: menu.price,
                        unitCost,
                        unitGrossProfit,
                        totalQuantity: qty,
                        salesAmount,
                        grossProfit,
                        is_active: menu.is_active,
                    });
                }
            });

            // 3. 粗利総額の降順でソート
            items.sort((a, b) => b.grossProfit - a.grossProfit);

            // 4. 累積比率とABCランクを計算
            let cumulative = 0;
            const result: ABCItem[] = items.map(item => {
                cumulative += item.grossProfit;
                const percentage = totalGrossProfitAll > 0 ? (cumulative / totalGrossProfitAll) * 100 : 0;

                let rank: 'A' | 'B' | 'C' = 'C';
                if (percentage <= 70) rank = 'A';
                else if (percentage <= 90) rank = 'B';

                return {
                    ...item,
                    cumulativeGrossProfit: cumulative,
                    cumulativePercentage: Number(percentage.toFixed(1)),
                    rank
                };
            });

            setAnalysisData(result);

            // ==========================================
            // 食材の目安在庫数量の計算
            // ==========================================
            const consumptionMap = new Map<string, number>();

            // 各メニューの販売数ごとに、レシピに登録された食材消費量を加算
            sales?.forEach(s => {
                const reps = recipesRes.data?.filter(r => r.menu_item_id === s.menu_item_id) || [];
                reps.forEach(r => {
                    const consumed = s.quantity_sold * r.quantity_required;
                    const prev = consumptionMap.get(r.ingredient_id) || 0;
                    consumptionMap.set(r.ingredient_id, prev + consumed);
                });
            });

            const stockSuggestions: SuggestedStock[] = [];
            ingredientsRes.data?.forEach(ing => {
                const totalConsumption = consumptionMap.get(ing.id) || 0;
                if (totalConsumption > 0 || ing.current_stock > 0) { // 消費があったか在庫があるもののみ
                    const dailyAverage = totalConsumption / periodDays;
                    stockSuggestions.push({
                        ingredient_id: ing.id,
                        name: ing.name,
                        unit: ing.unit,
                        totalConsumption,
                        dailyAverage: Number(dailyAverage.toFixed(1)),
                        currentStock: Number(ing.current_stock),
                        currentThreshold: Number(ing.threshold),
                        suggestedThreshold: Math.ceil(dailyAverage * safetyDays)
                    });
                }
            });

            // 消費量が多い順にソート
            stockSuggestions.sort((a, b) => b.totalConsumption - a.totalConsumption);
            setSuggestedStockData(stockSuggestions);

        } catch (e) {
            console.error(e);
            toast.error("集計に失敗しました");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalysis();
    }, []);

    // safetyDaysが変更されたら suggestedThreshold だけ再計算する
    useEffect(() => {
        setSuggestedStockData(prev => prev.map(item => ({
            ...item,
            suggestedThreshold: Math.ceil(item.dailyAverage * safetyDays)
        })));
    }, [safetyDays]);

    const getRankColor = (rank: string) => {
        switch (rank) {
            case 'A': return "bg-primary text-primary-foreground"; // 濃い色（例：黒/アクセント）
            case 'B': return "bg-blue-500 text-white hover:bg-blue-600";
            case 'C': return "bg-slate-300 text-slate-800 hover:bg-slate-400";
            default: return "";
        }
    };

    const getBarColor = (rank: string) => {
        switch (rank) {
            case 'A': return "hsl(var(--primary))";
            case 'B': return "#3b82f6"; // blue-500
            case 'C': return "#cbd5e1"; // slate-300
            default: return "#8884d8";
        }
    };

    // CSVエクスポート用の文字列を生成
    const generateCsvContent = () => {
        const header = "ランク,メニュー名,カテゴリ,販売数,売上金額,理論原価,1品粗利額,粗利総額,粗利累積構成比,状態\n";
        const rows = analysisData.map(item => {
            const status = item.is_active ? "販売中" : "販売終了";
            return `${item.rank},"${item.name}",${item.category},${item.totalQuantity},${item.salesAmount},${item.unitCost},${item.unitGrossProfit},${item.grossProfit},${item.cumulativePercentage},${status}`;
        }).join("\n");
        return header + rows;
    };

    const handleDownloadCsv = () => {
        const csvContent = generateCsvContent();
        // BOMを付与してExcelで文字化けしないようにする
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `abc_analysis_${startDate}_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("CSVファイルをダウンロードしました");
    };

    const handleCopyCsv = async () => {
        const csvContent = generateCsvContent();
        try {
            await navigator.clipboard.writeText(csvContent);
            toast.success("クリップボードにコピーしました", {
                description: "ExcelやGoogleスプレッドシートに貼り付けられます"
            });
        } catch (err) {
            toast.error("コピーに失敗しました");
        }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">ABC分析（パレート図）</h2>
                <p className="text-muted-foreground">粗利総額から主力商品（Aランク）、準主力（Bランク）、見直し対象（Cランク）を自動判定します。</p>
            </div>

            <Card>
                <CardHeader className="bg-muted/50 pb-4">
                    <CardTitle className="text-lg">集計期間の指定</CardTitle>
                    <CardDescription>分析したいデータの範囲を指定して「集計する」をクリックしてください。</CardDescription>
                </CardHeader>
                <CardContent className="pt-4 flex flex-col sm:flex-row gap-4 items-center">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full sm:w-40"
                        />
                        <span>〜</span>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full sm:w-40"
                        />
                        <div className="w-full sm:w-40">
                            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger>
                                    <SelectValue placeholder="カテゴリ" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="すべて">すべて</SelectItem>
                                    <SelectItem value="軽食">軽食</SelectItem>
                                    <SelectItem value="ドリンク">ドリンク</SelectItem>
                                    <SelectItem value="デザート">デザート</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Button onClick={fetchAnalysis} disabled={isLoading} className="w-full sm:w-auto gap-2">
                        <Search className="w-4 h-4" />
                        集計する
                    </Button>
                </CardContent>
            </Card>

            {analysisData.length > 0 && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>ABC分析パレート図 (粗利ベース)</CardTitle>
                            <CardDescription>棒グラフは粗利総額、折れ線グラフは累積粗利構成比（%）を表します。</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart
                                        data={analysisData}
                                        margin={{ top: 20, right: 20, bottom: 60, left: 20 }}
                                    >
                                        <CartesianGrid stroke="#f5f5f5" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            angle={-45}
                                            textAnchor="end"
                                            interval={0}
                                            height={80}
                                            tick={{ fontSize: 12 }}
                                        />
                                        <YAxis yAxisId="left" tickFormatter={(v) => `¥${v.toLocaleString()}`} />
                                        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                                        <Tooltip
                                            formatter={(value: any, name: any) => {
                                                if (name === "粗利総額") return [`¥${Number(value).toLocaleString()}`, name];
                                                return [`${value}%`, name];
                                            }}
                                        />
                                        <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '20px' }} />
                                        <Bar yAxisId="left" dataKey="grossProfit" name="粗利総額">
                                            {analysisData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={getBarColor(entry.rank)} />
                                            ))}
                                        </Bar>
                                        <Line yAxisId="right" type="monotone" dataKey="cumulativePercentage" name="累積粗利比率(%)" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: "#ef4444" }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <CardTitle>ランク判定結果</CardTitle>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <Button variant="outline" size="sm" onClick={handleCopyCsv} className="flex-1 sm:flex-none">
                                    <Copy className="w-4 h-4 mr-2" />
                                    コピー
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleDownloadCsv} className="flex-1 sm:flex-none">
                                    <Download className="w-4 h-4 mr-2" />
                                    CSV出力
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ランク</TableHead>
                                        <TableHead>メニュー名</TableHead>
                                        <TableHead>カテゴリ</TableHead>
                                        <TableHead className="text-right">販売数</TableHead>
                                        <TableHead className="text-right">1品粗利</TableHead>
                                        <TableHead className="text-right bg-primary/10 font-bold">粗利総額</TableHead>
                                        <TableHead className="text-right">累積構成比</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {analysisData.map((item) => (
                                        <TableRow key={item.menu_item_id}>
                                            <TableCell>
                                                <Badge className={`${getRankColor(item.rank)} w-8 justify-center`}>
                                                    {item.rank}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-bold">
                                                {item.name}
                                                {!item.is_active && <span className="ml-2 text-xs font-normal text-destructive">(販売終了)</span>}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{item.category}</TableCell>
                                            <TableCell className="text-right">{item.totalQuantity} 食</TableCell>
                                            <TableCell className="text-right text-muted-foreground">¥{item.unitGrossProfit.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-bold text-primary bg-primary/5">¥{item.grossProfit.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-medium">{item.cumulativePercentage}%</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* 食材の目安在庫数量 テーブル */}
                    <Card>
                        <CardHeader className="bg-muted/30 pb-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div>
                                    <CardTitle>食材ごとの目安在庫（発注点）</CardTitle>
                                    <CardDescription>指定期間の販売実績から1日あたりの消費ペースを算出し、必要な在庫の基準値を提案します。</CardDescription>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <label className="text-sm font-bold whitespace-nowrap">確保する日数:</label>
                                    <Input
                                        type="number"
                                        value={safetyDays}
                                        onChange={(e) => setSafetyDays(Number(e.target.value) || 0)}
                                        className="w-20 text-right"
                                        min="1"
                                    />
                                    <span className="text-sm">日分</span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {suggestedStockData.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">レシピの消費データがありません</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>食材名</TableHead>
                                            <TableHead className="text-right">期間合計消費量</TableHead>
                                            <TableHead className="text-right">1日平均</TableHead>
                                            <TableHead className="text-right bg-primary/10 font-bold">推奨アラート閾値</TableHead>
                                            <TableHead className="text-right">現在のアラート閾値</TableHead>
                                            <TableHead className="text-right">現在の在庫</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {suggestedStockData.map((item) => (
                                            <TableRow key={item.ingredient_id}>
                                                <TableCell className="font-bold">{item.name}</TableCell>
                                                <TableCell className="text-right text-muted-foreground">
                                                    {item.totalConsumption} {item.unit}
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground">
                                                    {item.dailyAverage} {item.unit}/日
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-primary bg-primary/5">
                                                    {item.suggestedThreshold} {item.unit}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {item.currentThreshold} {item.unit}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {item.currentStock} {item.unit}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                            <div className="mt-4 text-sm text-center text-muted-foreground">
                                💡 推奨アラート閾値を食材マスタに反映させる場合は、「食材管理」から手動で変更してください。
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            {analysisData.length === 0 && !isLoading && (
                <div className="text-center p-12 text-muted-foreground border rounded-xl bg-card">
                    指定された期間の売上データがありません。
                </div>
            )}
        </div>
    );
}
