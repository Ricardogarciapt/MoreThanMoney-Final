import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { DEFAULT_CHAT_CHANNELS } from '@/lib/default-chat-channels'

/**
 * Sincroniza chat_channels com a estrutura oficial da app-mobile.
 * Idempotente — não apaga canais existentes, apenas cria/atualiza slugs conhecidos.
 */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const supabase = getSupabaseAdmin()

  try {
    const created: string[] = []
    const updated: string[] = []

    for (const channel of DEFAULT_CHAT_CHANNELS) {
      const { data: existing } = await supabase
        .from('chat_channels')
        .select('id, slug')
        .eq('slug', channel.slug)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('chat_channels')
          .update({
            name: channel.name,
            description: channel.description,
            parent_slug: channel.parent_slug,
            position: channel.position,
          })
          .eq('slug', channel.slug)

        if (error) {
          return NextResponse.json(
            { success: false, error: `Erro ao actualizar ${channel.slug}: ${error.message}` },
            { status: 500 },
          )
        }
        updated.push(channel.slug)
      } else {
        const { error } = await supabase.from('chat_channels').insert({
          slug: channel.slug,
          name: channel.name,
          description: channel.description,
          parent_slug: channel.parent_slug,
          position: channel.position,
        })

        if (error) {
          return NextResponse.json(
            { success: false, error: `Erro ao criar ${channel.slug}: ${error.message}` },
            { status: 500 },
          )
        }
        created.push(channel.slug)
      }
    }

    const { data: allChannels } = await supabase
      .from('chat_channels')
      .select('slug, name, parent_slug, position')
      .order('position', { ascending: true })

    return NextResponse.json({
      success: true,
      created,
      updated,
      total: allChannels?.length ?? DEFAULT_CHAT_CHANNELS.length,
      channels: allChannels ?? [],
      message:
        created.length > 0
          ? `Criados: ${created.join(', ')}`
          : updated.length > 0
            ? `Actualizados ${updated.length} canais da app-mobile`
            : 'Canais já sincronizados',
    })
  } catch (error) {
    console.error('[SYNC-CHAT-CHANNELS]', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno',
      },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const supabase = getSupabaseAdmin()

  try {
    const { data, error } = await supabase
      .from('chat_channels')
      .select('id, slug, name, description, parent_slug, position, hidden')
      .order('position', { ascending: true })

    if (error) {
      return NextResponse.json({
        success: true,
        channels: [],
        expected: DEFAULT_CHAT_CHANNELS,
        synced: false,
        error: error.message,
      })
    }

    const slugs = new Set((data ?? []).map((c) => c.slug))
    const missing = DEFAULT_CHAT_CHANNELS.filter((c) => !slugs.has(c.slug)).map((c) => c.slug)

    return NextResponse.json({
      success: true,
      channels: data ?? [],
      expected: DEFAULT_CHAT_CHANNELS,
      missing,
      synced: missing.length === 0,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 },
    )
  }
}

/**
 * Editar um canal — nome, descrição, ordem e visibilidade.
 *
 * Até aqui o painel só sabia CRIAR os canais em falta a partir da lista por omissão. Renomear um
 * canal, corrigir a descrição ou tirá-lo das apps obrigava a ir à base de dados — e o que não se
 * consegue fazer pelo painel acaba por não ser feito.
 *
 * O `slug` NÃO se edita de propósito: é a chave por onde as mensagens, as rotas de sinais e as
 * notificações encontram o canal. Mudá-lo não renomeava nada — partia as ligações todas e deixava
 * as mensagens antigas órfãs.
 */
export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const slug = String(body.slug ?? '').trim()
  if (!slug) return NextResponse.json({ success: false, error: 'slug obrigatório' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 80)
  if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 300) || null
  if (body.position != null && Number.isFinite(Number(body.position))) patch.position = Number(body.position)
  if (typeof body.hidden === 'boolean') patch.hidden = body.hidden
  if (!Object.keys(patch).length) {
    return NextResponse.json({ success: false, error: 'nada para alterar' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin().from('chat_channels').update(patch).eq('slug', slug)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
