// TTS da dobragem ao vivo das sessões — agora um ADAPTADOR fino da voz da casa (lib/voz).
// REGRA MTM: todo o áudio AI usa SEMPRE o clone Fish "ricardogarcia", nunca voz genérica.
//
// A lógica (voz, limites, cache, classificação de erros) mudou-se para `lib/voz` para
// que o resto do sistema a possa usar. Aqui fica só a tradução para a interface antiga:
// as mesmas assinaturas e o mesmo `null` em falha, para não mexer nos 3 chamadores vivos
// (captions, dvr/worker e /api/live-sessions/tts). Quem quiser saber PORQUE falhou usa
// `falar()`/`falarParaStorage()` de `lib/voz` directamente.

import { VOZ_RICARDO, falar, falarParaStorage, type FalhaVoz } from '@/lib/voz'

/** Mantido para compatibilidade: a voz do clone do Ricardo. */
export const FISH_VOICE_ID = VOZ_RICARDO

export type SynthResult = { buffer: Buffer; contentType: string } | null

// A dobragem usa a voz do EDUCADOR do stream quando ela existe: é a porta explícita
// da regra da voz (ver lib/voz/nucleo.ts → resolverVoz). Sem este motivo, um voiceId
// diferente do clone seria recusado — que é exactamente o que queremos por omissão.
const MOTIVO_EDUCADOR = 'dobragem-lms: voz do educador do stream'

function registar(f: FalhaVoz, onde: string): null {
  console.error(`[lms-tts] ${onde} (${f.motivo}): ${f.detalhe}`)
  return null
}

/** Gera TTS e guarda no bucket público `lms-tts`; devolve o URL público (ou null). */
export async function synthesizeToStorage(
  supabase: { storage: any },
  text: string,
  path: string,
  voiceId?: string,
): Promise<string | null> {
  const r = await falarParaStorage(supabase, text, path, {
    voiceId,
    motivoVozAlternativa: MOTIVO_EDUCADOR,
  })
  return r.ok ? r.url : registar(r, 'synthesizeToStorage')
}

/**
 * Gera fala (mp3) na voz clonada a partir de texto (já no idioma-alvo).
 * Devolve null em falha (o chamador decide o fallback).
 */
export async function synthesizeSpeech(
  text: string,
  opts?: { voiceId?: string; format?: 'mp3' | 'opus' | 'wav'; latency?: 'normal' | 'balanced' },
): Promise<SynthResult> {
  const r = await falar(text, {
    voiceId: opts?.voiceId,
    motivoVozAlternativa: MOTIVO_EDUCADOR,
    formato: opts?.format,
    latencia: opts?.latency,
  })
  if (!r.ok) return registar(r, 'synthesizeSpeech')
  return { buffer: r.buffer, contentType: r.contentType }
}
