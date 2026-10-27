/**
 * O BOT A CONVERSAR NO GRUPO «MTM SYSTEM» — responder a quem pergunta, à vista de todos.
 *
 * O funil de leads (`lib/telegram-lead-funnel.ts`) só fala em PRIVADO. No grupo, quem pergunta
 * «isto funciona com pouco dinheiro?» ficava sem resposta — e os outros quarenta que tinham a mesma
 * dúvida também. Aqui o bot responde no próprio grupo, curto e humano, e leva para o privado tudo o
 * que é pessoal (UID, email, depósito, pagamentos).
 *
 * QUANDO RESPONDE
 *  · quando o mencionam (@bot) ou respondem a uma mensagem dele — sempre;
 *  · quando alguém escreve uma PERGUNTA (tem «?» ou começa por como/quanto/onde/…) — com travão.
 * Nunca ao dono nem a bots. Travões: 1 resposta por pessoa a cada 10 min e no máx. 12 por hora no
 * grupo. Interruptor: `site_settings.telegram_leads_conversa` = {"ligado": false} cala-o.
 *
 * O QUE NUNCA DIZ
 * Os números vêm só de `provaParaLead` (pips medidos; a taxa de acerto cala-se em amostra curta) e a
 * resposta passa pela peneira da casa (`lib/marketing/regras.ts`): marca proibida, «você», promessa
 * de lucro ou percentagem que não veio da prova → a resposta do modelo deita-se fora e vai uma
 * resposta fixa a convidar para o privado.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken, MTMCOPY_BOT_USERNAME } from '@/lib/mtmcopy/telegram-bot'
import { contextoDaCasa } from '@/lib/factos-da-casa'
import { escadaNumaLinha, bonusNumaLinha } from '@/lib/escada-precos'
import { MIN_DEPOSIT } from '@/lib/broker/deposito-minimo'
import { REGRAS_CASA, peneira } from '@/lib/marketing/regras'
import { DISCLAIMER } from '@/lib/telegram-leads-posts'

type Supa = ReturnType<typeof getSupabaseAdmin>

const CHAVE_INTERRUPTOR = 'telegram_leads_conversa'
const CHAVE_TRAVAO = 'telegram_leads_conversa_travao'
const POR_PESSOA_MS = 10 * 60_000
const MAX_POR_HORA = 12

export interface MensagemDoGrupo {
  message_id: number
  text?: string
  chat: { id: number | string }
  from?: { id: number; is_bot?: boolean; first_name?: string; username?: string }
  reply_to_message?: { from?: { is_bot?: boolean; username?: string } }
}

/** É uma pergunta? Puro, para a guarda. */
export function pareceUmaPergunta(texto: string): boolean {
  const t = texto.trim().toLowerCase()
  if (t.length < 8 || t.startsWith('/')) return false
  if (t.includes('?')) return true
  return /^(como|quanto|quantos|quantas|onde|qual|quais|quando|porque|porquê|posso|dá para|da para|é possível|e possivel|alguém sabe|alguem sabe|funciona)\b/.test(t)
}

/** Deve o bot responder a esta mensagem? Puro, para a guarda. */
export function deveResponder(m: MensagemDoGrupo, bot: string, donoId: string | null): boolean {
  const texto = m.text?.trim()
  if (!texto || !m.from || m.from.is_bot) return false
  if (donoId && String(m.from.id) === donoId) return false
  const arroba = new RegExp(`@${bot}\\b`, 'i').test(texto)
  const respondeAoBot = Boolean(m.reply_to_message?.from?.is_bot && m.reply_to_message.from.username?.toLowerCase() === bot.toLowerCase())
  if (arroba || respondeAoBot) return true
  return pareceUmaPergunta(texto)
}

/** Travão por pessoa e por hora. Devolve true se pode responder (e já marca). */
async function passaTravao(db: Supa, pessoa: string, chamado: boolean): Promise<boolean> {
  const agora = Date.now()
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_TRAVAO).maybeSingle()
  const v = (data?.value as { hora?: number[]; pessoas?: Record<string, number> } | null) ?? {}
  const hora = (v.hora ?? []).filter((t) => agora - t < 3_600_000)
  const pessoas = Object.fromEntries(Object.entries(v.pessoas ?? {}).filter(([, t]) => agora - t < POR_PESSOA_MS))
  if (hora.length >= MAX_POR_HORA) return false
  // Quem chama o bot pelo nome tem direito a resposta mesmo dentro dos 10 min — só o tecto da hora conta.
  if (!chamado && pessoas[pessoa]) return false
  hora.push(agora)
  pessoas[pessoa] = agora
  await db.from('site_settings').upsert({ key: CHAVE_TRAVAO, value: { hora, pessoas } }, { onConflict: 'key' })
  return true
}

/** O que vai se o modelo falhar ou disser o que não pode. */
export function respostaFixa(nome: string | null): string {
  return `${nome ? `${nome}, boa` : 'Boa'} pergunta! Para te responder bem preciso de perceber o teu caso — chama-me em privado, é rápido. 👇`
}

