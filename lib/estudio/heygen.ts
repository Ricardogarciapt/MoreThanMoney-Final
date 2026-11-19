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
import { LOOKS, VOZ_RICARDO, lookDoPlano, personagem, type Cena } from './heygen-looks'
import { PROJETO_VAZIO, normalizarProjeto } from './projeto'

const API = 'https://api.heygen.com'

/** Só a chave é obrigatória; o Twin e a voz vêm de heygen-looks.ts se não houver variáveis. */
export function heygenConfig(): { chave: string; avatar: string; voz: string; avatarEnv: string | null } | null {
  const chave = process.env.HEYGEN_API_KEY?.trim()
  if (!chave) return null
  const avatarEnv = process.env.HEYGEN_AVATAR_ID?.trim() || null
  return { chave, avatar: avatarEnv || LOOKS.twin.id, voz: process.env.HEYGEN_VOICE_ID?.trim() || VOZ_RICARDO, avatarEnv }
}

const DIMENSOES: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
}

/**
 * Pede o vídeo. `texto` (um só plano, no Twin) ou `cenas` (uma cena por plano do guião, cada uma no
 * look do seu plano, tudo num só vídeo). Devolve o video_id da HeyGen ou a mensagem de erro.
 */
export async function enviarHeygen(texto: string | Cena[], aspecto = '9:16', titulo?: string): Promise<{ id: string } | { erro: string }> {
  const cfg = heygenConfig()
  if (!cfg) return { erro: 'HeyGen não configurada.' }
  const cenas: Cena[] = typeof texto === 'string' ? [{ texto, plano: 'fechado' }] : texto
  if (!cenas.length) return { erro: 'Sem texto para o clone dizer.' }
  try {
    const r = await fetch(`${API}/v2/video/generate`, {
      method: 'POST',
      headers: { 'x-api-key': cfg.chave, 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(titulo ? { title: titulo.slice(0, 100) } : {}),
        video_inputs: cenas.slice(0, 50).map((c) => ({
          character: personagem(lookDoPlano(c.plano, cfg.avatarEnv)),
          voice: { type: 'text', input_text: c.texto.slice(0, 1500), voice_id: cfg.voz },
        })),
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
    if (ativo && typeof g.params?.peca_id === 'string') {
      await projetoDoClone(db, g, { ativoId: ativo.id, caminho, duracao: Number(d.duration) || 15 })
    }
    return ativo ? 'pronto' : 'erro'
  } catch {
    return 'a_gerar'
  }
}

/**
 * Reel do clone pronto → liga o vídeo à peça e cria o projecto do editor (gancho no início, CTA no
 * fim, legendas karaoke, marca de água) já em 'a_render', como o robô dos takes: o Mac acaba-o e o
 * render fica na biblioteca do /estudio. Nada aqui publica. Nunca lança.
 */
async function projetoDoClone(db: SupabaseClient, g: Geracao, v: { ativoId: string; caminho: string; duracao: number }) {
  try {
    const pecaId = g.params.peca_id as string
    await db.from('estudio_ativos').update({ peca_id: pecaId }).eq('id', v.ativoId)
    const { data: peca } = await db.from('conteudo_magnetico_pecas').select('user_id, marca, guiao').eq('id', pecaId).maybeSingle()
    if (!peca) return
    const gu = (peca.guiao ?? {}) as any
    const seg0 = Array.isArray(gu.reel?.segmentos) ? gu.reel.segmentos[0] : null
    const gancho = String(seg0?.texto_ecra || '').slice(0, 90)
    const cta = gu.palavra_chave ? `Comenta «${String(gu.palavra_chave)}»` : ''
    const dur = Math.max(2, Math.min(v.duracao, 180))
    const projeto = normalizarProjeto({
      ...PROJETO_VAZIO,
      clips: [{ media: 'video', fonte: { tipo: 'ativo', ref: v.ativoId, caminho: v.caminho, url: null }, nome: 'Clone (HeyGen)', duracao_fonte: dur, de: 0, ate: dur }],
      textos: [
        ...(gancho ? [{ texto: gancho, inicio: 0, fim: Math.min(3, dur), posicao: 'cima', estilo: 'titulo', animacao: 'aparecer' }] : []),
        ...(cta ? [{ texto: cta, inicio: Math.max(0, dur - 3), fim: dur, posicao: 'baixo', estilo: 'cta', animacao: 'subir' }] : []),
      ],
      legendas: 'karaoke',
      fundo: 'marca',
    })
    const titulo = gu.nicho ? `Reel · ${String(gu.nicho).slice(0, 60)} · clone` : 'Reel do clone'
    await db.from('estudio_projetos').insert({
      user_id: g.pedido_por || peca.user_id,
      titulo: titulo.slice(0, 120),
      marca: peca.marca || 'ricardo-garcia',
      projeto,
      estado: 'a_render',
    })
  } catch {
    /* o vídeo já está na biblioteca; o projecto monta-se à mão no editor */
  }
}
