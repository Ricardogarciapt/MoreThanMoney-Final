import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { carregarTokensIG, candidateTokensForIgAccount, sendInstagramDmResilient } from '@/lib/instagram/dm-closer'
import { PAGINAS, SEM_TEXTO, responderMensagem, contasInternas, type CanalDm } from '@/lib/social/dm-motor'
import { linkAgendar } from '@/lib/agenda/link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * LEITOR DA CAIXA DE MENSAGENS — Instagram Direct + Messenger das duas Páginas (22/11/2026).
 *
 * Porquê: os webhooks de mensagens nunca entregaram nada (`ig_dm_log` vazio desde sempre). Em vez
 * de esperar pela Meta, pergunta-se pelas conversas de 5 em 5 minutos com o token de Página e
 * responde-se pelo motor único (`lib/social/dm-motor.ts`), que faz dedup por mid — se o webhook
 * começar a funcionar, nada sai em duplicado.
 *
 * Regras:
 *  - só se responde quando a ÚLTIMA mensagem da conversa é da pessoa e tem menos de 24 h (janela
 *    de resposta da Meta). Se o Ricardo já respondeu à mão, a última é nossa → não se mexe;
 *  - SEGUIMENTO: quem recebeu resposta há 20–23 h e não voltou a escrever leva UMA mensagem curta
 *    com a agenda (ainda dentro da janela das 24 h). Nunca mais do que uma por pessoa e por dia.
 *
 * Também repõe uma vez por dia as perguntas de quebra-gelo (ice breakers) das 4 caixas.
 *
 * O estado de cada caixa (incluindo erros de permissão da Meta) fica em
 * `site_settings.dm_caixa_estado`, para o Centro Social e para quem estiver a diagnosticar.
 */
const GRAPH = 'https://graph.facebook.com/v21.0'
const JANELA_MS = 24 * 3600_000

type Msg = { id?: string; message?: string; created_time?: string; from?: { id?: string } }
type Conversa = { id?: string; updated_time?: string; messages?: { data?: Msg[] } }

async function conversas(pageId: string, plataforma: 'instagram' | 'messenger', token: string, pasta?: string) {
  const qs = new URLSearchParams({
    platform: plataforma,
    ...(pasta ? { folder: pasta } : {}),
    fields: 'id,updated_time,messages.limit(2){id,message,created_time,from}',
    limit: '25',
    access_token: token,
  })
  try {
    const r = await fetch(`${GRAPH}/${pageId}/conversations?${qs}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j?.error) return { erro: `${j?.error?.code ?? r.status}: ${j?.error?.message ?? 'erro'}` }
    return { dados: (j.data ?? []) as Conversa[] }
  } catch (e) {
    return { erro: String(e) }
  }
}

async function seguimentos(estado: Record<string, unknown>) {
  const db = getSupabaseAdmin()
  const desde = new Date(Date.now() - 23 * 3600_000).toISOString()
  const ate = new Date(Date.now() - 20 * 3600_000).toISOString()
  const { data } = await db
    .from('ig_dm_log')
    .select('sender_id, account_id, created_at')
    .eq('status', 'replied')
    .gte('created_at', desde)
    .lte('created_at', ate)
    .limit(30)
  let enviados = 0
  const vistos = new Set<string>(await contasInternas())
  for (const l of (data ?? []) as Array<{ sender_id: string; account_id: string; created_at: string }>) {
    if (vistos.has(l.sender_id)) continue
    vistos.add(l.sender_id)
    // Escreveu depois disto, ou já levou seguimento? Então não.
    const { count: depois } = await db
      .from('ig_dm_log')
      .select('mid', { count: 'exact', head: true })
      .eq('sender_id', l.sender_id)
      .gt('created_at', l.created_at)
    if ((depois ?? 0) > 0) continue
    const mid = `seguimento:${l.sender_id}:${new Date().toISOString().slice(0, 10)}`
    const { data: ins } = await db
      .from('ig_dm_log')
      .insert({ mid, account_id: l.account_id, sender_id: l.sender_id, message: null, status: 'followup' })
      .select('id')
      .maybeSingle()
    if (!ins) continue
    const texto =
      `Só para não te perder 🙂 Se ainda fizer sentido, marca 15 minutos comigo por Google Meet e ` +
      `vemos o teu caso com calma: ${linkAgendar()}`
    const pagina = PAGINAS.find((p) => p.pagina === l.account_id)
    const r = pagina
      ? await fetch(`${GRAPH}/me/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: l.sender_id },
            messaging_type: 'RESPONSE',
            message: { text: texto },
            access_token: candidateTokensForIgAccount(pagina.ig)[0],
          }),
        })
          .then(async (x) => ({ ok: x.ok && !(await x.json().catch(() => ({})))?.error }))
          .catch(() => ({ ok: false }))
      : await sendInstagramDmResilient(l.account_id, l.sender_id, texto)
    await db.from('ig_dm_log').update({ reply: texto, status: r.ok ? 'followup' : 'error' }).eq('mid', mid)
    if (r.ok) enviados++
  }
  estado.seguimentos = enviados
}


/**
 * QUEBRA-GELO (ice breakers) — as perguntas que aparecem a quem abre uma conversa connosco no
 * Instagram e no Messenger. Tocar numa manda essa pergunta como mensagem, e o closer responde.
 * Repõe-se uma vez por dia (idempotente na Meta).
 */
