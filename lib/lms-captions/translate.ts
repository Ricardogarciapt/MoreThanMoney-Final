import Anthropic from '@anthropic-ai/sdk'
import { translationTargetsFor, CAPTION_LANGUAGE_LABELS } from './constants'

// Tradução de legendas ao vivo. Um segmento de fala (idioma de origem) → tradução
// para os idiomas-alvo, num único pedido ao Claude, devolvendo JSON { lang: texto }.
// Modelo rápido (Haiku) por defeito — legendas ao vivo precisam de baixa latência.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const CAPTIONS_MODEL = process.env.CAPTIONS_MODEL || 'claude-haiku-4-5-20251001'

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

  try {
    const res = await anthropic.messages.create({
      model: CAPTIONS_MODEL,
      max_tokens: 1024,
      // Legendas de sessões de trading/educação financeira. Preservar termos técnicos.
      system:
        'És um tradutor de legendas ao vivo de sessões de educação financeira e trading. ' +
        'Traduz a fala de forma natural, concisa e fiel, preservando termos técnicos ' +
        '(ex.: "breakeven", "stop loss", "long", "short", nomes de ativos como XAUUSD/BTC). ' +
        'Devolve APENAS um objeto JSON válido, sem markdown, sem explicações.',
      messages: [
        {
          role: 'user',
          content:
            `Idioma de origem: ${source}.\n` +
            `Traduz esta legenda para os idiomas ${langList}.\n` +
            `Devolve JSON no formato {"<codigo_idioma>": "<traducao>"} exatamente com estes códigos.\n\n` +
            `Legenda: ${JSON.stringify(text)}`,
        },
      ],
    })

    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    const jsonStr = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const l of langs) {
      const v = parsed[l]
      if (typeof v === 'string' && v.trim()) out[l] = v.trim()
    }
    return out
  } catch (err) {
    console.error('[lms-captions] translateCaption falhou:', err)
    return {}
  }
}
