/**
 * HEYGEN como motor do tipo «falar» (o clone do Ricardo a dizer um texto, com a voz dele).
 * Liga-se só com as variáveis na Vercel; sem elas o «falar» continua na fila da GPU própria.
 *
 *   HEYGEN_API_KEY     chave da API (app.heygen.com → Settings → API)
 *   HEYGEN_AVATAR_ID   o Digital Twin do Ricardo (avatar criado a partir do vídeo dele)
 *   HEYGEN_VOICE_ID    a voz clonada dele na HeyGen
 *
 * Fluxo sem cron: o POST de /api/estudio/geracao envia o pedido à HeyGen e guarda o video_id em
 * params.heygen_id; cada GET ?id= pergunta o estado e, quando fica pronto, descarrega o MP4 para o
 * Storage do estúdio e cria o ativo, como faz o worker da GPU.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const API = 'https://api.heygen.com'

export function heygenConfig(): { chave: string; avatar: string; voz: string } | null {
  const chave = process.env.HEYGEN_API_KEY?.trim()
  const avatar = process.env.HEYGEN_AVATAR_ID?.trim()
  const voz = process.env.HEYGEN_VOICE_ID?.trim()
  return chave && avatar && voz ? { chave, avatar, voz } : null
}

const DIMENSOES: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
}

/** Pede o vídeo. Devolve o video_id da HeyGen ou a mensagem de erro. */
export async function enviarHeygen(texto: string, aspecto = '9:16'): Promise<{ id: string } | { erro: string }> {
  const cfg = heygenConfig()
  if (!cfg) return { erro: 'HeyGen não configurada.' }
  try {
    const r = await fetch(`${API}/v2/video/generate`, {
      method: 'POST',
      headers: { 'x-api-key': cfg.chave, 'content-type': 'application/json' },
      body: JSON.stringify({
        video_inputs: [{
          character: { type: 'avatar', avatar_id: cfg.avatar, avatar_style: 'normal' },
          voice: { type: 'text', input_text: texto.slice(0, 1500), voice_id: cfg.voz },
        }],
        dimension: DIMENSOES[aspecto] ?? DIMENSOES['9:16'],
      }),
      signal: AbortSignal.timeout(15000),
    })
    const j = await r.json().catch(() => ({}))
    const id = j?.data?.video_id
    if (!r.ok || typeof id !== 'string') return { erro: `heygen ${r.status}: ${String(j?.error?.message || j?.message || 'sem video_id').slice(0, 200)}` }
    return { id }
  } catch (e) {
    return { erro: `heygen sem resposta: ${(e as Error).message}`.slice(0, 200) }
  }
}

type Geracao = { id: string; estado: string; motor: string | null; params: any; pedido_por: string | null }

/**
 * Se o pedido está na HeyGen, vê o estado e fecha-o quando acabar (ativo novo no estúdio).
 * Devolve o estado actual do pedido. Nunca lança.
 */
export async function sincronizarHeygen(db: SupabaseClient, g: Geracao): Promise<string> {
  const cfg = heygenConfig()
  const vid = g.params?.heygen_id
  if (g.motor !== 'heygen' || g.estado !== 'a_gerar' || !cfg || typeof vid !== 'string') return g.estado
  try {
    const r = await fetch(`${API}/v1/video_status.get?video_id=${encodeURIComponent(vid)}`, {
      headers: { 'x-api-key': cfg.chave }, signal: AbortSignal.timeout(10000),
    })
    const d = (await r.json().catch(() => ({})))?.data ?? {}
    const agora = new Date().toISOString()
    if (d.status === 'failed') {
      const erro = `heygen: ${String(d.error?.message || d.error || 'falhou').slice(0, 300)}`
      await db.from('estudio_geracoes').update({ estado: 'erro', erro, terminado_em: agora }).eq('id', g.id).eq('estado', 'a_gerar')
      return 'erro'
    }
    if (d.status !== 'completed' || typeof d.video_url !== 'string') return 'a_gerar'

    const v = await fetch(d.video_url, { signal: AbortSignal.timeout(60000) })
    if (!v.ok) return 'a_gerar'
    const bytes = new Uint8Array(await v.arrayBuffer())
    const caminho = `ativos/ia/${agora.slice(0, 10)}/${g.id}.mp4`
    const { error: eUp } = await db.storage.from('estudio').upload(caminho, bytes, { contentType: 'video/mp4', upsert: true })
    if (eUp) return 'a_gerar'
    // Só um GET fecha o pedido (os outros vêem-no já fechado).
    const { data: meu } = await db.from('estudio_geracoes').update({ saida_caminho: caminho })
      .eq('id', g.id).eq('estado', 'a_gerar').is('saida_caminho', null).select('id').maybeSingle()
    if (!meu) return 'a_gerar'
    const { data: ativo } = await db.from('estudio_ativos').insert({
      user_id: g.pedido_por,
      tipo: 'video',
      nome: `Clone a falar (HeyGen) · ${String(g.params?.texto || '').slice(0, 40)}`,
      caminho,
      mime: 'video/mp4',
      tamanho: bytes.byteLength,
      estado: 'pronto',
      notas: `HeyGen ${vid} (${g.id})`,
    }).select('id').single()
    await db.from('estudio_geracoes').update(ativo
      ? { estado: 'pronto', saida_ativo_id: ativo.id, erro: null, terminado_em: agora }
      : { estado: 'erro', erro: 'Não consegui criar o ativo.', terminado_em: agora }).eq('id', g.id)
    return ativo ? 'pronto' : 'erro'
  } catch {
    return 'a_gerar'
  }
}
