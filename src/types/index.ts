export type Ingredient = {
    id: string;
    name: string;
    unit: string;
    unit_cost: number;
    threshold: number;
    current_stock: number;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
};

export type MenuItem = {
    id: string;
    name: string;
    price: number;
    category: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
};

export type Recipe = {
    id: string;
    menu_item_id: string;
    ingredient_id: string;
    quantity_required: number;
    created_at?: string;
};

export type RecipeWithIngredient = Recipe & {
    ingredient?: Ingredient;
};

export type MenuItemWithRecipes = MenuItem & {
    recipes?: RecipeWithIngredient[];
};

export type InventoryLog = {
    id: string;
    ingredient_id: string;
    actual_quantity: number;
    counted_at: string;
    created_at?: string;
};

export type DailySale = {
    id: string;
    date: string;
    menu_item_id: string;
    quantity_sold: number;
    created_at?: string;
};

export type PurchaseLog = {
    id: string;
    ingredient_id: string;
    purchased_quantity: number;
    purchased_at: string;
    created_at?: string;
};
