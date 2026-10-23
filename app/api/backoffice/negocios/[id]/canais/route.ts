import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaEquipa } from '@/lib/backoffice-equipas'
import { COLUNAS_DE_PARTICIPACAO, ehUuid } from '@/lib/backoffice-negocios'
import { podeMexerNoNegocio } from '@/lib/backoffice-escrita'
import type { AtribuicoesDoNegocio } from '@/lib/backoffice-escrita'

export const dynamic = 'force-dynamic'

/**
 * A FICHA DO CONTACTO — tudo o que a casa sabe desta pessoa noutros canais, num pedido só.
 *
 * O negócio (`vendas_negocios`) é o centro do CRM; os canais ligam-se a ele pelo que já guardam:
 * WhatsApp e agenda por `negocio_id` (ou pelo telefone/email, para o que chegou antes da ligação),
 * formulários pelo email, Instagram pelo handle, Telegram pelo chat. Não se copia nada para lado
 * nenhum: lê-se onde está, e o que cada canal diz continua a ter uma casa só.
 *
 * Mesma fechadura do histórico: capacidade, âmbito, ler o negócio, comparar. Quem não participa
 * leva 404 — a mesma resposta de «não existe», para não confirmar que o negócio existe.
 */
type Negocio = AtribuicoesDoNegocio & {
  id: string
  email: string | null
  telefone: string | null
  telegram_id: string | null
  instagram_handle: string | null
}

const soDigitos = (t: string | null) => (t ?? '').replace(/\D/g, '')

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCapacidade(request, 'bo.pipeline_proprio')
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  if (!ehUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  const db = getSupabaseAdmin()
  const ambito = await ambitoDaEquipa(db, ctx, 'pipeline')
  const { data, error } = await db
    .from('vendas_negocios')
    .select(`id, email, telefone, telegram_id, instagram_handle, ${COLUNAS_DE_PARTICIPACAO.join(', ')}`)
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const n = (data ?? null) as Negocio | null
  if (!n || !podeMexerNoNegocio(n, ambito)) {
    return NextResponse.json({ error: 'Negócio não encontrado', detalhe: 'Ou não existe, ou não participas nele.' }, { status: 404 })
  }

  const email = n.email?.trim().toLowerCase() || null
  const tel = soDigitos(n.telefone)
  const handle = n.instagram_handle?.replace(/^@/, '').toLowerCase() || null
  const vazio = Promise.resolve({ data: [] as Record<string, unknown>[] })

  const [wa, agenda, forms, ig, tg] = await Promise.all([
    db.from('whatsapp_conversas')
      .select('id, telefone, nome, estado, por_responder, ultima_entrada, ultima_saida')
      .or([`negocio_id.eq.${id}`, tel.length >= 9 ? `telefone.like.*${tel.slice(-9)}` : null].filter(Boolean).join(','))
      .limit(5),
    db.from('agenda_marcacoes')
      .select('id, inicio, estado, nome, email')
      .or([`negocio_id.eq.${id}`, email && !/[,()"]/.test(email) ? `email.ilike."${email}"` : null].filter(Boolean).join(','))
      .order('inicio', { ascending: false })
      .limit(10),
    email
      ? db.from('form_submissions').select('id, form_slug, form_title, created_at, status').eq('email', email).order('created_at', { ascending: false }).limit(10)
      : vazio,
    handle
      ? db.from('ig_leads').select('comment_id, keyword, intent, dm_status, created_at').ilike('commenter', handle).order('created_at', { ascending: false }).limit(10)
      : vazio,
    n.telegram_id
      ? db.from('telegram_leads').select('chat_id, username, stage, interesse, message_count, updated_at').eq('chat_id', n.telegram_id).limit(1)
      : vazio,
  ])

  return NextResponse.json({
    ok: true,
    whatsapp: wa.data ?? [],
    agenda: agenda.data ?? [],
    formularios: forms.data ?? [],
    instagram: ig.data ?? [],
    telegram: tg.data ?? [],
  })
}
