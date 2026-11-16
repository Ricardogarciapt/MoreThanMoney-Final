/**
 * Tradução automática das mensagens do chat e das publicações do feed para o idioma de quem lê.
 *
 * Porquê no servidor e não no Google Tradutor do browser: o tradutor do browser mexe no DOM do
 * React (já partiu ecrãs em Safari/WKWebView), não corre nas apps nativas e traduz também nomes
 * de scanners, pares e termos de trading. Aqui a IA recebe regras explícitas e o resultado fica em
 * cache (`chat_traducoes`), por isso cada texto custa uma tradução por idioma, não uma por leitor.
 *
 * Cadeia: IA grátis primeiro (`chamarIAGratis`: Groq → Gemini → Ollama) → Google grátis como rede.
 */
import { createHash } from 'crypto'
import { chamarIAGratis, mensagemIndisponivel } from '@/lib/ia/chamar'
import { LANGUAGE_NAMES_EN } from '@/lib/chat-traducao-idiomas'

export const MAX_TEXTOS = 25
export const MAX_CHARS = 2000

const SISTEMA =
  'You translate chat messages and social posts from a financial-education and trading community. ' +
  'Translate naturally and faithfully into the target language, keeping the tone (informal, emojis, line breaks). ' +
  'NEVER translate or alter: product and scanner names (MTM, MoreThanMoney, Premium, MTM Auto, GoldKiller, Sensei, ' +
  'DEFY, Aurum, Quantum, Tap to Trade, WebTrader, MTM Funded, PU Prime), tickers and pairs (XAUUSD, BTC, EURUSD, US30…), ' +
  'trading terms (TP, SL, BE, breakeven, stop loss, long, short, buy, sell, entry, pips, lot), numbers, prices, ' +
  'URLs, @mentions, #hashtags and emojis. If a text is already in the target language, return it unchanged and mark same=true. ' +
  'Return ONLY valid JSON, no markdown.'

export function hashTexto(texto: string): string {
  return createHash('sha256').update(texto).digest('hex')
}

export type Traducao = { traducao: string; mesmoIdioma: boolean }

async function googleGratis(texto: string, alvo: string): Promise<Traducao | null> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(alvo)}` +
    `&dt=t&q=${encodeURIComponent(texto)}`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) return null
    const data = (await r.json()) as unknown[]
    const segs = (data?.[0] as unknown[]) || []
    const out = segs.map((s) => (Array.isArray(s) ? String(s[0] ?? '') : '')).join('').trim()
    const origem = typeof data?.[2] === 'string' ? (data[2] as string) : ''
    if (!out) return null
    return { traducao: out, mesmoIdioma: origem.slice(0, 2) === alvo }
  } catch {
    return null
  }
}

/** Traduz vários textos para `alvo` num só pedido à IA; o que falhar vai ao Google, um a um. */
export async function traduzirLote(textos: string[], alvo: string): Promise<(Traducao | null)[]> {
  if (textos.length === 0) return []
  const nome = LANGUAGE_NAMES_EN[alvo] || alvo
  const entrada = textos.map((t, i) => ({ i, text: t }))
  let porIndice: Record<number, Traducao> = {}
  try {
    const r = await chamarIAGratis({
      tarefa: 'chat-traducao',
      sistema: SISTEMA,
      mensagens: [
        {
          role: 'user',
          content:
            `Target language: ${nome} (${alvo}).\n` +
            `Translate each item. Answer as {"items":[{"i":<index>,"t":"<translation>","same":<true|false>}]} with every index.\n\n` +
            JSON.stringify(entrada),
        },
      ],
      json: true,
      temperatura: 0.1,
      maxTokens: 4000,
      preferencia: 'qualidade',
      timeoutMs: 20000,
    })
    const o = JSON.parse(r.texto) as { items?: { i?: unknown; t?: unknown; same?: unknown }[] }
    for (const it of o.items ?? []) {
      const i = Number(it.i)
      if (Number.isInteger(i) && i >= 0 && i < textos.length && typeof it.t === 'string' && it.t.trim()) {
        porIndice[i] = { traducao: it.t, mesmoIdioma: it.same === true }
      }
    }
  } catch (err) {
    console.warn('[chat-traducao] IA falhou, a usar Google grátis:', mensagemIndisponivel(err))
    porIndice = {}
  }
  return Promise.all(textos.map(async (t, i) => porIndice[i] ?? (await googleGratis(t, alvo))))
}
