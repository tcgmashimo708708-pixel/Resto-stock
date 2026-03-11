"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Ingredient } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, ArchiveRestore, ArrowUp, ArrowDown, GripVertical, Save, X, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// =====================
// 業者の型定義
// =====================
type Supplier = {
    id: string;
    name: string;
    order_days: number[];
};

export default function IngredientsPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [showInactive, setShowInactive] = useState(false);
    const [isSortMode, setIsSortMode] = useState(false);

    // 業者
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    // 食材ごとの業者割当: { [ingredientId]: Supplier[] }
    const [ingredientSuppliers, setIngredientSuppliers] = useState<Record<string, Supplier[]>>({});
    // 業者ポップアップの対象食材ID
    const [supplierPickerId, setSupplierPickerId] = useState<string | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

    // フォームステート
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        unit: "",
        unit_cost: 0,
        threshold: 0,
        current_stock: 0,
    });

    // =====================
    // データフェッチ
    // =====================
    const fetchIngredients = async () => {
        setIsLoading(true);
        let query = supabase
            .from("ingredients")
            .select("*")
            .order("sort_order", { ascending: true, nullsFirst: false })
            .order("name");
        if (!showInactive) query = query.eq("is_active", true);
        const { data, error } = await query;
        if (error) { toast.error("食材の取得に失敗しました"); console.error(error); }
        else { setIngredients(data || []); }
        setIsLoading(false);
    };

    const fetchSuppliers = async () => {
        const { data } = await supabase.from("suppliers").select("*").order("name");
        setSuppliers(data || []);
    };

    const fetchIngredientSuppliers = async (ingredientIds: string[]) => {
        if (ingredientIds.length === 0) return;
        const { data } = await supabase
            .from("ingredient_suppliers")
            .select("ingredient_id, supplier:supplier_id(id, name, order_days)")
            .in("ingredient_id", ingredientIds);
        if (!data) return;
        const map: Record<string, Supplier[]> = {};
        for (const row of data as any[]) {
            if (!map[row.ingredient_id]) map[row.ingredient_id] = [];
            if (row.supplier) map[row.ingredient_id].push(row.supplier);
        }
        setIngredientSuppliers(map);
    };

    useEffect(() => { fetchIngredients(); fetchSuppliers(); }, [showInactive]);
    useEffect(() => {
        if (ingredients.length > 0) fetchIngredientSuppliers(ingredients.map(i => i.id));
    }, [ingredients]);

    // ポップオーバー外クリックで閉じる
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setSupplierPickerId(null);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // =====================
    // 業者割当・解除
    // =====================
    const handleAddSupplier = async (ingredientId: string, supplierId: string) => {
        const { error } = await supabase
            .from("ingredient_suppliers")
            .insert({ ingredient_id: ingredientId, supplier_id: supplierId });
        if (error) { toast.error("業者の割当に失敗しました"); return; }
        await fetchIngredientSuppliers(ingredients.map(i => i.id));
        setSupplierPickerId(null);
        toast.success("業者を割り当てました");
    };

    const handleRemoveSupplier = async (ingredientId: string, supplierId: string) => {
        const { error } = await supabase
            .from("ingredient_suppliers")
            .delete()
            .eq("ingredient_id", ingredientId)
            .eq("supplier_id", supplierId);
        if (error) { toast.error("業者の解除に失敗しました"); return; }
        await fetchIngredientSuppliers(ingredients.map(i => i.id));
        toast.success("業者を解除しました");
    };

    // =====================
    // CRUD（食材）
    // =====================
    const openDialog = (ingredient?: Ingredient) => {
        if (ingredient) {
            setEditingId(ingredient.id);
            setFormData({ name: ingredient.name, unit: ingredient.unit, unit_cost: ingredient.unit_cost, threshold: ingredient.threshold, current_stock: ingredient.current_stock });
        } else {
            setEditingId(null);
            setFormData({ name: "", unit: "", unit_cost: 0, threshold: 0, current_stock: 0 });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name || !formData.unit) { toast.error("必須項目を入力してください"); return; }
        if (editingId) {
            const { error } = await supabase.from("ingredients").update({ name: formData.name, unit: formData.unit, unit_cost: formData.unit_cost, threshold: formData.threshold, current_stock: formData.current_stock }).eq("id", editingId);
            if (error) { toast.error("更新に失敗しました"); } else { toast.success("食材を更新しました"); setIsDialogOpen(false); fetchIngredients(); }
        } else {
            const { error } = await supabase.from("ingredients").insert([{ name: formData.name, unit: formData.unit, unit_cost: formData.unit_cost, threshold: formData.threshold, current_stock: formData.current_stock }]);
            if (error) { toast.error("追加に失敗しました"); } else { toast.success("食材を追加しました"); setIsDialogOpen(false); fetchIngredients(); }
        }
    };

    const handleStopUse = async (id: string, name: string) => {
        const { error } = await supabase.from("ingredients").update({ is_active: false }).eq("id", id);
        if (error) { toast.error("失敗しました"); } else { toast.success(`「${name}」を使用停止にしました`); fetchIngredients(); }
    };

    const handleDeletePermanent = async (id: string, name: string) => {
        const { error } = await supabase.from("ingredients").delete().eq("id", id);
        if (error) { toast.error("完全削除に失敗しました"); } else { toast.success(`「${name}」を完全に削除しました`); fetchIngredients(); }
    };

    const handleRestore = async (id: string, name: string) => {
        const { error } = await supabase.from("ingredients").update({ is_active: true }).eq("id", id);
        if (error) { toast.error("復元に失敗しました"); } else { toast.success(`「${name}」を復元しました`); fetchIngredients(); }
    };

    // =====================
    // 並び替え
    // =====================
    const handleMoveUp = (index: number) => {
        if (index === 0) return;
        const newList = [...ingredients];
        [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
        setIngredients(newList);
    };

    const handleMoveDown = (index: number) => {
        if (index === ingredients.length - 1) return;
        const newList = [...ingredients];
        [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
        setIngredients(newList);
    };

    const handleSortSave = async () => {
        setIsLoading(true);
        try {
            const updates = ingredients.map((item, index) =>
                supabase.from("ingredients").update({ sort_order: index + 1 }).eq("id", item.id)
            );
            const results = await Promise.all(updates);
            if (results.some(r => r.error)) { toast.error("一部の保存に失敗しました"); }
            else { toast.success("並び順を保存しました"); setIsSortMode(false); }
        } catch { toast.error("保存処理に失敗しました"); }
        finally { setIsLoading(false); }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">食材管理</h2>
                    <p className="text-muted-foreground">新しい食材の登録や、在庫の閾値を設定します</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {isSortMode ? (
                        <>
                            <Button variant="outline" onClick={() => { setIsSortMode(false); fetchIngredients(); }}>キャンセル</Button>
                            <Button onClick={handleSortSave} disabled={isLoading} className="gap-2">
                                <Save className="w-4 h-4" />並び順を保存
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => setShowInactive(!showInactive)}>
                                {showInactive ? "使用停止を隠す" : "使用停止を表示"}
                            </Button>
                            <Button variant="outline" onClick={() => setIsSortMode(true)} className="gap-2">
                                <GripVertical className="w-4 h-4" />並び替え
                            </Button>
                            <Button onClick={() => openDialog()} className="gap-2">
                                <Plus className="w-4 h-4" />新規追加
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
                            <TableHead>食材名</TableHead>
                            <TableHead>現在庫</TableHead>
                            <TableHead>単位</TableHead>
                            <TableHead>仕入単価</TableHead>
                            <TableHead>発注アラート閾値</TableHead>
                            <TableHead>業者</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10">読み込み中...</TableCell></TableRow>
                        ) : ingredients.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">食材が登録されていません</TableCell></TableRow>
                        ) : (
                            ingredients.map((item, index) => {
                                const assignedSuppliers = ingredientSuppliers[item.id] || [];
                                const availableSuppliers = suppliers.filter(s => !assignedSuppliers.find(a => a.id === s.id));
                                return (
                                    <TableRow key={item.id} className={!item.is_active ? "opacity-50 grayscale bg-muted/30" : ""}>
                                        {isSortMode && (
                                            <TableCell className="w-20">
                                                <div className="flex items-center gap-0.5">
                                                    <button disabled={index === 0} onClick={() => handleMoveUp(index)} className="p-1 rounded hover:bg-muted disabled:opacity-25">
                                                        <ArrowUp className="w-4 h-4" />
                                                    </button>
                                                    <button disabled={index === ingredients.length - 1} onClick={() => handleMoveDown(index)} className="p-1 rounded hover:bg-muted disabled:opacity-25">
                                                        <ArrowDown className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </TableCell>
                                        )}
                                        <TableCell className="font-medium">
                                            {item.name}
                                            {!item.is_active && <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0 h-4">使用停止</Badge>}
                                        </TableCell>
                                        <TableCell>
                                            <span className={item.current_stock < item.threshold ? "text-destructive font-bold" : ""}>
                                                {item.current_stock}
                                            </span>
                                        </TableCell>
                                        <TableCell>{item.unit}</TableCell>
                                        <TableCell>¥{item.unit_cost}</TableCell>
                                        <TableCell>{item.threshold}</TableCell>

                                        {/* === 業者列 === */}
                                        <TableCell>
                                            <div className="flex flex-col gap-2 min-w-[140px]">
                                                {(assignedSuppliers.length > 0) && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {assignedSuppliers.map(s => (
                                                            <Badge key={s.id} variant="secondary" className="gap-1 pr-1 text-xs">
                                                                {s.name}
                                                                {!isSortMode && item.is_active && (
                                                                    <button
                                                                        onClick={() => handleRemoveSupplier(item.id, s.id)}
                                                                        className="ml-0.5 hover:text-destructive"
                                                                        title="解除"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                                {!isSortMode && item.is_active && availableSuppliers.length > 0 && (
                                                    <select
                                                        className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                        value=""
                                                        onChange={(e) => {
                                                            if (e.target.value) {
                                                                handleAddSupplier(item.id, e.target.value);
                                                            }
                                                        }}
                                                    >
                                                        <option value="" disabled>+ 業者を追加</option>
                                                        {availableSuppliers.map(s => (
                                                            <option key={s.id} value={s.id}>{s.name}</option>
                                                        ))}
                                                    </select>
                                                )}
                                                {!isSortMode && item.is_active && availableSuppliers.length === 0 && (
                                                   <span className="text-[10px] text-muted-foreground">全業者割当済み</span>
                                                )}
                                            </div>
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
                                                                    <span className="block mb-1">📌 <strong>使用停止</strong>：在庫データや履歴は残ります。復元もできます。</span>
                                                                    <span className="block text-destructive">🗑️ <strong>完全に削除</strong>：全てのデータを消去します。元に戻せません。</span>
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                                                                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                                                <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => handleStopUse(item.id, item.name)}>
                                                                    使用停止にする
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
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* ===== モバイル用カードリスト（md未満のみ表示） ===== */}
            <div className="md:hidden flex flex-col gap-3">
                {isLoading ? (
                    <div className="text-center py-10 text-muted-foreground">読み込み中...</div>
                ) : ingredients.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground bg-muted/20 rounded-lg">食材が登録されていません</div>
                ) : (
                    ingredients.map((item, index) => {
                        const assignedSuppliers = ingredientSuppliers[item.id] || [];
                        const availableSuppliers = suppliers.filter(s => !assignedSuppliers.find(a => a.id === s.id));
                        return (
                            <div key={item.id} className={`border rounded-xl p-4 shadow-sm bg-card flex flex-col gap-3 ${!item.is_active ? "opacity-50 grayscale" : ""}`}>
                                {/* カードヘッダー：食材名 + 操作ボタン */}
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {isSortMode && (
                                                <div className="flex items-center gap-0.5">
                                                    <button disabled={index === 0} onClick={() => handleMoveUp(index)} className="p-1.5 rounded bg-muted hover:bg-muted/70 disabled:opacity-25">
                                                        <ArrowUp className="w-4 h-4" />
                                                    </button>
                                                    <button disabled={index === ingredients.length - 1} onClick={() => handleMoveDown(index)} className="p-1.5 rounded bg-muted hover:bg-muted/70 disabled:opacity-25">
                                                        <ArrowDown className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                            <span className="font-bold text-lg">{item.name}</span>
                                            {!item.is_active && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">使用停止</Badge>}
                                        </div>
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
                                                                <span className="block mb-1">📌 <strong>使用停止</strong>：在庫データや履歴は残ります。復元もできます。</span>
                                                                <span className="block text-destructive">🗑️ <strong>完全に削除</strong>：全てのデータを消去します。元に戻せません。</span>
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter className="flex-col gap-2">
                                                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                                            <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => handleStopUse(item.id, item.name)}>
                                                                使用停止にする
                                                            </AlertDialogAction>
                                                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeletePermanent(item.id, item.name)}>
                                                                完全に削除する
                                                            </AlertDialogAction>
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

                                {/* カード詳細：在庫情報 */}
                                <div className="grid grid-cols-3 gap-2 border-t pt-3">
                                    <div className="text-center">
                                        <div className="text-xs text-muted-foreground mb-0.5">現在庫</div>
                                        <div className={`font-bold text-lg ${item.current_stock < item.threshold ? "text-destructive" : ""}`}>
                                            {item.current_stock}
                                            <span className="text-xs font-normal text-muted-foreground ml-0.5">{item.unit}</span>
                                        </div>
                                    </div>
                                    <div className="text-center border-x">
                                        <div className="text-xs text-muted-foreground mb-0.5">仕入単価</div>
                                        <div className="font-bold text-base">¥{item.unit_cost}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs text-muted-foreground mb-0.5">発注閾値</div>
                                        <div className="font-bold text-base">{item.threshold}{item.unit}</div>
                                    </div>
                                </div>

                                {/* 業者情報 */}
                                {item.is_active && !isSortMode && (
                                    <div className="border-t pt-3">
                                        <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                                            <Building2 className="w-3 h-3" />担当業者
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {assignedSuppliers.map(s => (
                                                <Badge key={s.id} variant="secondary" className="gap-1 pr-1 text-xs py-1">
                                                    {s.name}
                                                    <button onClick={() => handleRemoveSupplier(item.id, s.id)} className="ml-0.5 hover:text-destructive">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                            {availableSuppliers.length > 0 && (
                                                <select
                                                    className="h-7 rounded-md border border-dashed border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                                    value=""
                                                    onChange={(e) => { if (e.target.value) handleAddSupplier(item.id, e.target.value); }}
                                                >
                                                    <option value="" disabled>＋ 業者を追加</option>
                                                    {availableSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            )}
                                            {assignedSuppliers.length === 0 && availableSuppliers.length === 0 && (
                                                <span className="text-xs text-muted-foreground">全業者割当済み</span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* 発注警告 */}
                                {item.current_stock < item.threshold && (
                                    <div className="text-xs text-destructive font-bold bg-destructive/10 rounded-md px-3 py-1.5">
                                        ⚠️ 在庫が発注ラインを下回っています
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "食材を編集" : "食材を新規追加"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">食材名 <span className="text-destructive">*</span></Label>
                            <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="col-span-3" placeholder="例: キャベツ" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="unit" className="text-right">単位 <span className="text-destructive">*</span></Label>
                            <Input id="unit" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} className="col-span-3" placeholder="例: g, 個, ml" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="unit_cost" className="text-right">仕入単価 (¥)</Label>
                            <Input id="unit_cost" type="number" value={formData.unit_cost} onChange={(e) => setFormData({ ...formData, unit_cost: Number(e.target.value) })} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="threshold" className="text-right">発注アラート</Label>
                            <Input id="threshold" type="number" value={formData.threshold} onChange={(e) => setFormData({ ...formData, threshold: Number(e.target.value) })} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="current_stock" className="text-right">初期在庫</Label>
                            <Input id="current_stock" type="number" value={formData.current_stock} onChange={(e) => setFormData({ ...formData, current_stock: Number(e.target.value) })} className="col-span-3" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>キャンセル</Button>
                        <Button onClick={handleSave}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
