"use client";

// =============================================
// Google Identity Services + Sheets API v4
// =============================================

const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// GISのTokenClient型（window.google.accounts.oauth2経由で使用）
type GsiTokenClient = {
    requestAccessToken(options?: { prompt?: string }): void;
};

let tokenClient: GsiTokenClient | null = null;
let accessToken: string | null = null;

const getClientId = () => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

// =============================================
// GoogleスプレッドシートIDをlocalStorageに保存/取得
// =============================================
const SPREADSHEET_ID_KEY = "restaurant_backup_spreadsheet_id";

export const getStoredSpreadsheetId = (): string => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(SPREADSHEET_ID_KEY) || "";
};

export const setStoredSpreadsheetId = (id: string) => {
    localStorage.setItem(SPREADSHEET_ID_KEY, id.trim());
};

// =============================================
// Google Identity Services でOAuth認証
// =============================================
const loadGsiScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") return reject();
        if (document.getElementById("gsi-script")) return resolve();
        const script = document.createElement("script");
        script.id = "gsi-script";
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("GSI スクリプトの読み込みに失敗しました"));
        document.head.appendChild(script);
    });
};

// アクセストークンを取得（初回はポップアップで認証）
export const getAccessToken = (): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            await loadGsiScript();

            if (accessToken) {
                resolve(accessToken);
                return;
            }

            // window.google はGSIスクリプトがロードされた後に存在する
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const gsi = (window as any).google;
            tokenClient = gsi.accounts.oauth2.initTokenClient({
                client_id: getClientId(),
                scope: SCOPES,
                callback: (response: { access_token: string; error?: string }) => {
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    accessToken = response.access_token;
                    resolve(accessToken as string);
                },
            }) as GsiTokenClient;

            tokenClient.requestAccessToken({ prompt: "" });
        } catch (e) {
            reject(e);
        }
    });
};

// =============================================
// Sheets API: シートに値を書き込む（全件上書き）
// =============================================
const writeToSheet = async (
    spreadsheetId: string,
    sheetName: string,
    values: (string | number)[][]
) => {
    const token = await getAccessToken();

    // まずシートが存在するか確認→なければ作成
    const metaRes = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) throw new Error(`スプレッドシートの取得に失敗しました (${metaRes.status})\nスプレッドシートIDが正しいか、権限があるか確認してください。`);

    const meta = await metaRes.json();
    const sheetTitles: string[] = meta.sheets?.map((s: any) => s.properties.title) || [];

    if (!sheetTitles.includes(sheetName)) {
        // シートが存在しない場合は追加
        await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                requests: [{ addSheet: { properties: { title: sheetName } } }],
            }),
        });
    }

    // シートの内容を全件クリアしてから書き込み
    const range = `${sheetName}!A1`;

    // 1: クリア
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:clear`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });

    // 2: 書き込み
    const writeRes = await fetch(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ values }),
        }
    );

    if (!writeRes.ok) {
        const errBody = await writeRes.json();
        throw new Error(errBody.error?.message || "データの書き込みに失敗しました");
    }
};

// =============================================
// 各バックアップ用関数
// =============================================

import { supabase } from "@/lib/supabase";

/** 食材マスタをバックアップ */
export const backupIngredients = async (spreadsheetId: string) => {
    const { data, error } = await supabase
        .from("ingredients")
        .select("*")
        .order("name");
    if (error) throw new Error("Supabaseからの食材データ取得に失敗しました");

    const header = ["食材名", "単位", "現在庫", "発注アラート閾値", "状態", "登録日時"];
    const rows = data.map(r => [
        r.name,
        r.unit,
        r.current_stock,
        r.threshold,
        r.is_active ? "使用中" : "使用停止",
        r.created_at ? new Date(r.created_at).toLocaleString("ja-JP") : "",
    ]);

    await writeToSheet(spreadsheetId, "食材管理", [header, ...rows]);
};

/** メニューマスタをバックアップ */
export const backupMenuItems = async (spreadsheetId: string) => {
    const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("category");
    if (error) throw new Error("Supabaseからのメニューデータ取得に失敗しました");

    const header = ["カテゴリ", "メニュー名", "価格", "状態", "登録日時"];
    const rows = data.map(r => [
        r.category,
        r.name,
        r.price,
        r.is_active ? "販売中" : "販売終了",
        r.created_at ? new Date(r.created_at).toLocaleString("ja-JP") : "",
    ]);

    await writeToSheet(spreadsheetId, "メニュー管理", [header, ...rows]);
};

/** 売上履歴をバックアップ */
export const backupSalesHistory = async (spreadsheetId: string) => {
    const { data, error } = await supabase
        .from("daily_sales")
        .select(`
            date, quantity_sold, created_at,
            menu_item:menu_items(name, category, is_active)
        `)
        .order("date", { ascending: false });
    if (error) throw new Error("Supabaseからの売上データ取得に失敗しました");

    const header = ["売上日", "メニュー名", "カテゴリ", "販売数", "状態", "入力日時"];
    const rows = (data as any[]).map(r => [
        r.date,
        r.menu_item?.name || "不明",
        r.menu_item?.category || "",
        r.quantity_sold,
        r.menu_item?.is_active ? "販売中" : "販売終了",
        r.created_at ? new Date(r.created_at).toLocaleString("ja-JP") : "",
    ]);

    await writeToSheet(spreadsheetId, "売上履歴", [header, ...rows]);
};

// =============================================
// シート読み込み（同期用）
// =============================================

/**
 * スプレッドシートをCSVエクスポートURLで読み込む（Googleログイン不要）
 * ※スプレッドシートを「リンクを知っている全員が閲覧可能」に設定しておく必要があります
 */
export const readSheetValues = async (
    spreadsheetId: string,
    sheetGid: number = 0
): Promise<string[][]> => {
    try {
        // CSVエクスポートURL（認証不要で公開シートを取得できる）
        const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${sheetGid}`;
        const res = await fetch(csvUrl);
        if (!res.ok) {
            throw new Error(`[${res.status}] スプレッドシートの読み込みに失敗しました。「リンクを知っている全員が閲覧可能」に設定されているか確認してください。`);
        }
        const csv = await res.text();
        // CSV文字列を2次元配列に変換
        return parseCsv(csv);
    } catch (e: any) {
        console.error("readSheetValues Exception:", e);
        throw new Error(e.message || "スプレッドシートへのアクセスに失敗しました");
    }
};

