"use client";

import { useState } from "react";
import {
    backupIngredients,
    backupMenuItems,
    backupSalesHistory,
    getStoredSpreadsheetId,
    setStoredSpreadsheetId,
} from "@/lib/googleSheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Sheet, ExternalLink, Save, Carrot, UtensilsCrossed, BarChart3, RefreshCw, Database } from "lucide-react";

type BackupStatus = "idle" | "loading" | "success" | "error";

interface BackupItem {
    key: "ingredients" | "menu" | "sales";
    label: string;
    description: string;
    icon: React.ElementType;
    fn: (id: string) => Promise<void>;
}

const backupItems: BackupItem[] = [
    {
        key: "ingredients",
        label: "食材マスタ",
        description: "食材名・単位・現在庫・発注アラート閾値",
        icon: Carrot,
        fn: backupIngredients,
    },
    {
        key: "menu",
        label: "メニュー管理",
        description: "カテゴリ・メニュー名・価格・状態",
        icon: UtensilsCrossed,
        fn: backupMenuItems,
    },
    {
        key: "sales",
        label: "売上履歴",
        description: "日付・メニュー名・販売数（全件）",
        icon: BarChart3,
        fn: backupSalesHistory,
    },
];

export default function BackupPage() {
    const [spreadsheetId, setSpreadsheetId] = useState(getStoredSpreadsheetId());
    const [spreadsheetIdInput, setSpreadsheetIdInput] = useState(getStoredSpreadsheetId());
    const [statuses, setStatuses] = useState<Record<string, BackupStatus>>({
        ingredients: "idle",
        menu: "idle",
        sales: "idle",
        all: "idle",
    });

    const setStatus = (key: string, status: BackupStatus) =>
        setStatuses((prev) => ({ ...prev, [key]: status }));

    const handleSaveId = () => {
        setStoredSpreadsheetId(spreadsheetIdInput);
        setSpreadsheetId(spreadsheetIdInput.trim());
        toast.success("スプレッドシートIDを保存しました");
    };

    const handleBackup = async (item: BackupItem) => {
        if (!spreadsheetId) {
            toast.error("先にスプレッドシートIDを設定してください");
            return;
        }
        setStatus(item.key, "loading");
        try {
            await item.fn(spreadsheetId);
            setStatus(item.key, "success");
            toast.success(`「${item.label}」をスプレッドシートにバックアップしました`);
        } catch (e: any) {
            setStatus(item.key, "error");
            toast.error(`バックアップに失敗しました: ${e.message}`);
        }
    };

    const handleBackupAll = async () => {
        if (!spreadsheetId) {
            toast.error("先にスプレッドシートIDを設定してください");
            return;
        }
        setStatus("all", "loading");
        let hasError = false;
        for (const item of backupItems) {
            setStatus(item.key, "loading");
            try {
                await item.fn(spreadsheetId);
                setStatus(item.key, "success");
            } catch (e: any) {
                setStatus(item.key, "error");
                hasError = true;
                toast.error(`「${item.label}」バックアップ失敗: ${e.message}`);
            }
        }
        setStatus("all", "idle");
        if (!hasError) {
            toast.success("全データのバックアップが完了しました！");
        }
    };

    const getStatusIcon = (status: BackupStatus) => {
        if (status === "loading") return <RefreshCw className="w-4 h-4 animate-spin" />;
        if (status === "success") return <span className="text-green-500 font-bold text-lg">✓</span>;
        if (status === "error") return <span className="text-destructive font-bold text-lg">✗</span>;
        return null;
    };

    const spreadsheetUrl = spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
        : null;

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div>
                <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Database className="w-7 h-7" />
                    Googleスプレッドシートバックアップ
                </h2>
                <p className="text-muted-foreground mt-1">
                    データベースの障害やメンテナンス時に備えて、定期的にバックアップすることをお勧めします。
                </p>
            </div>

            {/* スプレッドシートID設定 */}
            <Card>
                <CardHeader className="bg-muted/30 pb-4">
                    <CardTitle className="text-base">バックアップ先の設定</CardTitle>
                    <CardDescription>
                        バックアップ先のGoogleスプレッドシートIDを入力してください。
                        スプレッドシートのURLに含まれる <code className="text-xs bg-muted px-1 rounded">/d/（この部分）/edit</code> の文字列です。
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                    <div className="flex gap-2">
                        <Input
                            value={spreadsheetIdInput}
                            onChange={(e) => setSpreadsheetIdInput(e.target.value)}
                            placeholder="例: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                            className="font-mono text-sm"
                        />
                        <Button onClick={handleSaveId} className="shrink-0 gap-2">
                            <Save className="w-4 h-4" />
                            保存
                        </Button>
                    </div>
                    {spreadsheetUrl && (
                        <a
                            href={spreadsheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                            <ExternalLink className="w-3 h-3" />
                            スプレッドシートを開く
                        </a>
                    )}
                </CardContent>
            </Card>

            {/* 一括バックアップ */}
            <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-6 pb-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <p className="font-bold text-lg">全データを一括バックアップ</p>
                            <p className="text-sm text-muted-foreground">食材・メニュー・売上の全シートを一度に更新します</p>
                        </div>
                        <Button
                            size="lg"
                            onClick={handleBackupAll}
                            disabled={statuses.all === "loading"}
                            className="w-full sm:w-auto gap-2"
                        >
                            {statuses.all === "loading" ? (
                                <><RefreshCw className="w-5 h-5 animate-spin" />バックアップ中...</>
                            ) : (
                                <>
                                    <Database className="w-5 h-5" />
                                    全データをバックアップ
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 個別バックアップ */}
            <div className="grid gap-4">
                {backupItems.map((item) => {
                    const status = statuses[item.key];
                    return (
                        <Card key={item.key}>
                            <CardContent className="pt-5 pb-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-muted">
                                            <item.icon className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="font-bold">{item.label}</p>
                                            <p className="text-sm text-muted-foreground">{item.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {getStatusIcon(status)}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleBackup(item)}
                                            disabled={status === "loading"}
                                            className="gap-2"
                                        >
                                            {status === "loading" ? (
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Database className="w-4 h-4" />
                                            )}
                                            バックアップ
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <div className="text-sm text-muted-foreground bg-muted/40 border rounded-lg p-4 space-y-1">
                <p className="font-semibold">💡 バックアップについて</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                    <li>初回のバックアップ時はGoogleアカウントでのサインインを求めるポップアップが表示されます</li>
                    <li>各シートは毎回全件上書きで保存されます（追記ではありません）</li>
                    <li>スプレッドシートはあらかじめGoogleスプレッドシートで作成し、そのIDを上にご入力ください</li>
                    <li>スリープ対策のため、週に1回を目安にバックアップされることをお勧めします</li>
                </ul>
            </div>
        </div>
    );
}
