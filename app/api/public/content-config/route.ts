import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { defaultContentConfig } from "@/lib/content-config"

// GET público - Obter configuração de conteúdo (sem autenticação)
export async function GET() {
  try {
    const supabase = createServerClient()
    
    // Buscar da tabela admin_settings
    const { data, error } = await supabase
      .from('admin_settings')
      .select('content_config')
      .eq('key', 'site_content')
      .single()
    
    if (error || !data?.content_config) {
      // Retornar configuração padrão se não existir
      return NextResponse.json(defaultContentConfig)
    }
    
    return NextResponse.json(data.content_config)
  } catch (error) {
    console.error('[PUBLIC_CONTENT_CONFIG_GET]', error)
    // Retornar configuração padrão em caso de erro
    return NextResponse.json(defaultContentConfig)
  }
}

// Configuração de cache
export const revalidate = 60 // Revalidar a cada 60 segundos