/** CSV文字列を string[][] に変換 */
const parseCsv = (csv: string): string[][] => {
    const lines = csv.split(/\r?\n/);
    return lines.map(line => {
        const cells: string[] = [];
        let inQuote = false;
        let cell = "";
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
                else { inQuote = !inQuote; }
            } else if (ch === "," && !inQuote) {
                cells.push(cell); cell = "";
            } else {
                cell += ch;
            }
        }
        cells.push(cell);
        return cells;
    }).filter(row => row.some(c => c.trim() !== ""));
};


/** ¥1,500 形式の文字列から数値を取り出す */
const parsePrice = (s: string): number => {
    return parseInt(s.replace(/[¥,￥]/g, "").trim(), 10) || 0;
};

/** M/D 形式を yyyy-MM-dd に変換（現在年を補完） */
const parseDateLabel = (label: string): string | null => {
    const m = label.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!m) return null;
    const year = new Date().getFullYear();
    const month = m[1].padStart(2, "0");
    const day = m[2].padStart(2, "0");
    return `${year}-${month}-${day}`;
};

// スプレッドシーから解析したメニュー行
export type SheetMenuRow = {
    category: string;
    name: string;
    price: number;
    sales: { date: string; qty: number }[]; // 日付と提供数
};

/** スプレッドシートを解析してメニュー+売上データに変換 */
export const parseSheetData = (rows: string[][]): SheetMenuRow[] => {
    if (!rows || rows.length < 2) return [];
    const header = rows[0]; // ["カテゴリ", "メニュー名", "金額", "1/3", "1/4", ...]

    // ヘッダー探索：C列（index 2）が「金額」等のはず。D列（index 3）以降から日付を探す
    const dateMap: { colIdx: number; iso: string }[] = [];
    for (let i = 3; i < header.length; i++) {
        if (!header[i]) continue;
        const iso = parseDateLabel(header[i].trim());
        if (iso) dateMap.push({ colIdx: i, iso });
    }

    // データ行のパース
    return rows.slice(1).map(row => {
        const category = (row[0] || "").trim();
        const name = (row[1] || "").trim();
        const price = parsePrice(row[2] || "0");
        const sales: { date: string; qty: number }[] = [];

        for (const { colIdx, iso } of dateMap) {
            const valStr = (row[colIdx] || "0").trim();
            // カンマ等を除去して数値に変換（空文字列や-などは除外）
            const val = parseInt(valStr.replace(/,/g, ""), 10);
            if (!isNaN(val) && val > 0) {
                sales.push({ date: iso, qty: val });
            }
        }
        return { category, name, price, sales };
    }).filter(r => r.name.length > 0 && r.category.length > 0);
};

