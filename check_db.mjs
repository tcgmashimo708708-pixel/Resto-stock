import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log('--- Ingredients ---');
    const { data: ingredients, error: err1 } = await supabase
        .from('ingredients')
        .select('*')
        .like('name', '%クリーム%');

    if (err1) console.error(err1);
    else console.log(ingredients);

    console.log('\n--- Menu Items ---');
    const { data: menuItems, error: err2 } = await supabase
        .from('menu_items')
        .select('*')
        .like('name', '%ワッフル%');

    if (err2) console.error(err2);
    else console.log(menuItems);
}

checkData();
