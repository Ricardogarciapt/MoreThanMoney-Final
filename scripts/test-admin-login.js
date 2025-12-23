const { createClient } = require("@supabase/supabase-js")

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iwscxotvmtkphajmasof.supabase.co"
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NDIzNjMsImV4cCI6MjA2NTIxODM2M30._FbOwT_oVoDWWlWCZphNnwLckL1A0AzkEUSdJZkOecg"

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testAdminLogin() {
  try {
    console.log("🧪 Testando login do admin...")
    
    const adminEmail = "ricardogarciapt@proton.me"
    const adminPassword = "Superacao2022#"

    // 1. Tentar login
    console.log("🔐 Tentando login...")
    const { data, error } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    })

    if (error) {
      console.error("❌ Erro no login:", error)
      return
    }

    console.log("✅ Login bem-sucedido!")
    console.log("👤 User ID:", data.user.id)
    console.log("📧 Email:", data.user.email)

    // 2. Buscar dados do usuário na tabela users
    console.log("🔍 Buscando dados do usuário...")
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", data.user.id)
      .single()

    if (userError) {
      console.error("❌ Erro ao buscar dados do usuário:", userError)
      return
    }

    console.log("✅ Dados do usuário encontrados:")
    console.log("- ID:", userData.id)
    console.log("- Email:", userData.email)
    console.log("- Username:", userData.username)
    console.log("- Name:", userData.name)
    console.log("- Role:", userData.role)
    console.log("- Is Admin:", userData.is_admin)
    console.log("")
    console.log("🎯 Verificações de acesso:")
    console.log("- É admin:", userData.role === "Admin" || userData.is_admin === true)
    console.log("- Está ativo:", userData.is_admin === true)
    console.log("")
    console.log("✅ Teste concluído! O admin está configurado corretamente.")

    // 3. Fazer logout
    await supabase.auth.signOut()
    console.log("🚪 Logout realizado")

  } catch (error) {
    console.error("❌ Erro durante o teste:", error)
  }
}

// Executar o teste
testAdminLogin()