/** メニューをスプレッドシートから同期（新規追加のみ、重複はスキップ） */
export const syncMenusFromSheet = async (
    sourceSpreadsheetId: string
): Promise<{ added: string[]; skipped: string[] }> => {
    try {
        const rows = await readSheetValues(sourceSpreadsheetId);
        if (!rows || rows.length === 0) throw new Error("シートからデータが取得できませんでした。シートが空か読取権限がありません");

        const menuRows = parseSheetData(rows);
        if (menuRows.length === 0) throw new Error("有効なメニュー行（カテゴリとメニュー名がある行）が見つかりません。シートA・B列を確認してください");

        // 既存メニューをDB取得
        const { data: existing, error } = await supabase.from("menu_items").select("name");
        if (error) throw new Error("既存メニューの取得に失敗しました");
        const existingNames = new Set((existing || []).map(m => m.name));

        const added: string[] = [];
        const skipped: string[] = [];

        for (const row of menuRows) {
            if (!row.name || !row.category) continue;
            if (existingNames.has(row.name)) {
                skipped.push(row.name);
                continue;
            }
            const { error: insertErr } = await supabase.from("menu_items").insert({
                name: row.name,
                category: row.category,
                price: row.price,
                is_active: true,
            });
            if (insertErr) {
                skipped.push(`${row.name}（エラー）`);
            } else {
                added.push(row.name);
                existingNames.add(row.name);
            }
        }
        return { added, skipped };
    } catch (e: any) {
        console.error("syncMenusFromSheet Exception:", e);
        throw new Error(e.message || "メニューの同期中にエラーが発生しました");
    }
};

/** 売上データをスプレッドシートから同期（重複はスキップ） */
export const syncSalesFromSheet = async (
    sourceSpreadsheetId: string
): Promise<{ added: number; skipped: number; errors: string[] }> => {
    try {
        const rows = await readSheetValues(sourceSpreadsheetId);
        if (!rows || rows.length === 0) throw new Error("シートからデータが取得できませんでした");

        const menuRows = parseSheetData(rows);
        if (menuRows.length === 0) throw new Error("解析できる売上行が見つかりません");

        // DBのメニュー一覧（name → id）
        const { data: menuList, error: menuErr } = await supabase.from("menu_items").select("id, name");
        if (menuErr) throw new Error("メニュー情報の取得に失敗しました");
        const menuMap = new Map<string, string>((menuList || []).map(m => [m.name, m.id]));

        // 既存売上（date + menu_item_id のセット）
        const { data: existingSales, error: salesErr } = await supabase
            .from("daily_sales")
            .select("date, menu_item_id");
        if (salesErr) throw new Error("売上データの取得に失敗しました");
        const salesSet = new Set<string>(
            (existingSales || []).map(s => `${s.date}__${s.menu_item_id}`)
        );

        let added = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const row of menuRows) {
            const menuId = menuMap.get(row.name);
            if (!menuId) {
                if (row.sales.length > 0) errors.push(`「${row.name}」はDBに見つかりません（先にメニュー同期を行ってください）`);
                continue;
            }
            for (const { date, qty } of row.sales) {
                const key = `${date}__${menuId}`;
                if (salesSet.has(key)) { skipped++; continue; }
                const { error: insErr } = await supabase.from("daily_sales").insert({
                    date,
                    menu_item_id: menuId,
                    quantity_sold: qty,
                });
                if (insErr) {
                    errors.push(`${date} / ${row.name}`);
                } else {
                    added++;
                    salesSet.add(key);
                }
            }
        }
        return { added, skipped, errors };
    } catch (e: any) {
        console.error("syncSalesFromSheet Exception:", e);
        throw new Error(e.message || "売上データの同期中にエラーが発生しました");
    }
};
