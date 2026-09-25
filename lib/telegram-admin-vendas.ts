/**
 * AGIR NO FUNIL A PARTIR DO TELEMÓVEL — ver a oferta certa e mandá-la.
 *
 * `telegram-admin-oferta.ts` decide O QUÊ (puro, testável, sem um único preço escrito à mão).
 * Isto lê o estado da pessoa e, se ele confirmar, manda — com registo.
 *
 * ── O QUE ISTO NUNCA FAZ ──────────────────────────────────────────────────────────────────────
 *
 *  · Não escreve a quem nunca escreveu ao bot. O Telegram não deixa, e a abordagem a frio é dele.
 *  · Não emite cupões novos por cima de cupões já emitidos: duas promessas à mesma pessoa é como
 *    se perde a confiança de um lead que já estava a dizer que sim.
 *  · Não inventa preços. Os números vêm todos de `lib/escada-precos.ts`.
 */
import { comRegisto, escaparHtml as esc, type Porta } from '@/lib/telegram-admin-porta'
import { ofertaMostravel, type EstadoDaPessoa } from '@/lib/telegram-admin-oferta'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Supa = { from: (t: string) => any }

export interface PessoaDoFunil {
  nome: string
  chatId: string
  estado: EstadoDaPessoa
}

/**
 * O estado de venda de uma pessoa, a partir do chat do Telegram.
 *
 * A ligação lead→conta do site é pelo CUPÃO (não há chat_id nem email no meio) — é a mesma junção
 * do `perfil-lead.ts`, e se um dia mudar tem de mudar nos dois.
 */
export async function estadoDeVenda(supabase: unknown, chatId: string): Promise<PessoaDoFunil | null> {
  const db = supabase as Supa
  const { data: lead } = await db
    .from('telegram_leads')
    .select('chat_id, first_name, stage, broker_uid, coupon_code')
    .eq('chat_id', chatId)
    .maybeSingle()
  if (!lead) return null
  const l = lead as { chat_id: string; first_name?: string; stage?: string; broker_uid?: string; coupon_code?: string }

  const [corretora, perfil] = await Promise.all([
    l.broker_uid
      ? db.from('broker_clients').select('uid').eq('uid', l.broker_uid).maybeSingle().then((r: { data: unknown }) => r.data)
      : Promise.resolve(null),
    l.coupon_code
      ? db
          .from('profiles')
          .select('member_category, subscription_status, subscription_plan, is_active')
          .eq('coupon_code', l.coupon_code)
          .limit(1)
          .then((r: { data: unknown }) => ((r.data as Array<Record<string, unknown>> | null) ?? [])[0] ?? null)
      : Promise.resolve(null),
  ])

  const p = perfil as { member_category?: string; subscription_status?: string; subscription_plan?: string; is_active?: boolean } | null
  return {
    nome: l.first_name?.trim() || String(l.chat_id),
    chatId: String(l.chat_id),
    estado: {
      pagante: p?.subscription_status === 'active' && p?.is_active !== false,
      plano: p?.subscription_plan ?? p?.member_category ?? null,
      acessoCorretora: l.stage === 'granted',
      uidConfirmado: !!corretora,
      temConta: !!p,
      // Está na `telegram_leads` com um chat numérico ⇒ escreveu ao bot em privado.
      falouEmPrivado: /^\d+$/.test(String(l.chat_id)),
      cupaoEmitido: l.coupon_code ?? null,
    },
  }
}

/**
 * Manda a oferta a esta pessoa — depois de o dono confirmar, e com registo do antes e do depois.
 *
 * A oferta é RECALCULADA aqui, e não recebida por parâmetro. Entre o ecrã e o toque podem passar
 * minutos, e nesses minutos a pessoa pode ter pago, validado a corretora ou resgatado o cupão:
 * mandar-lhe a oferta que ela já ultrapassou é o contrário de ajudar a fechar.
 */
export async function mandarOferta(porta: Porta, chatId: string): Promise<string> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
  const db = getSupabaseAdmin()
  const pessoa = await estadoDeVenda(db, chatId)
  if (!pessoa) return '🤷 Não encontrei essa pessoa.'

  const o = ofertaMostravel(pessoa.estado)
  if (!o.mensagem) return `🚫 Não mandei nada.\n\n${esc(o.impedimento ?? 'não há nada a oferecer a esta pessoa agora')}`

  const r = await comRegisto(
    porta,
    {
      acao: 'oferta_enviar',
      alvo: `lead:${chatId}`,
      pedido: { degrau: o.degrau, titulo: o.titulo },
      antes: pessoa.estado,
    },
    async () => {
      const { getMtmcopyBotToken } = await import('@/lib/mtmcopy/telegram-bot')
      const token = getMtmcopyBotToken()
      if (!token) return { ok: false, texto: '⚠️ Sem token do bot — não consigo mandar nada.' }
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: o.mensagem, parse_mode: 'HTML', disable_web_page_preview: true }),
      })
      const corpo = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null
      if (!corpo?.ok) {
        return {
          ok: false,
          resultado: { erro: corpo?.description ?? `HTTP ${res.status}` },
          texto: `⚠️ O Telegram recusou: ${esc(corpo?.description ?? String(res.status))}`,
        }
      }
      return {
        ok: true,
        depois: { enviado: o.degrau },
        texto: `📨 <b>Enviado a ${esc(pessoa.nome)}</b> — ${esc(o.titulo)}.`,
      }
    },
  )
  return r.texto
}
