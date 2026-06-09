import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Verificar se é admin ou VIP
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, membership_level')
      .eq('id', session.user.id)
      .single()

    if (!profile || (profile.user_type !== 'admin' && profile.membership_level !== 'vip')) {
      return NextResponse.json({ error: 'Acesso negado. Apenas admins e VIP podem partilhar charts' }, { status: 403 })
    }

    const body = await request.json()
    const { groupId, groupName, chartUrl, chartImage, symbol } = body

    if (!groupId && !groupName) {
      return NextResponse.json({ error: 'ID ou nome do grupo é obrigatório' }, { status: 400 })
    }

    let group
    
    // Se tiver groupId, usar diretamente
    if (groupId) {
      const { data: groupData, error: groupError } = await supabase
        .from('group_conversations')
        .select('id, name')
        .eq('id', groupId)
        .single()

      if (groupError || !groupData) {
        return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
      }
      
      group = groupData
    } else {
      // Fallback: buscar pelo nome (compatibilidade com código antigo)
      const groupNameMap: Record<string, string> = {
        'trade-chat': 'Trade Chat',
        'crypto-chat': 'Crypto Chat',
        'social-chat': 'Social Chat'
      }

      const actualGroupName = groupNameMap[groupName] || groupName

      const { data: groupData, error: groupError } = await supabase
        .from('group_conversations')
        .select('id, name')
        .eq('name', actualGroupName)
        .eq('is_mobile_visible', true)
        .single()

      if (groupError || !groupData) {
        return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 })
      }
      
      group = groupData
    }

    // Verificar se o utilizador é membro do grupo OU se é admin/VIP (podem partilhar em qualquer grupo)
    const isAdminOrVip = profile?.user_type === 'admin' || profile?.membership_level === 'vip'
    
    if (!isAdminOrVip) {
      // Se não for admin/VIP, verificar se é membro
      const { data: member } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', group.id)
        .eq('user_id', session.user.id)
        .single()

      if (!member) {
        return NextResponse.json({ error: 'Não és membro deste grupo' }, { status: 403 })
      }
    }

    // Criar mensagem com chart
    const messageContent = chartImage 
      ? `📊 Gráfico: ${symbol}\n🔗 Link: ${chartUrl || 'N/A'}`
      : `📊 Gráfico: ${symbol}\n🔗 ${chartUrl || 'N/A'}`

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        group_id: group.id,
        sender_id: session.user.id,
        content: messageContent
      })
      .select()
      .single()

    if (messageError) {
      console.error('Erro ao criar mensagem:', messageError)
      return NextResponse.json({ error: 'Erro ao partilhar gráfico' }, { status: 500 })
    }

    // Se tiver imagem, fazer upload para storage e atualizar mensagem
    if (chartImage) {
      try {
        // Converter base64 para blob se necessário
        const imageBlob = chartImage.startsWith('data:') 
          ? await fetch(chartImage).then(r => r.blob())
          : new Blob([chartImage], { type: 'image/png' })

        const fileName = `chart-${symbol}-${Date.now()}.png`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('group-messages')
          .upload(`${group.id}/${fileName}`, imageBlob, {
            contentType: 'image/png',
            upsert: false
          })

        if (!uploadError && uploadData) {
          const { data: { publicUrl } } = supabase.storage
            .from('group-messages')
            .getPublicUrl(uploadData.path)

          // Atualizar mensagem com URL da imagem
          await supabase
            .from('messages')
            .update({ content: `${messageContent}\n🖼️ Imagem: ${publicUrl}` })
            .eq('id', message.id)
        }
      } catch (imageError) {
        console.error('Erro ao fazer upload da imagem:', imageError)
        // Continuar mesmo se o upload falhar
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Gráfico partilhado com sucesso',
      messageId: message.id
    })
  } catch (error) {
    console.error('Erro na API de partilha de chart:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