/** A resposta do modelo pode sair? Puro, para a guarda. */
export function respostaAceitavel(resposta: string, prova: string | null): boolean {
  const achados = peneira(`${resposta}\nnão constitui consultoria`).filter((a) => !a.startsWith('tem uma percentagem'))
  if (achados.length) return false
  // Números que o modelo pode dizer: os da prova medida e os da casa (preços, depósito, bónus).
  const daCasa = `${prova ?? ''} ${escadaNumaLinha()} ${bonusNumaLinha()} ${MIN_DEPOSIT}`
  const soDigitos = (x: string) => x.replace(/[^\d]/g, '')
  const permitidos = new Set((daCasa.match(/\d[\d.,]*/g) ?? []).map(soDigitos))
  const pcts = resposta.match(/\d[\d.,]*\s?%/g) ?? []
  const dinheiro = resposta.match(/\d[\d.,]*\s?[€$]|[€$]\s?\d[\d.,]*/g) ?? []
  return [...pcts, ...dinheiro].every((n) => permitidos.has(soDigitos(n)))
}

function sistema(prova: string | null): string {
  return `És o assistente da equipa MoreThanMoney a responder NO GRUPO PÚBLICO do Telegram «MTM System», onde estão pessoas a decidir se entram. Responde como uma pessoa, não como um robô nem um FAQ: curto (máx. 45 palavras, 1–3 frases), caloroso, direto, no máx. 1 emoji.

O teu objetivo é tirar a dúvida e dar UM passo seguinte: criar conta (morethanmoney.pt/register, 3 dias de Premium), a rota da corretora (depósito ≥ ${MIN_DEPOSIT}$ que fica na conta dela) ou falar em privado comigo. Nunca as três de uma vez.

No grupo NUNCA peças UID, email, prints, valores ou dados pessoais — para isso diz que falamos em privado (o botão vai na mensagem).

${contextoDaCasa()}

Escada: ${escadaNumaLinha()}
Resultados medidos: ${prova ? `${prova} — se citares, usa só isto, tal como está` : 'NÃO há resultados medidos agora: não cites número nenhum de desempenho.'}

${REGRAS_CASA}
- Responde no idioma de quem pergunta.
- Se a pergunta não é sobre a MTM, trading ou finanças, responde numa frase simpática e não vendas.
- Devolve só o texto da resposta.`
}

async function lerProva(db: Supa): Promise<string | null> {
  try {
    const { provaParaLead } = await import('@/lib/pips-proof')
    const { data } = await db.from('site_settings').select('value').eq('key', 'pips_proof').maybeSingle()
    return provaParaLead(data?.value as never)
  } catch {
    return null
  }
}

async function perguntarAoModelo(pergunta: string, prova: string | null): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  const model = process.env.TELEGRAM_FUNNEL_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5-20251001'
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 220, system: sistema(prova), messages: [{ role: 'user', content: pergunta.slice(0, 1200) }] }),
    })
    if (!r.ok) return null
    const j = await r.json()
    return String(j?.content?.[0]?.text ?? '').trim() || null
  } catch {
    return null
  }
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Ponto de entrada, chamado pelo webhook para TODAS as mensagens de grupo. Sai logo se não é o
 * grupo de leads. Nunca lança: o webhook é o mesmo que leva os sinais.
 */
export async function conversarNoGrupoDeLeads(db: Supa, m: MensagemDoGrupo): Promise<{ respondeu: boolean; motivo?: string }> {
  try {
    const { data: rows } = await db.from('site_settings').select('key, value').in('key', ['telegram_leads_group_id', CHAVE_INTERRUPTOR])
    const grupo = (rows?.find((r) => r.key === 'telegram_leads_group_id')?.value as { chat_id?: string } | null)?.chat_id
    if (!grupo || String(m.chat.id) !== String(grupo)) return { respondeu: false, motivo: 'outro grupo' }
    if ((rows?.find((r) => r.key === CHAVE_INTERRUPTOR)?.value as { ligado?: boolean } | null)?.ligado === false) return { respondeu: false, motivo: 'desligado' }

    const bot = MTMCOPY_BOT_USERNAME()
    const dono = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || null
    if (!deveResponder(m, bot, dono)) return { respondeu: false, motivo: 'não é para mim' }
    const chamado = new RegExp(`@${bot}\\b`, 'i').test(m.text ?? '') || Boolean(m.reply_to_message?.from?.is_bot)
    if (!(await passaTravao(db, String(m.from!.id), chamado))) return { respondeu: false, motivo: 'travão' }

    const token = getMtmcopyBotToken()
    if (!token) return { respondeu: false, motivo: 'sem token' }

    const prova = await lerProva(db)
    const pergunta = (m.text ?? '').replace(new RegExp(`@${bot}\\b`, 'ig'), '').trim()
    const modelo = await perguntarAoModelo(pergunta, prova)
    const nome = m.from?.first_name?.split(' ')[0] ?? null
    let texto = modelo && respostaAceitavel(modelo, prova) ? modelo : respostaFixa(nome)
    texto = escapar(texto)
    if (/\b(pips?|trade|trading|sinal|sinais|lucro|ganh|resultado|corretora|depósito|forex|ouro)\b/i.test(texto)) texto += `\n\n${DISCLAIMER}`

    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: m.chat.id,
        text: texto,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true },
        reply_markup: { inline_keyboard: [[{ text: '💬 Continuar em privado', url: `https://t.me/${bot}?start=lead` }]] },
      }),
    })
    return { respondeu: r.ok, motivo: r.ok ? undefined : `telegram ${r.status}` }
  } catch (e) {
    console.error('[leads-conversa]', e)
    return { respondeu: false, motivo: 'erro' }
  }
}
