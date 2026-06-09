import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

// GET - Listar documentos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const onlyPublic = searchParams.get('onlyPublic') === 'true'

    let query = supabase
      .from('documents')
      .select('*, profiles!documents_uploaded_by_fkey(full_name, username, user_type)')
      .order('created_at', { ascending: false })

    // Filtros
    if (!includeArchived) {
      query = query.eq('is_archived', false)
    }

    if (onlyPublic) {
      query = query.eq('is_public', true)
    }

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data: documents, error } = await query

    if (error) {
      console.error('❌ [DOCUMENTS API] Erro ao buscar:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`✅ [DOCUMENTS API] ${documents?.length || 0} documentos retornados`)

    return NextResponse.json({
      success: true,
      documents: documents || [],
      total: documents?.length || 0
    })

  } catch (error: any) {
    console.error('❌ [DOCUMENTS API] Erro geral:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Criar novo documento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      title, 
      description, 
      file_url, 
      file_type, 
      category, 
      tags, 
      is_public,
      uploaded_by,
      uploader_name
    } = body

    // Validações
    if (!title || !file_url || !uploaded_by) {
      return NextResponse.json({ 
        error: 'Título, URL do ficheiro e ID do uploader são obrigatórios' 
      }, { status: 400 })
    }

    // Verificar se o usuário é VIP ou Admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, is_active, full_name')
      .eq('id', uploaded_by)
      .single()

    if (!profile || !['admin', 'vip'].includes(profile.user_type) || !profile.is_active) {
      return NextResponse.json({ 
        error: 'Apenas VIPs e Admins podem fazer upload de documentos' 
      }, { status: 403 })
    }

    // Criar documento
    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        title,
        description: description || null,
        file_url,
        file_type: file_type || 'link',
        category: category || 'geral',
        uploaded_by,
        uploader_name: uploader_name || profile.full_name || 'Educador MTM',
        tags: tags || [],
        is_public: is_public !== undefined ? is_public : true,
        is_archived: false,
        views_count: 0,
        downloads_count: 0
      })
      .select()
      .single()

    if (error) {
      console.error('❌ [DOCUMENTS API] Erro ao criar:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log da atividade
    await supabase.rpc('log_activity', {
      p_user_email: profile.full_name || uploaded_by,
      p_action: 'document_created',
      p_details: `Documento criado: ${title}`
    }).then(() => {}).catch((e: any) => console.warn('Log falhou:', e))

    console.log(`✅ [DOCUMENTS API] Documento criado: ${title}`)

    return NextResponse.json({
      success: true,
      document,
      message: 'Documento criado com sucesso'
    })

  } catch (error: any) {
    console.error('❌ [DOCUMENTS API] Erro ao criar:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Atualizar documento
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      id, 
      title, 
      description, 
      file_url, 
      file_type, 
      category, 
      tags, 
      is_public,
      is_archived
    } = body

    if (!id) {
      return NextResponse.json({ error: 'ID do documento é obrigatório' }, { status: 400 })
    }

    // Preparar updates
    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description
    if (file_url !== undefined) updates.file_url = file_url
    if (file_type !== undefined) updates.file_type = file_type
    if (category !== undefined) updates.category = category
    if (tags !== undefined) updates.tags = tags
    if (is_public !== undefined) updates.is_public = is_public
    if (is_archived !== undefined) updates.is_archived = is_archived

    const { data: document, error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ [DOCUMENTS API] Erro ao atualizar:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`✅ [DOCUMENTS API] Documento atualizado: ${id}`)

    return NextResponse.json({
      success: true,
      document,
      message: 'Documento atualizado com sucesso'
    })

  } catch (error: any) {
    console.error('❌ [DOCUMENTS API] Erro ao atualizar:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Deletar documento (apenas admins)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID do documento é obrigatório' }, { status: 400 })
    }

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ [DOCUMENTS API] Erro ao deletar:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`✅ [DOCUMENTS API] Documento deletado: ${id}`)

    return NextResponse.json({
      success: true,
      message: 'Documento deletado com sucesso'
    })

  } catch (error: any) {
    console.error('❌ [DOCUMENTS API] Erro ao deletar:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

