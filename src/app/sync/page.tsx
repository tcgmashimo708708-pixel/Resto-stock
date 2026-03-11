"use client";

import { useState } from "react";
import {
    syncMenusFromSheet,
    syncSalesFromSheet,
    getStoredSpreadsheetId as getBackupId,
} from "@/lib/googleSheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw, UtensilsCrossed, BarChart3, DatabaseZap, ExternalLink, Save } from "lucide-react";

// =============================================
// 売上スプレッドシートIDのlocalStorage管理
// =============================================
const SOURCE_ID_KEY = "restaurant_source_spreadsheet_id";
const getSourceId = () => (typeof window !== "undefined" ? localStorage.getItem(SOURCE_ID_KEY) || "" : "");
const setSourceId = (id: string) => localStorage.setItem(SOURCE_ID_KEY, id.trim());

type SyncStatus = "idle" | "loading" | "done" | "error";

export default function SyncPage() {
    const [spreadsheetId, setSpreadsheetId] = useState(getSourceId());
    const [inputId, setInputId] = useState(getSourceId());
    const [menuStatus, setMenuStatus] = useState<SyncStatus>("idle");
    const [salesStatus, setSalesStatus] = useState<SyncStatus>("idle");
    const [menuResult, setMenuResult] = useState<{ added: string[]; skipped: string[] } | null>(null);
    const [salesResult, setSalesResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
    const [allLoading, setAllLoading] = useState(false);

    const handleSaveId = () => {
        setSourceId(inputId);
        setSpreadsheetId(inputId.trim());
        toast.success("スプレッドシートIDを保存しました");
    };

    const handleSyncMenus = async () => {
        if (!spreadsheetId) { toast.error("先にスプレッドシートIDを設定してください"); return; }
        setMenuStatus("loading");
        setMenuResult(null);
        try {
            const result = await syncMenusFromSheet(spreadsheetId);
            setMenuResult(result);
            setMenuStatus("done");
            toast.success(`メニュー同期完了：${result.added.length}件追加`);
        } catch (e: any) {
            setMenuStatus("error");
            toast.error(`同期失敗: ${e.message}`);
        }
    };

    const handleSyncSales = async () => {
        if (!spreadsheetId) { toast.error("先にスプレッドシートIDを設定してください"); return; }
        setSalesStatus("loading");
        setSalesResult(null);
        try {
            const result = await syncSalesFromSheet(spreadsheetId);
            setSalesResult(result);
            setSalesStatus("done");
            toast.success(`売上同期完了：${result.added}件追加`);
        } catch (e: any) {
            setSalesStatus("error");
            toast.error(`同期失敗: ${e.message}`);
        }
    };

    const handleSyncAll = async () => {
        if (!spreadsheetId) { toast.error("先にスプレッドシートIDを設定してください"); return; }
        setAllLoading(true);
        setMenuResult(null);
        setSalesResult(null);
        setMenuStatus("loading");
        setSalesStatus("loading");
        try {
            const menuR = await syncMenusFromSheet(spreadsheetId);
            setMenuResult(menuR);
            setMenuStatus("done");
            const salesR = await syncSalesFromSheet(spreadsheetId);
            setSalesResult(salesR);
            setSalesStatus("done");
            toast.success(`全同期完了 / メニュー${menuR.added.length}件・売上${salesR.added}件追加`);
        } catch (e: any) {
            setMenuStatus("error");
            setSalesStatus("error");
            toast.error(`同期失敗: ${e.message}`);
        } finally {
            setAllLoading(false);
        }
    };

    const spreadsheetUrl = spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
        : null;

    const statusIcon = (s: SyncStatus) => {
        if (s === "loading") return <RefreshCw className="w-4 h-4 animate-spin" />;
        if (s === "done") return <span className="text-green-500 font-bold">✓</span>;
        if (s === "error") return <span className="text-destructive font-bold">✗</span>;
        return null;
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div>
                <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <DatabaseZap className="w-7 h-7" />
                    スプレッドシート同期
                </h2>
                <p className="text-muted-foreground mt-1">
                    Googleスプレッドシートのデータをもとに、メニューと売上情報をRestoStockへ取り込みます。
                </p>
            </div>

            {/* 同期元スプレッドシートID設定 */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">同期元スプレッドシートの設定</CardTitle>
                    <CardDescription>
                        売上管理シートのURL内に含まれるID（<code className="text-xs bg-muted px-1 rounded">/d/（ここ）/edit</code>）を入力してください。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex gap-2">
                        <Input
                            value={inputId}
                            onChange={e => setInputId(e.target.value)}
                            placeholder="例: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                            className="font-mono text-sm"
                        />
                        <Button onClick={handleSaveId} className="shrink-0 gap-1">
                            <Save className="w-4 h-4" />保存
                        </Button>
                    </div>
                    {spreadsheetUrl && (
                        <a href={spreadsheetUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                            <ExternalLink className="w-3 h-3" />スプレッドシートを開く
                        </a>
                    )}
                </CardContent>
            </Card>

            {/* 一括同期 */}
            <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-5 pb-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <p className="font-bold text-lg">全データを一括同期</p>
                            <p className="text-sm text-muted-foreground">メニュー追加 → 売上インポートの順で実行します</p>
                        </div>
                        <Button size="lg" onClick={handleSyncAll} disabled={allLoading} className="w-full sm:w-auto gap-2">
                            {allLoading
                                ? <><RefreshCw className="w-5 h-5 animate-spin" />同期中...</>
                                : <><DatabaseZap className="w-5 h-5" />全データを同期</>}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* メニュー同期 */}
            <Card>
                <CardContent className="pt-5 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-muted"><UtensilsCrossed className="w-5 h-5 text-muted-foreground" /></div>
                            <div>
                                <p className="font-bold">メニューを同期</p>
                                <p className="text-sm text-muted-foreground">新しいメニューをスプレッドシートから追加します（重複はスキップ）</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {statusIcon(menuStatus)}
                            <Button variant="outline" size="sm" onClick={handleSyncMenus} disabled={menuStatus === "loading"} className="gap-1">
                                {menuStatus === "loading" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                同期
                            </Button>
                        </div>
                    </div>
                    {menuResult && (
                        <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                            <p className="font-medium text-green-600">✓ 追加（{menuResult.added.length}件）：{menuResult.added.join("、") || "なし"}</p>
                            <p className="text-muted-foreground">スキップ（既存 {menuResult.skipped.length}件）</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 売上同期 */}
            <Card>
                <CardContent className="pt-5 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-muted"><BarChart3 className="w-5 h-5 text-muted-foreground" /></div>
                            <div>
                                <p className="font-bold">売上データを同期</p>
                                <p className="text-sm text-muted-foreground">スプレッドシートの提供数をDB（daily_sales）へ取り込みます</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {statusIcon(salesStatus)}
                            <Button variant="outline" size="sm" onClick={handleSyncSales} disabled={salesStatus === "loading"} className="gap-1">
                                {salesStatus === "loading" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                同期
                            </Button>
                        </div>
                    </div>
                    {salesResult && (
                        <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                            <p className="font-medium text-green-600">✓ 追加：{salesResult.added}件</p>
                            <p className="text-muted-foreground">スキップ（重複）：{salesResult.skipped}件</p>
                            {salesResult.errors.length > 0 && (
                                <p className="text-destructive">エラー：{salesResult.errors.join("、")}</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="text-sm text-muted-foreground bg-muted/40 border rounded-lg p-4 space-y-1">
                <p className="font-semibold">💡 同期のルール</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                    <li>初回は「メニューを同期」→「売上データを同期」の順がお勧めです</li>
                    <li>既にDBに存在するメニュー / 売上データは重複追加されません</li>
                    <li>初回のGoogleサインインを求めるポップアップが表示される場合があります</li>
                    <li>スプレッドシートの構成は「A列:カテゴリ  B列:メニュー名  C列:価格  D列以降:日付（M/D形式）」に対応しています</li>
                </ul>
            </div>
        </div>
    );
}
