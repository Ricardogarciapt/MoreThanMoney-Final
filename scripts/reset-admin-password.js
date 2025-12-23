const { createClient } = require("@supabase/supabase-js")

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iwscxotvmtkphajmasof.supabase.co"
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTY0MjM2MywiZXhwIjoyMDY1MjE4MzYzfQ.OSFUPZLlx4IaETqqfQPnt-pnYG-hau5NOJ_GHonpuOk"

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function resetAdminPassword() {
  try {
    console.log("🔄 Redefinindo senha do admin...")
    
    const adminEmail = "ricardogarciapt@proton.me"
    const adminPassword = "Superacao2022#"

    // 1. Buscar o usuário
    console.log("�� Buscando usuário...")
    const { data: existingUsers, error: searchError } = await supabase.auth.admin.listUsers()
    if (searchError) throw searchError
    
    const user = existingUsers.users.find(u => u.email === adminEmail)
    if (!user) {
      throw new Error("Usuário não encontrado no Auth")
    }

    console.log("✅ Usuário encontrado:", user.id)

    // 2. Atualizar a senha
    console.log("🔐 Atualizando senha...")
    const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: adminPassword }
    )

    if (updateError) {
      console.error("❌ Erro ao atualizar senha:", updateError)
      throw updateError
    }

    console.log("✅ Senha atualizada com sucesso!")
    console.log("📧 Email:", updateData.user.email)
    console.log("")
    console.log("🔑 Credenciais de acesso:")
    console.log("- Email: ricardogarciapt@proton.me")
    console.log("- Password: Superacao2022#")
    console.log("")
    console.log("✅ Senha redefinida! Agora você pode fazer login.")

  } catch (error) {
    console.error("❌ Erro durante a redefinição:", error)
  }
}

// Executar o script
resetAdminPassword()
