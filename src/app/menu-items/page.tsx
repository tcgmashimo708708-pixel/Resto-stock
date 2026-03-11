"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { MenuItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Tag, ArchiveRestore, ArrowUp, ArrowDown, GripVertical, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type MenuItemWithCost = MenuItem & {
    calculated_cost?: number;
};

export default function MenuItemsPage() {
    const [menuItems, setMenuItems] = useState<MenuItemWithCost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [showInactive, setShowInactive] = useState(false);
    const [isSortMode, setIsSortMode] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        price: 0,
        category: "",
    });

    const fetchMenuItems = async () => {
        setIsLoading(true);
        let query = supabase
            .from("menu_items")
            .select(`
                *,
                recipes(
                    quantity_required,
                    ingredient:ingredients(unit_cost)
                )
            `);

        if (!showInactive) {
            query = query.eq("is_active", true);
        }

        const { data, error } = await query;

        if (error) {
            toast.error("メニューの取得に失敗しました");
            console.error(error);
        } else {
            const dataWithCost = (data || []).map((item: any) => {
                const cost = (item.recipes || []).reduce((sum: number, r: any) => {
                    const unitCost = r.ingredient?.unit_cost || 0;
                    return sum + (unitCost * r.quantity_required);
                }, 0);
                return { ...item, calculated_cost: cost };
            });

            const categoryOrder = ["軽食", "ドリンク", "デザート"];
            const sortedData = dataWithCost.sort((a, b) => {
                if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
                if (a.sort_order != null) return -1;
                if (b.sort_order != null) return 1;
                const orderA = categoryOrder.indexOf(a.category) !== -1 ? categoryOrder.indexOf(a.category) : 999;
                const orderB = categoryOrder.indexOf(b.category) !== -1 ? categoryOrder.indexOf(b.category) : 999;
                if (orderA !== orderB) return orderA - orderB;
                return b.price - a.price;
            });
            setMenuItems(sortedData);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchMenuItems();
    }, [showInactive]);

    const openDialog = (item?: MenuItem) => {
        if (item) {
            setEditingId(item.id);
            setFormData({ name: item.name, price: item.price, category: item.category });
        } else {
            setEditingId(null);
            setFormData({ name: "", price: 0, category: "" });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name || !formData.category || formData.price < 0) {
            toast.error("正しい入力内容を確認してください");
            return;
        }

        if (editingId) {
            const { error } = await supabase
                .from("menu_items")
                .update({ name: formData.name, price: formData.price, category: formData.category })
                .eq("id", editingId);
            if (error) { toast.error("更新に失敗しました"); }
            else { toast.success("メニューを更新しました"); setIsDialogOpen(false); fetchMenuItems(); }
        } else {
            const { error } = await supabase
                .from("menu_items")
                .insert([{ name: formData.name, price: formData.price, category: formData.category }]);
            if (error) { toast.error("追加に失敗しました"); }
            else { toast.success("メニューを追加しました"); setIsDialogOpen(false); fetchMenuItems(); }
        }
    };

    const handleDeletePermanent = async (id: string, name: string) => {
        const { error } = await supabase.from("menu_items").delete().eq("id", id);
        if (error) { toast.error("完全制除に失敗しました"); }
        else { toast.success(`「${name}」を完全に削除しました`); fetchMenuItems(); }
    };

    const handleDiscontinue = async (id: string, name: string) => {
        const { error } = await supabase.from("menu_items").update({ is_active: false }).eq("id", id);
        if (error) { toast.error("失敗しました"); }
        else { toast.success(`「${name}」を販売終了にしました`); fetchMenuItems(); }
    };

    const handleRestore = async (id: string, name: string) => {
        const { error } = await supabase.from("menu_items").update({ is_active: true }).eq("id", id);
        if (error) { toast.error("復元に失敗しました"); }
        else { toast.success(`「${name}」を復元（販売再開）しました`); fetchMenuItems(); }
    };

    const handleMoveUp = (index: number) => {
        if (index === 0) return;
        const newList = [...menuItems];
        [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
        setMenuItems(newList);
    };

    const handleMoveDown = (index: number) => {
        if (index === menuItems.length - 1) return;
        const newList = [...menuItems];
        [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
        setMenuItems(newList);
    };

    const handleSortSave = async () => {
        setIsLoading(true);
        try {
            const updates = menuItems.map((item, index) =>
                supabase.from("menu_items").update({ sort_order: index + 1 }).eq("id", item.id)
            );
            const results = await Promise.all(updates);
            if (results.some(r => r.error)) { toast.error("一部の保存に失敗しました"); }
            else { toast.success("並び順を保存しました"); setIsSortMode(false); }
        } catch { toast.error("保存処理に失敗しました"); }
        finally { setIsLoading(false); }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">メニュー管理</h2>
                    <p className="text-muted-foreground">提供する料理メニューの追加や価格の変更</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {isSortMode ? (
                        <>
                            <Button variant="outline" onClick={() => { setIsSortMode(false); fetchMenuItems(); }}>
                                キャンセル
                            </Button>
                            <Button onClick={handleSortSave} disabled={isLoading} className="gap-2">
                                <Save className="w-4 h-4" />並び順を保存
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => setShowInactive(!showInactive)}>
                                {showInactive ? "販売終了を隠す" : "販売終了を表示"}
                            </Button>
                            <Button variant="outline" onClick={() => setIsSortMode(true)} className="gap-2">
                                <GripVertical className="w-4 h-4" />並び替え
                            </Button>
                            <Button onClick={() => openDialog()} className="gap-2">
                                <Plus className="w-4 h-4" />新規メニュー
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* ===== PC用テーブル（md以上のみ表示） ===== */}
            <div className="hidden md:block border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {isSortMode && <TableHead className="w-20 text-center">順番</TableHead>}
                            <TableHead>カテゴリ</TableHead>
                            <TableHead>メニュー名</TableHead>
                            <TableHead>価格表示</TableHead>
                            <TableHead>理論原価</TableHead>
                            <TableHead>原価率</TableHead>
                            <TableHead>1品粗利額</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-10">読み込み中...</TableCell>
                            </TableRow>
                        ) : menuItems.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                    メニューが登録されていません
                                </TableCell>
                            </TableRow>
                        ) : (
                            menuItems.map((item, index) => (
                                <TableRow key={item.id} className={!item.is_active ? "opacity-50 grayscale bg-muted/30" : ""}>
                                    {isSortMode && (
                                        <TableCell className="w-20">
                                            <div className="flex items-center gap-0.5">
                                                <button disabled={index === 0} onClick={() => handleMoveUp(index)} className="p-1 rounded hover:bg-muted disabled:opacity-25">
                                                    <ArrowUp className="w-4 h-4" />
                                                </button>
                                                <button disabled={index === menuItems.length - 1} onClick={() => handleMoveDown(index)} className="p-1 rounded hover:bg-muted disabled:opacity-25">
                                                    <ArrowDown className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </TableCell>
                                    )}
                                    <TableCell>
                                        <Badge variant="secondary" className="gap-1 rounded-sm">
                                            <Tag className="w-3 h-3" />{item.category}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium text-lg">
                                        {item.name}
                                        {!item.is_active && <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0 h-4">販売終了</Badge>}
                                    </TableCell>
                                    <TableCell>¥{item.price.toLocaleString()}</TableCell>
                                    <TableCell>¥{item.calculated_cost?.toLocaleString() || 0}</TableCell>
                                    <TableCell>
                                        {item.price > 0 && item.calculated_cost !== undefined ? (
                                            <span className={item.calculated_cost / item.price > 0.4 ? "text-destructive font-medium" : ""}>
                                                {((item.calculated_cost / item.price) * 100).toFixed(1)}%
                                            </span>
                                        ) : "0%"}
                                    </TableCell>
                                    <TableCell className="font-medium text-primary">
                                        ¥{Math.max(0, item.price - (item.calculated_cost || 0)).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {item.is_active ? (
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="icon" onClick={() => openDialog(item)}>
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="icon"><Trash2 className="w-4 h-4" /></Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>「{item.name}」をどうしますか？</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                <span className="block mb-1">📌 <strong>販売終了</strong>：過去の売上履歴は残します。ABC分析などで集計できます。</span>
                                                                <span className="block text-destructive">🗑️ <strong>完全に削除</strong>：全ての記録を消去します。元に戻せません。</span>
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                                                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                                            <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => handleDiscontinue(item.id, item.name)}>
                                                                販売終了にする
                                                            </AlertDialogAction>
                                                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeletePermanent(item.id, item.name)}>
                                                                完全に削除する
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        ) : (
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => handleRestore(item.id, item.name)}>
                                                    <ArchiveRestore className="w-4 h-4 mr-1" />復元する
                                                </Button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* ===== モバイル用カードリスト（md未満のみ表示） ===== */}
            <div className="md:hidden flex flex-col gap-3">
                {isLoading ? (
                    <div className="text-center py-10 text-muted-foreground">読み込み中...</div>
                ) : menuItems.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground bg-muted/20 rounded-lg">メニューが登録されていません</div>
                ) : (
                    menuItems.map((item, index) => {
                        const costRate = item.price > 0 && item.calculated_cost !== undefined
                            ? (item.calculated_cost / item.price) * 100
                            : 0;
                        return (
                            <div key={item.id} className={`border rounded-xl p-4 shadow-sm bg-card flex flex-col gap-3 ${!item.is_active ? "opacity-50 grayscale" : ""}`}>
                                {/* カードヘッダー */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {isSortMode && (
                                                <div className="flex items-center gap-0.5">
                                                    <button disabled={index === 0} onClick={() => handleMoveUp(index)} className="p-1.5 rounded bg-muted hover:bg-muted/70 disabled:opacity-25">
                                                        <ArrowUp className="w-4 h-4" />
                                                    </button>
                                                    <button disabled={index === menuItems.length - 1} onClick={() => handleMoveDown(index)} className="p-1.5 rounded bg-muted hover:bg-muted/70 disabled:opacity-25">
                                                        <ArrowDown className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                            <Badge variant="secondary" className="gap-1 rounded-sm text-xs">
                                                <Tag className="w-3 h-3" />{item.category}
                                            </Badge>
                                            {!item.is_active && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">販売終了</Badge>}
                                        </div>
                                        <div className="font-bold text-xl mt-1">{item.name}</div>
                                        <div className="text-primary font-semibold text-lg">¥{item.price.toLocaleString()}</div>
                                    </div>
                                    {/* 操作ボタン */}
                                    {!isSortMode && (
                                        item.is_active ? (
                                            <div className="flex gap-2 shrink-0">
                                                <Button variant="outline" size="icon" onClick={() => openDialog(item)}>
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="icon"><Trash2 className="w-4 h-4" /></Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>「{item.name}」をどうしますか？</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                <span className="block mb-1">📌 <strong>販売終了</strong>：過去の売上履歴は残します。</span>
                                                                <span className="block text-destructive">🗑️ <strong>完全に削除</strong>：全ての記録を消去します。元に戻せません。</span>
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter className="flex-col gap-2">
                                                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                                            <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => handleDiscontinue(item.id, item.name)}>販売終了にする</AlertDialogAction>
                                                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeletePermanent(item.id, item.name)}>完全に削除する</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        ) : (
                                            <Button variant="outline" size="sm" onClick={() => handleRestore(item.id, item.name)} className="shrink-0">
                                                <ArchiveRestore className="w-4 h-4 mr-1" />復元する
                                            </Button>
                                        )
                                    )}
                                </div>

                                {/* 原価情報 */}
                                <div className="grid grid-cols-3 gap-2 border-t pt-3">
                                    <div className="text-center">
                                        <div className="text-xs text-muted-foreground mb-0.5">理論原価</div>
                                        <div className="font-bold text-base">¥{item.calculated_cost?.toLocaleString() || 0}</div>
                                    </div>
                                    <div className="text-center border-x">
                                        <div className="text-xs text-muted-foreground mb-0.5">原価率</div>
                                        <div className={`font-bold text-base ${costRate > 40 ? "text-destructive" : ""}`}>
                                            {costRate.toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs text-muted-foreground mb-0.5">1品粗利</div>
                                        <div className="font-bold text-base text-primary">¥{Math.max(0, item.price - (item.calculated_cost || 0)).toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "メニューを編集" : "メニューを新規追加"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="category" className="text-right">
                                カテゴリ <span className="text-destructive">*</span>
                            </Label>
                            <div className="col-span-3">
                                <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })}>
                                    <SelectTrigger id="category">
                                        <SelectValue placeholder="カテゴリを選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="軽食">軽食</SelectItem>
                                        <SelectItem value="ドリンク">ドリンク</SelectItem>
                                        <SelectItem value="デザート">デザート</SelectItem>
                                        <SelectItem value="限定">限定</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                メニュー名 <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="col-span-3"
                                placeholder="例: 春キャベツのペペロンチーノ"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="price" className="text-right">
                                価格 (¥) <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="price"
                                type="number"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            キャンセル
                        </Button>
                        <Button onClick={handleSave}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
