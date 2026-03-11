"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { MenuItem, Ingredient, RecipeWithIngredient } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Tag, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function RecipesPage() {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

    const [recipes, setRecipes] = useState<RecipeWithIngredient[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [formData, setFormData] = useState({
        id: "", // 編集時のみ使用
        ingredient_id: "",
        quantity_required: "" as string, // 分数入力も受け付けるためstring型に
    });

    /**
     * 分数文字列（1/4など）または数値文字列をnumberに変換
     * 全角数字・全角スラッシュにも対応
     * 不正な入力の場合はNaNを返す
     */
    const parseFraction = (value: string): number => {
        // 全角数字を半角に、全角スラッシュを半角スラッシュに変換
        let strVal = String(value).trim()
            .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
            .replace(/／/g, '/');

        // 分数形式 (e.g. "1/4", "2/3")
        if (strVal.includes("/")) {
            const parts = strVal.split("/");
            if (parts.length === 2) {
                const numerator = parseFloat(parts[0]);
                const denominator = parseFloat(parts[1]);
                if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
                    return numerator / denominator;
                }
            }
            return NaN;
        }
        // 数値形式
        return parseFloat(strVal);
    };

    /**
     * 数値を表示用の分数文字列に変換
     * 0.5 → "1/2", 0.25 → "1/4", 0.75 → "3/4" など。切り切れない場合は数値のまま返す
     */
    const formatQuantity = (num: number): string => {
        if (Number.isInteger(num)) return String(num);
        const commonFractions: { value: number; label: string }[] = [
            { value: 1/8, label: "1/8" }, { value: 1/6, label: "1/6" },
            { value: 1/5, label: "1/5" }, { value: 1/4, label: "1/4" },
            { value: 1/3, label: "1/3" }, { value: 3/8, label: "3/8" },
            { value: 2/5, label: "2/5" }, { value: 1/2, label: "1/2" },
            { value: 3/5, label: "3/5" }, { value: 5/8, label: "5/8" },
            { value: 2/3, label: "2/3" }, { value: 3/4, label: "3/4" },
            { value: 4/5, label: "4/5" }, { value: 5/6, label: "5/6" },
            { value: 7/8, label: "7/8" },
        ];
        // 整数部分と小数部分に分ける
        const intPart = Math.floor(num);
        const fracPart = num - intPart;
        const match = commonFractions.find(f => Math.abs(f.value - fracPart) < 0.001);
        if (match) {
            return intPart > 0 ? `${intPart} ${match.label}` : match.label;
        }
        // 一致する分数がなければ数値をそのまま表示
        return String(parseFloat(num.toFixed(4)));
    };

    // 初期データ（メニュー一覧と食材一覧）の取得
    useEffect(() => {
        const fetchInitialData = async () => {
            const [menuRes, ingredientRes] = await Promise.all([
                supabase.from("menu_items").select("*").eq("is_active", true).order("category").order("name"),
                supabase.from("ingredients").select("*").eq("is_active", true).order("name")
            ]);

            if (menuRes.error) toast.error("メニューの取得に失敗しました");
            else setMenuItems(menuRes.data || []);

            if (ingredientRes.error) toast.error("食材の取得に失敗しました");
            else setIngredients(ingredientRes.data || []);

            setIsLoading(false);
        };
        fetchInitialData();
    }, []);

    // 選択されたメニューのレシピ（構成成分）を取得
    const fetchRecipes = async (menuId: string) => {
        const { data, error } = await supabase
            .from("recipes")
            .select(`
        *,
        ingredient:ingredients(*)
      `)
            .eq("menu_item_id", menuId);

        if (error) {
            toast.error("レシピの取得に失敗しました");
            console.error(error);
        } else {
            setRecipes(data as RecipeWithIngredient[]);
        }
    };

    useEffect(() => {
        if (selectedMenuId) {
            fetchRecipes(selectedMenuId);
        } else {
            setRecipes([]);
        }
    }, [selectedMenuId]);

    const openDialog = (recipe?: RecipeWithIngredient) => {
        if (recipe) {
            setFormData({
                id: recipe.id,
                ingredient_id: recipe.ingredient_id,
                // 保存値（数値）を分数表記に戻して表示
                quantity_required: formatQuantity(recipe.quantity_required),
            });
        } else {
            setFormData({ id: "", ingredient_id: "", quantity_required: "" });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        const parsedQty = parseFraction(String(formData.quantity_required));
        if (!selectedMenuId || !formData.ingredient_id || isNaN(parsedQty) || parsedQty <= 0) {
            toast.error("正しく入力してください（例: 150, 1/4, 0.5）");
            return;
        }

        if (formData.id) {
            // 編集モード
            const { error } = await supabase
                .from("recipes")
                .update({ quantity_required: parsedQty })
                .eq("id", formData.id);

            if (error) {
                toast.error("必要量の更新に失敗しました");
            } else {
                toast.success("必要量を更新しました");
                setIsDialogOpen(false);
                fetchRecipes(selectedMenuId);
            }
        } else {
            // 重複チェック
            if (recipes.some(r => r.ingredient_id === formData.ingredient_id)) {
                toast.error("この食材は既に登録されています");
                return;
            }

            // 新規追加モード
            const { error } = await supabase
                .from("recipes")
                .insert([{
                    menu_item_id: selectedMenuId,
                    ingredient_id: formData.ingredient_id,
                    quantity_required: parsedQty,
                }]);

            if (error) {
                toast.error("食材の追加に失敗しました");
            } else {
                toast.success("レシピに食材を追加しました");
                setIsDialogOpen(false);
                fetchRecipes(selectedMenuId);
            }
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("この食材をレシピから削除しますか？")) return;

        const { error } = await supabase
            .from("recipes")
            .delete()
            .eq("id", id);

        if (error) {
            toast.error("削除に失敗しました");
        } else {
            toast.success("レシピから食材を削除しました");
            if (selectedMenuId) fetchRecipes(selectedMenuId);
        }
    };

    const selectedMenu = menuItems.find(m => m.id === selectedMenuId);

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">レシピ管理</h2>
                <p className="text-muted-foreground">メニューに使用する食材と必要量を設定します（在庫自動減算に利用されます）</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* メニュー選択サイドバー */}
                <Card className="md:col-span-1 h-[calc(100vh-12rem)] overflow-y-auto">
                    <CardHeader>
                        <CardTitle className="text-lg">メニュー一覧</CardTitle>
                        <CardDescription>構成を編集するメニューを選択</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {isLoading ? (
                            <div className="text-center text-muted-foreground py-4">読み込み中...</div>
                        ) : (
                            menuItems.map((menu) => (
                                <button
                                    key={menu.id}
                                    onClick={() => setSelectedMenuId(menu.id)}
                                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${selectedMenuId === menu.id
                                        ? "bg-primary text-primary-foreground font-medium"
                                        : "hover:bg-accent"
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <UtensilsCrossed className="w-4 h-4 shrink-0" />
                                        <span className="truncate">{menu.name}</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* レシピ編集エリア */}
                <div className="md:col-span-2 space-y-4">
                    {!selectedMenuId ? (
                        <Card className="h-full flex items-center justify-center min-h-[400px]">
                            <div className="text-center text-muted-foreground">
                                <UtensilsCrossed className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                左のリストからメニューを選択してください
                            </div>
                        </Card>
                    ) : (
                        <>
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="secondary">{selectedMenu?.category}</Badge>
                                        <h3 className="text-xl font-bold">{selectedMenu?.name}</h3>
                                    </div>
                                    <p className="text-sm text-muted-foreground">1食あたりの使用量</p>
                                </div>
                                <Button onClick={() => openDialog()} className="gap-2">
                                    <Plus className="w-4 h-4" />
                                    食材を紐付ける
                                </Button>
                            </div>

                            {/* ===== PC用テーブル（md以上のみ表示） ===== */}
                            <div className="hidden md:block border rounded-md bg-card">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>食材名</TableHead>
                                            <TableHead>必要量 (1食)</TableHead>
                                            <TableHead>単位</TableHead>
                                            <TableHead className="text-right">操作</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recipes.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                                    食材が登録されていません。<br />「食材を紐付ける」から追加してください。
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            recipes.map((recipe) => (
                                                <TableRow key={recipe.id}>
                                                    <TableCell className="font-medium">{recipe.ingredient?.name}</TableCell>
                                                    <TableCell>{formatQuantity(recipe.quantity_required)}</TableCell>
                                                    <TableCell>{recipe.ingredient?.unit}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" className="text-muted-foreground mr-2" size="sm" onClick={() => openDialog(recipe)}>
                                                            編集
                                                        </Button>
                                                        <Button variant="ghost" className="text-destructive hover:bg-destructive/10" size="icon" onClick={() => handleDelete(recipe.id)}>
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* ===== モバイル用カードリスト（md未満のみ表示） ===== */}
                            <div className="md:hidden flex flex-col gap-3">
                                {recipes.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">
                                        食材が登録されていません。「食材を紐付ける」から追加してください。
                                    </div>
                                ) : (
                                    recipes.map((recipe) => (
                                        <div key={recipe.id} className="border rounded-xl p-4 shadow-sm bg-card">
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <div className="font-bold text-lg">{recipe.ingredient?.name}</div>
                                                    <div className="text-muted-foreground text-sm mt-0.5">
                                                        1食あたり: <span className="font-bold text-foreground">{formatQuantity(recipe.quantity_required)} {recipe.ingredient?.unit}</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    <Button variant="outline" size="sm" onClick={() => openDialog(recipe)}>
                                                        編集
                                                    </Button>
                                                    <Button variant="destructive" size="icon" onClick={() => handleDelete(recipe.id)}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{formData.id ? "必要量の編集" : "レシピに食材を追加"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="ingredient" className="text-right">
                                食材 <span className="text-destructive">*</span>
                            </Label>
                            <div className="col-span-3">
                                <Select
                                    value={formData.ingredient_id}
                                    onValueChange={(val) => setFormData({ ...formData, ingredient_id: val })}
                                    disabled={!!formData.id} // 編集時は食材自体の変更不可
                                >
                                    <SelectTrigger id="ingredient">
                                        <SelectValue placeholder="食材を選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ingredients.map((ing) => (
                                            <SelectItem key={ing.id} value={ing.id}>
                                                {ing.name} ({ing.unit})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="quantity" className="text-right">
                                必要量 <br/><span className="text-xs text-muted-foreground">(分数対応)</span> <span className="text-destructive">*</span>
                            </Label>
                            <div className="col-span-3 space-y-1">
                                <Input
                                    key="quantity-fraction-input"
                                    id="quantity"
                                    type="text"
                                    inputMode="text"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    value={formData.quantity_required}
                                    onChange={(e) => setFormData(prev => ({ ...prev, quantity_required: e.target.value }))}
                                    placeholder="例: 150, 1/4, 1/3"
                                />
                                <p className="text-xs text-muted-foreground">
                                    整数・小数・分数（1/4, 1/3など）で入力できます
                                </p>
                            </div>
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
