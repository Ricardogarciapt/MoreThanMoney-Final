const { createClient } = require("@supabase/supabase-js")

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iwscxotvmtkphajmasof.supabase.co"
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTY0MjM2MywiZXhwIjoyMDY1MjE4MzYzfQ.OSFUPZLlx4IaETqqfQPnt-pnYG-hau5NOJ_GHonpuOk"

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTableStructure() {
  try {
    console.log("🔍 Verificando estrutura da tabela users...")
    
    // Buscar todos os usuários para ver a estrutura
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .limit(5)

    if (error) {
      console.error("❌ Erro ao buscar usuários:", error)
      return
    }

    console.log("📋 Estrutura da tabela users:")
    if (users && users.length > 0) {
      const columns = Object.keys(users[0])
      columns.forEach((column, index) => {
        console.log(`${index + 1}. ${column}`)
      })
      
      console.log("")
      console.log("📊 Dados de exemplo:")
      console.log(JSON.stringify(users[0], null, 2))
    } else {
      console.log("ℹ️ Tabela users está vazia")
    }

  } catch (error) {
    console.error("❌ Erro durante a verificação:", error)
  }
}

// Executar o script
checkTableStructure()
