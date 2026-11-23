/**
 * O FUNIL DE CONVERSA NO TELEGRAM — o mesmo do WhatsApp (23/11/2026).
 *
 * Pedido do Ricardo: «prepara o funil também para o Telegram da mesma forma que o WhatsApp».
 * Mesmo guião (`lib/vendas/guiao-whatsapp.ts`, 5 línguas), mesma voz, mesma ordem:
 *
 *   áudio de abertura na voz do Ricardo → espera → menu (rotas + falar com pessoa + língua)
 *     └─ rota → áudio da rota → texto com link COM RASTO (/w/…) → o closer IA continua
 *   «falar com uma pessoa» → fila dos setters + agenda + aviso no Telegram do Ricardo
 *   bandeiras → muda a língua e recomeça a abertura
 *
 * No Telegram os botões são inline (callback `fx:…`). Abre sozinho no primeiro contacto de quem
 * escreve ao bot sem vir de um deep-link, quando escreve «menu», ou à mão no back-office.
 * Frases a sério vão SEMPRE para o closer IA, que pensa e responde.
 */
import { createHash } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { falarParaStorage } from '@/lib/voz'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { linkAgendar } from '@/lib/agenda/link'
import { GUIAO, ID_HUMANO, ID_MUDAR_LINGUA, ROTAS_WA, audioAbertura, audioDaRota, menuComLingua, textoDaRota, type RotaWa } from '@/lib/vendas/guiao-whatsapp'
import { LINGUAS, ehLingua, linhasDeLinguas, type Lingua } from '@/lib/whatsapp/linguas'
import { seguirLinks } from '@/lib/whatsapp/link-seguido'
import { ID_SEG_AGENDAR, ID_SEG_DUVIDA, TEXTOS_SEGUIMENTO } from '@/lib/whatsapp/seguimento-site'
import { passarParaSetterTelegram } from '@/lib/whatsapp/setter'

export const PREFIXO_FX = 'fx:'
const AGENDA = linkAgendar('apresentacao')
const ESPERA_DEPOIS_DO_AUDIO_MS = 4000
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Teclado = { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> }

async function tg(metodo: string, corpo: Record<string, unknown>): Promise<boolean> {
  const token = getMtmcopyBotToken()
  if (!token) return false
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    const j = (await r.json().catch(() => null)) as { ok?: boolean } | null
    return !!j?.ok
  } catch {
    return false
  }
}

export async function enviarTextoTelegram(chatId: string, texto: string, teclado?: Teclado): Promise<boolean> {
  return tg('sendMessage', { chat_id: chatId, text: texto, disable_web_page_preview: true, ...(teclado ? { reply_markup: teclado } : {}) })
}

/** Áudio na voz do Ricardo (mensagem de voz). Se a voz falhar, sai o mesmo texto escrito. */
async function falar(chatId: string, texto: string, lingua: Lingua): Promise<'audio' | 'texto' | 'falhou'> {
  try {
    const ref = createHash('sha1').update(texto).digest('hex').slice(0, 20)
    const pub = await falarParaStorage(getSupabaseAdmin() as never, texto, `wa-audio/guiao/${ref}.mp3`)
    if (pub.ok && (await tg('sendVoice', { chat_id: chatId, voice: pub.url, ...(GUIAO[lingua].avisoIa ? { caption: GUIAO[lingua].avisoIa.slice(0, 200) } : {}) }))) return 'audio'
  } catch (e) {
    console.warn('[tg-funil] voz falhou:', e instanceof Error ? e.message : e)
  }
  return (await enviarTextoTelegram(chatId, texto)) ? 'texto' : 'falhou'
}

function tecladoMenu(l: Lingua): Teclado {
  return { inline_keyboard: menuComLingua(l).map((m) => [{ text: m.titulo, callback_data: `${PREFIXO_FX}${m.id}` }]) }
}

function tecladoLinguas(): Teclado {
  return { inline_keyboard: linhasDeLinguas().map((x) => [{ text: x.titulo, callback_data: `${PREFIXO_FX}${x.id}` }]) }
}

/** Língua de partida no Telegram: a escolhida > a da app do Telegram (language_code) > português. */
export function linguaTelegram(guardada: unknown, codigoApp?: string | null): Lingua {
  if (ehLingua(guardada)) return guardada
  const c = String(codigoApp ?? '').slice(0, 2).toLowerCase()
  return ehLingua(c) ? c : 'pt'
}

