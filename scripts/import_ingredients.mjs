import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// .env.localから環境変数を読み込む
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const rawData = [
  { name: "バニラアイス", content: "1080g", cost: "¥1,780" },
  { name: "レクレ33", content: "1000g", cost: "¥1,010" },
  { name: "グラニュ糖", content: "1000g", cost: "¥150" },
  { name: "ワッフル", content: "2個", cost: "¥81" },
  { name: "バンホーテンソース", content: "630g", cost: "¥490" },
  { name: "ハーシーソース", content: "623g", cost: "¥620" },
  { name: "バナナ", content: "1000g", cost: "¥310" },
  { name: "アーモンド", content: "100g", cost: "¥370" },
  { name: "モナンストロベリーソース", content: "1000㎖", cost: "¥2,670" },
  { name: "トリプルベリー", content: "500g", cost: "¥760" },
  { name: "フルーツソース（ベリー）", content: "500g", cost: "¥465" },
  { name: "シフォンケーキ", content: "1台", cost: "¥300" },
  { name: "スコーン", content: "680g", cost: "¥346" },
  { name: "ジャム", content: "160g", cost: "¥480" },
  { name: "バニラソフト", content: "12個", cost: "¥1,704" },
  { name: "チョコソフト", content: "12個", cost: "¥1,752" },
  { name: "抹茶ソフト", content: "12個", cost: "¥1,380" },
  { name: "ウエハース", content: "36個", cost: "¥428" },
  { name: "フィアンティーヌ", content: "1000g", cost: "¥3,280" },
  { name: "黒みつソース", content: "360g", cost: "¥360" }
];

async function importIngredients() {
  const insertData = rawData.map(item => {
    // 金額から '¥' と ',' を削除して数値化
    const totalCost = Number(item.cost.replace(/[¥,]/g, ''));
    
    // 内容量から数値と単位を分離 (例: "1080g" -> 1080, "g")
    const match = item.content.match(/^([\d\.]+)(.*)$/);
    let quantity = 1;
    let unit = item.content;
    
    if (match) {
      quantity = Number(match[1]);
      unit = match[2].trim();
      // "㎖" を "ml" に変換するなど表記揺れを吸収
      if (unit === '㎖' || unit === 'ml') unit = 'ml';
    }

    // 1単位あたりの単価を計算 (10進数で丸めるのを防ぐためそのまま計算)
    let unitCost = 0;
    if (quantity > 0) {
      unitCost = totalCost / quantity;
    }

    return {
      name: item.name,
      unit: unit,
      unit_cost: parseFloat(unitCost.toFixed(2)), // 小数第2位で丸める
      threshold: 10, // デフォルト閾値
      current_stock: 0,
      is_active: true
    };
  });

  console.log("Inserting the following data:");
  console.log(insertData);

  const { data, error } = await supabase
    .from('ingredients')
    .insert(insertData)
    .select();

  if (error) {
    console.error("Error inserting data:", error);
  } else {
    console.log(`Successfully inserted ${data.length} ingredients.`);
  }
}

importIngredients();
