// TTS na voz clonada (Fish Audio) — para a dobragem ao vivo das sessões.
// REGRA MTM: todo o áudio AI usa SEMPRE o clone Fish "ricardogarcia", nunca voz genérica.
// O texto já vem traduzido no idioma-alvo; o Fish fala-o na voz clonada (multilíngue).

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts'
// Voice ID do modelo clonado "ricardogarcia" (default; sobreponível por env).
export const FISH_VOICE_ID = process.env.FISH_VOICE_ID || '1e0fa8b490c744acba94da72710e6db2'
const FISH_MODEL = process.env.FISH_MODEL || 'speech-1.6'

export type SynthResult = { buffer: Buffer; contentType: string } | null

/**
 * Gera fala (mp3) na voz clonada a partir de texto (já no idioma-alvo).
 * Devolve null em falha (o chamador decide o fallback).
 */
export async function synthesizeSpeech(
  text: string,
  opts?: { voiceId?: string; format?: 'mp3' | 'opus' | 'wav'; latency?: 'normal' | 'balanced' },
): Promise<SynthResult> {
  const key = process.env.FISH_API_KEY
  if (!key || !text.trim()) return null
  const format = opts?.format || 'mp3'
  try {
    const res = await fetch(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        model: FISH_MODEL, // backend de síntese (ex.: speech-1.6 / s1)
      },
      body: JSON.stringify({
        text,
        reference_id: opts?.voiceId || FISH_VOICE_ID,
        format,
        mp3_bitrate: 128,
        normalize: true,
        latency: opts?.latency || 'balanced',
      }),
    })
    if (!res.ok) {
      console.error('[lms-tts] Fish', res.status, (await res.text()).slice(0, 200))
      return null
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 200) return null // resposta vazia/erro
    return { buffer, contentType: format === 'mp3' ? 'audio/mpeg' : `audio/${format}` }
  } catch (err) {
    console.error('[lms-tts] Fish exceção:', (err as Error).message)
    return null
  }
}