async function guardar(chatId: string, campos: Record<string, unknown>) {
  await getSupabaseAdmin()
    .from('telegram_leads')
    .upsert({ chat_id: chatId, followup_count: 0, ...campos, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' })
}

function saudacao(l: Lingua): string {
  return { pt: 'olá', en: 'hi', fr: 'salut', de: 'hallo', es: 'hola' }[l]
}

/** Áudio de abertura → espera → menu de rotas (com pessoa e bandeiras). */
export async function abrirFunilTelegram(chatId: string, nome: string, lingua: Lingua): Promise<boolean> {
  const g = GUIAO[lingua]
  const como = await falar(chatId, audioAbertura(nome || saudacao(lingua), lingua), lingua)
  // O Telegram recusa (403) a quem nunca abriu o bot: aí nada se grava e o lead fica como estava.
  if (como === 'falhou') return false
  if (como === 'audio') await esperar(ESPERA_DEPOIS_DO_AUDIO_MS)
  const ok = await enviarTextoTelegram(chatId, g.textoMenu, tecladoMenu(lingua))
  if (ok) await guardar(chatId, { stage: 'tg_menu', first_name: nome || null, lang: lingua })
  return ok
}

/** Rota escolhida: áudio da rota → texto com link com rasto. */
export async function enviarRotaTelegram(chatId: string, rota: RotaWa, nome: string, lingua: Lingua): Promise<void> {
  const como = await falar(chatId, audioDaRota(rota, nome || saudacao(lingua), lingua), lingua)
  if (como === 'audio') await esperar(ESPERA_DEPOIS_DO_AUDIO_MS)
  await enviarTextoTelegram(chatId, seguirLinks(textoDaRota(rota, lingua), `tg:${chatId}`, AGENDA))
  await guardar(chatId, { stage: `tg_rota_${rota}`, interest: rota, first_name: nome || null, lang: lingua })
}

export async function pedirPessoaTelegram(chatId: string, nome: string, lingua: Lingua, frase: string): Promise<void> {
  await enviarTextoTelegram(chatId, seguirLinks(GUIAO[lingua].textoHumano, `tg:${chatId}`, AGENDA))
  await guardar(chatId, { stage: 'tg_humano', first_name: nome || null, lang: lingua })
  await passarParaSetterTelegram(chatId, nome, lingua, frase, 'pediu')
  const { avisarRicardo } = await import('@/lib/whatsapp/fluxo')
  await avisarRicardo(`🙋 <b>Telegram: quer falar com uma pessoa</b>\n${nome || chatId} · ${lingua.toUpperCase()}\nFicou na fila dos setters no pipeline.\n«${frase.slice(0, 200)}»`)
}

/**
 * Botões `fx:…`. Devolve true se tratou. `nomeApp`/`codigoApp` vêm do `from` do Telegram.
 */
export async function tratarBotaoFunilTelegram(p: { chatId: string; dados: string; nomeApp?: string | null; codigoApp?: string | null }): Promise<boolean> {
  if (!p.dados.startsWith(PREFIXO_FX)) return false
  const id = p.dados.slice(PREFIXO_FX.length)
  const { data: lead } = await getSupabaseAdmin().from('telegram_leads').select('first_name, lang').eq('chat_id', p.chatId).maybeSingle()
  let lingua = linguaTelegram(lead?.lang, p.codigoApp)
  const nome = (((lead?.first_name as string | null) || p.nomeApp || '').trim().split(/\s+/)[0] || '').slice(0, 30)

  if (id.startsWith('lingua:')) {
    const l = id.slice('lingua:'.length)
    if (ehLingua(l)) lingua = l
    await abrirFunilTelegram(p.chatId, nome, lingua)
    return true
  }
  if (id === ID_MUDAR_LINGUA) {
    await enviarTextoTelegram(p.chatId, GUIAO[lingua].textoLinguas, tecladoLinguas())
    return true
  }
  if (id === ID_HUMANO) {
    await pedirPessoaTelegram(p.chatId, nome, lingua, 'tocou em «falar com uma pessoa»')
    return true
  }
  if (id === ID_SEG_DUVIDA) {
    await enviarTextoTelegram(p.chatId, TEXTOS_SEGUIMENTO[lingua].respostaDuvida)
    await guardar(p.chatId, { lang: lingua })
    return true
  }
  if (id === ID_SEG_AGENDAR) {
    await enviarTextoTelegram(p.chatId, seguirLinks(TEXTOS_SEGUIMENTO[lingua].respostaAgendar(AGENDA), `tg:${p.chatId}`, AGENDA))
    await guardar(p.chatId, { lang: lingua })
    return true
  }
  if ((ROTAS_WA as readonly string[]).includes(id)) {
    await enviarRotaTelegram(p.chatId, id as RotaWa, nome, lingua)
    if (id === 'solucoes') {
      const { avisarRicardo } = await import('@/lib/whatsapp/fluxo')
      await avisarRicardo(`🏢 <b>Telegram: interesse em Soluções (B2B)</b>\n${nome || p.chatId} · ${lingua.toUpperCase()}`)
    }
    return true
  }
  return false
}

/**
 * Mensagem de texto de um lead em privado. Abre o funil no primeiro contacto (ou com «menu»);
 * tudo o resto devolve false e segue para o closer IA.
 */
export async function tratarTextoFunilTelegram(p: { chatId: string; texto: string; nomeApp?: string | null; codigoApp?: string | null }): Promise<boolean> {
  const t = p.texto.trim()
  if (!t || t.startsWith('/')) return false
  const { data: lead } = await getSupabaseAdmin()
    .from('telegram_leads')
    .select('stage, message_count, first_name, lang, agente_codigo')
    .eq('chat_id', p.chatId)
    .maybeSingle()
  const lingua = linguaTelegram(lead?.lang, p.codigoApp)
  const nome = (((lead?.first_name as string | null) || p.nomeApp || '').trim().split(/\s+/)[0] || '').slice(0, 30)
  const pediuMenu = /^(menu|men[uú] principal|op[cç][oõ]es|options|start)$/i.test(t)
  const primeiroContacto = !lead || (Number(lead.message_count ?? 0) === 0 && !lead.agente_codigo && (!lead.stage || lead.stage === 'new'))
  if (pediuMenu || (primeiroContacto && t.split(/\s+/).length <= 6 && !t.includes('?'))) {
    await abrirFunilTelegram(p.chatId, nome, lingua)
    return true
  }
  return false
}

export { LINGUAS }
