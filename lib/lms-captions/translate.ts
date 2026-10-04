import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'
import { translationTargetsFor, CAPTION_LANGUAGE_LABELS } from './constants'

// Tradução de legendas ao vivo. Um segmento de fala (idioma de origem) → tradução
// para os idiomas-alvo, num único pedido à IA, devolvendo JSON { lang: texto }.
// Vai pela porta única (`chamarIA`: Groq → Gemini → Ollama → OpenAI → Anthropic) com
// `preferencia: 'rapido'` — legendas ao vivo precisam de baixa latência.

const SYSTEM_PROMPT =
  'És um tradutor de legendas ao vivo de sessões de educação financeira e trading. ' +
  'Traduz a fala de forma natural, concisa e fiel, preservando termos técnicos ' +
  '(ex.: "breakeven", "stop loss", "long", "short", nomes de ativos como XAUUSD/BTC). ' +
  'Devolve APENAS um objeto JSON válido, sem markdown, sem explicações.'

/**
 * Tradução via endpoint livre do Google Translate (sem chave, 0 €). Fallback sempre
 * disponível — 1 pedido por idioma-alvo, em paralelo. Não-oficial: pode limitar sob
 * carga; serve de rede de segurança para as legendas nunca ficarem sem tradução.
 */
async function translateWithGoogleFree(
  text: string,
  source: string,
  langs: string[],
): Promise<Record<string, string>> {
  const src = (source || 'pt').toLowerCase().slice(0, 2)
  const results = await Promise.all(
    langs.map(async (l) => {
      const url =
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}` +
        `&tl=${encodeURIComponent(l)}&dt=t&q=${encodeURIComponent(text)}`
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        if (!r.ok) return [l, ''] as const
        const data = (await r.json()) as unknown[]
        const segs = (data?.[0] as unknown[]) || []
        const out = segs.map((s) => (Array.isArray(s) ? String(s[0] ?? '') : '')).join('')
        return [l, out.trim()] as const
      } catch {
        return [l, ''] as const
      }
    }),
  )
  const out: Record<string, string> = {}
  for (const [l, t] of results) if (t) out[l] = t
  return out
}

/**
 * Traduz um segmento de legenda para vários idiomas-alvo de uma vez.
 * @param text     texto no idioma de origem
 * @param source   idioma de origem (ex.: 'pt')
 * @param targets  idiomas-alvo (default: conjunto fixo menos o de origem)
 * @returns { en: '...', es: '...', ... } (só idiomas que devolveram tradução)
 */
export async function translateCaption(
  text: string,
  source: string,
  targets?: string[],
): Promise<Record<string, string>> {
  const langs = (targets && targets.length ? targets : translationTargetsFor(source)).filter(
    (l) => l && l !== source,
  )
  if (!text.trim() || langs.length === 0) return {}

  const langList = langs
    .map((l) => `"${l}" (${CAPTION_LANGUAGE_LABELS[l] || l})`)
    .join(', ')
  const prompt =
    `Idioma de origem: ${source}.\n` +
    `Traduz esta legenda para os idiomas ${langList}.\n` +
    `Devolve JSON no formato {"<codigo_idioma>": "<traducao>"} exatamente com estes códigos.\n\n` +
    `Legenda: ${JSON.stringify(text)}`

  // Ordem: a cadeia da IA (grátis primeiro) → Google grátis (sempre disponível, 0 €). O Google é
  // uma tradução a sério, não texto a fingir que é IA — por isso continua a ser rede de segurança.
  let parsed: Record<string, unknown>
  try {
    const r = await chamarIA({
      tarefa: 'lms-captions',
      sistema: SYSTEM_PROMPT,
      mensagens: [{ role: 'user', content: prompt }],
      maxTokens: 1024,
      temperatura: 0.2,
      json: true,
      preferencia: 'rapido',
    })
    const o = JSON.parse(r.texto) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('a tradução não veio como objeto {idioma: texto}')
    parsed = o as Record<string, unknown>
  } catch (err) {
    console.warn('[lms-captions] IA falhou, fallback Google grátis:', mensagemIndisponivel(err))
    return await translateWithGoogleFree(text, source, langs)
  }

  const out: Record<string, string> = {}
  for (const l of langs) {
    const v = parsed[l]
    if (typeof v === 'string' && v.trim()) out[l] = v.trim()
  }
  return out
}
