import Anthropic from '@anthropic-ai/sdk'
import { translationTargetsFor, CAPTION_LANGUAGE_LABELS } from './constants'

// Tradução de legendas ao vivo. Um segmento de fala (idioma de origem) → tradução
// para os idiomas-alvo, num único pedido ao Claude, devolvendo JSON { lang: texto }.
// Modelo rápido (Haiku) por defeito — legendas ao vivo precisam de baixa latência.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const CAPTIONS_MODEL = process.env.CAPTIONS_MODEL || 'claude-haiku-4-5-20251001'
const OPENAI_CAPTIONS_MODEL = process.env.CAPTIONS_OPENAI_MODEL || 'gpt-4o-mini'

const SYSTEM_PROMPT =
  'És um tradutor de legendas ao vivo de sessões de educação financeira e trading. ' +
  'Traduz a fala de forma natural, concisa e fiel, preservando termos técnicos ' +
  '(ex.: "breakeven", "stop loss", "long", "short", nomes de ativos como XAUUSD/BTC). ' +
  'Devolve APENAS um objeto JSON válido, sem markdown, sem explicações.'

function extractJson(raw: string): Record<string, unknown> {
  const s = raw.trim()
  const j = s.startsWith('{') ? s : s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)
  return JSON.parse(j) as Record<string, unknown>
}

// DeepL — tradutor mais rápido + free tier (500k car./mês). Códigos por idioma.
const DEEPL_TARGET: Record<string, string> = { en: 'EN-US', es: 'ES', fr: 'FR', de: 'DE', pt: 'PT-PT' }
function deeplEndpoint(): string {
  // Chaves free terminam em ":fx" → api-free; caso contrário API pro.
  const k = process.env.DEEPL_API_KEY || ''
  const base = process.env.DEEPL_API_URL || (k.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com')
  return `${base.replace(/\/$/, '')}/v2/translate`
}

/** Tradução via DeepL (mais rápida; 1 pedido por idioma-alvo, em paralelo). */
async function translateWithDeepL(
  text: string,
  source: string,
  langs: string[],
): Promise<Record<string, string>> {
  const key = process.env.DEEPL_API_KEY
  if (!key) throw new Error('sem DEEPL_API_KEY')
  const url = deeplEndpoint()
  const src = (DEEPL_TARGET[source] || source).split('-')[0].toUpperCase()
  const results = await Promise.all(
    langs.map(async (l) => {
      const target = DEEPL_TARGET[l] || l.toUpperCase()
      const body = new URLSearchParams({ text, target_lang: target, source_lang: src, preserve_formatting: '1' })
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })
      if (!r.ok) return [l, ''] as const
      const d = (await r.json()) as { translations?: { text?: string }[] }
      return [l, (d.translations?.[0]?.text || '').trim()] as const
    }),
  )
  const out: Record<string, string> = {}
  for (const [l, t] of results) if (t) out[l] = t
  if (Object.keys(out).length === 0) throw new Error('deepl vazio')
  return out
}

/** Tradução via OpenAI (fallback quando a Anthropic falha/sem créditos). */
async function translateWithOpenAI(prompt: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_CAPTIONS_MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return extractJson(data.choices?.[0]?.message?.content || '{}')
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

  // Ordem: DeepL (mais rápido + free tier) → Claude (qualidade) → OpenAI (fallback).
  if (process.env.DEEPL_API_KEY) {
    try {
      return await translateWithDeepL(text, source, langs)
    } catch (err) {
      console.warn('[lms-captions] DeepL falhou, tenta Claude/OpenAI:', (err as Error).message)
    }
  }

  let parsed: Record<string, unknown> | null = null
  try {
    const res = await anthropic.messages.create({
      model: CAPTIONS_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    parsed = extractJson(raw)
  } catch (err) {
    console.warn('[lms-captions] Anthropic falhou, fallback OpenAI:', (err as Error).message)
    try {
      parsed = await translateWithOpenAI(prompt)
    } catch (err2) {
      console.error('[lms-captions] tradução falhou (Anthropic+OpenAI):', (err2 as Error).message)
      return {}
    }
  }

  const out: Record<string, string> = {}
  for (const l of langs) {
    const v = parsed?.[l]
    if (typeof v === 'string' && v.trim()) out[l] = v.trim()
  }
  return out
}
