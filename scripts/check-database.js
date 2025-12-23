const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("❌ Variáveis de ambiente Supabase não encontradas");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  try {
    console.log("🔍 Verificando base de dados Supabase...");
    console.log("URL:", supabaseUrl);
    
    // Verificar tabelas
    const { data: tables, error: tablesError } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public");
    
    if (tablesError) {
      console.log("❌ Erro ao verificar tabelas:", tablesError.message);
    } else {
      console.log("✅ Tabelas encontradas:", tables?.map(t => t.table_name).join(", "));
    }
    
    // Verificar admin
    const { data: adminUser, error: adminError } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", "ricardogarciapt@proton.me")
      .single();
    
    if (adminError) {
      console.log("❌ Erro ao verificar admin:", adminError.message);
    } else if (adminUser) {
      console.log("✅ Admin encontrado:", adminUser.email, "Role:", adminUser.role);
    } else {
      console.log("⚠️ Admin não encontrado");
    }
    
    // Verificar produtos
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*");
    
    if (productsError) {
      console.log("❌ Erro ao verificar produtos:", productsError.message);
    } else {
      console.log("✅ Produtos encontrados:", products?.length || 0);
    }
    
  } catch (error) {
    console.log("❌ Erro geral:", error.message);
  }
}

checkDatabase();
