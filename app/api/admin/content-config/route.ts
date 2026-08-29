/**
 * Fechado a 2026-08-28: esta rota corria com a service-role e SEM verificar quem chamava.
 *
 * Uma rota assim nao e "menos protegida" — nao tem protecao nenhuma. Bastava saber o endereco.
 * O `delete-user` apagava contas, o `approve-user` dava acesso, o chat do dashboard corria o
 * modelo com as ferramentas todas na nossa conta. Testado contra producao antes de fechar.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { defaultContentConfig, type ContentConfig } from "@/lib/content-config"
import { requireAdmin } from "@/lib/admin-api-helpers"

// GET - Obter configuração de conteúdo
export async function GET(request: NextRequest) {
  const guarda = await requireAdmin(request)
  if (guarda) return guarda

  try {
    const supabase = getSupabaseAdmin()
    
    // Buscar da tabela admin_settings usando setting_key
    const { data, error } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'site_content')
      .single()
    
    if (error || !data?.setting_value) {
      console.log('[CONTENT_CONFIG_GET] Retornando configuração padrão')
      // Retornar configuração padrão se não existir
      return NextResponse.json(defaultContentConfig)
    }
    
    // Parse do JSON armazenado
    const contentConfig = JSON.parse(data.setting_value)
    return NextResponse.json(contentConfig as ContentConfig)
  } catch (error) {
    console.error('[CONTENT_CONFIG_GET]', error)
    // Retornar configuração padrão em caso de erro
    return NextResponse.json(defaultContentConfig)
  }
}

// PUT - Atualizar configuração de conteúdo
export async function PUT(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  try {
    const supabase = getSupabaseAdmin()
    const body = await req.json()
    
    // Validar que é uma ContentConfig válida
    if (!body.videos || !body.links || !body.images) {
      return NextResponse.json(
        { error: 'Configuração inválida. Deve conter videos, links e images.' },
        { status: 400 }
      )
    }
    
    console.log('[CONTENT_CONFIG_PUT] Salvando configuração:', {
      videos: body.videos.length,
      links: body.links.length,
      images: body.images.length
    })
    
    // Usar upsert com a estrutura correta (setting_key, setting_value)
    const { error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_key: 'site_content',
        setting_value: JSON.stringify(body),
        description: 'Configuração de vídeos e links do site',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_key'
      })
    
    if (error) {
      console.error('[CONTENT_CONFIG_PUT] Erro ao salvar:', error)
      throw error
    }
    
    console.log('[CONTENT_CONFIG_PUT] ✅ Configuração salva com sucesso')
    
    return NextResponse.json({ 
      success: true, 
      message: 'Configuração de conteúdo atualizada com sucesso!' 
    })
  } catch (error: any) {
    console.error('[CONTENT_CONFIG_PUT]', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao atualizar configuração de conteúdo' },
      { status: 500 }
    )
  }
}