const PERGUNTAS = [
  'Quero aprender trading do zero 📚',
  'Como funcionam os 3 dias grátis?',
  'Quero marcar uma apresentação 🗓️',
  'O que é a More Than Money?',
]
async function quebraGelo(estado: Record<string, unknown>) {
  const db = getSupabaseAdmin()
  const hoje = new Date().toISOString().slice(0, 10)
  const { data } = await db.from('site_settings').select('value').eq('key', 'dm_quebra_gelo').maybeSingle()
  if ((data?.value as { em?: string } | null)?.em === hoje) return
  const res: Record<string, string> = {}
  for (const p of PAGINAS) {
    const token = candidateTokensForIgAccount(p.ig)[0]
    if (!token) continue
    for (const plataforma of ['instagram', 'messenger'] as const) {
      const corpo: Record<string, unknown> = {
        ice_breakers: [{ locale: 'default', call_to_actions: PERGUNTAS.map((q, i) => ({ question: q, payload: `QG_${i + 1}` })) }],
        access_token: token,
      }
      if (plataforma === 'instagram') corpo.platform = 'instagram'
      try {
        const r = await fetch(`${GRAPH}/me/messenger_profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        })
        const j = await r.json().catch(() => ({}))
        res[`${p.nome}:${plataforma}`] = r.ok && !j?.error ? 'ok' : `${j?.error?.code ?? r.status}: ${j?.error?.message ?? 'erro'}`
      } catch (e) {
        res[`${p.nome}:${plataforma}`] = String(e)
      }
    }
  }
  estado.quebraGelo = res
  await db.from('site_settings').upsert({ key: 'dm_quebra_gelo', value: { em: hoje, res } }, { onConflict: 'key' })
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, erro: 'nao_autorizado' }, { status: 401 })
  if (process.env.IG_DM_SELFHOSTED_ENABLED === 'false') return NextResponse.json({ ok: true, desligado: true })
  await carregarTokensIG()
  const agora = Date.now()
  const caixas: Record<string, unknown>[] = []
  let respondidas = 0

  for (const p of PAGINAS) {
    const token = candidateTokensForIgAccount(p.ig)[0]
    if (!token) {
      caixas.push({ pagina: p.nome, erro: 'sem token' })
      continue
    }
    for (const plataforma of ['instagram', 'messenger'] as const) {
      const r = await conversas(p.pagina, plataforma, token)
      const caixa: Record<string, unknown> = { pagina: p.nome, plataforma }
      if (r.erro) {
        caixa.erro = r.erro
        caixas.push(caixa)
        continue
      }
      // Pedidos de mensagem (quem não nos segue cai em «pedidos», não na caixa principal).
      const pedidos = await conversas(p.pagina, plataforma, token, 'pending')
      if (pedidos.erro) caixa.pedidosErro = pedidos.erro
      else if (pedidos.dados?.length) {
        const vistos = new Set((r.dados ?? []).map((c) => c.id))
        for (const c of pedidos.dados) if (!vistos.has(c.id)) r.dados!.push(c)
        caixa.pedidos = pedidos.dados.length
      }
      // Todas as contas nossas e internas (nunca se responde entre elas — loop de 22/11).
      const proprios = await contasInternas()
      // Amostra para diagnóstico: quem escreveu por último e há quantos minutos.
      caixa.amostra = (r.dados ?? []).slice(0, 3).map((c) => {
        const u = c.messages?.data?.[0]
        return { de: u?.from?.id ?? null, nosso: proprios.has(String(u?.from?.id)), min: u?.created_time ? Math.round((agora - new Date(u.created_time).getTime()) / 60000) : null }
      })
      let porResponder = 0
      let ok = 0
      for (const c of r.dados ?? []) {
        const ultima = c.messages?.data?.[0]
        const de = ultima?.from?.id
        if (!ultima?.id || !de || proprios.has(de)) continue
        if (agora - new Date(ultima.created_time ?? 0).getTime() > JANELA_MS) continue
        porResponder++
        const canal: CanalDm = plataforma === 'instagram' ? 'instagram' : 'messenger'
        const res = await responderMensagem({
          canal,
          contaId: canal === 'instagram' ? p.ig : p.pagina,
          remetente: de,
          mid: ultima.id,
          // Sem texto (foto, partilha, sticker, gosto, áudio): o closer abre com um quebra-gelo.
          texto: ultima.message?.trim() || SEM_TEXTO,
          origem: 'caixa',
        })
        if (res.resultado === 'respondida') ok++
        else if (res.resultado === 'erro') caixa.ultimoErro = res.erro
      }
      caixa.conversas = r.dados?.length ?? 0
      caixa.porResponder = porResponder
      caixa.respondidas = ok
      respondidas += ok
      caixas.push(caixa)
    }
  }

  const estado: Record<string, unknown> = { em: new Date().toISOString(), respondidas, caixas }
  try {
    await quebraGelo(estado)
  } catch (e) {
    estado.quebraGeloErro = String(e)
  }
  try {
    await seguimentos(estado)
  } catch (e) {
    estado.seguimentosErro = String(e)
  }
  try {
    await getSupabaseAdmin().from('site_settings').upsert({ key: 'dm_caixa_estado', value: estado }, { onConflict: 'key' })
  } catch {}
  return NextResponse.json({ ok: true, ...estado })
}
