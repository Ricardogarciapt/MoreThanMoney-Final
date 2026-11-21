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
import { LOOKS, VOZ_RICARDO, lookDoDia, type Cena } from './heygen-looks'
import { PROJETO_VAZIO, moldeDoDia, normalizarProjeto } from './projeto'

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
  // API v3 (a v2 foi retirada a 20/11/2026: «POST /v2/video/generate has been retired»). A v3 faz um
  // look por vídeo: o reel vai inteiro no look do primeiro plano e as falas seguem-se numa só voz.
  // O look roda por dia entre três (lookDoDia, 21/11).
  const c0 = cenas[0]
  const sobreMedia = c0.visual !== 'apresentador' && !!c0.media_url
  const look = lookDoDia(new Date(), cfg.avatarEnv)
  const audio = cenas.length === 1 ? c0.audio_url : null
  const script = cenas.map((c) => c.texto).join(' ').replace(/\s+/g, ' ').trim().slice(0, 5000)
  try {
    const r = await fetch(`${API}/v3/videos`, {
      method: 'POST',
      headers: { 'x-api-key': cfg.chave, 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'avatar',
        avatar_id: look.id,
        ...(titulo ? { title: titulo.slice(0, 100) } : {}),
        ...(audio
          ? { audio_url: audio }
          : { script, voice_id: cfg.voz, voice_settings: { engine_settings: { engine_type: 'heygen_voice' } } }),
        engine: { type: 'avatar_iii' }, // ≈7 créditos/min (o Avatar 6 por omissão gasta ~3×)
        aspect_ratio: DIMENSOES[aspecto] ? aspecto : '9:16',
        resolution: '1080p',
        ...(sobreMedia && !VIDEO_URL.test(c0.media_url!) ? { background: { type: 'image', url: c0.media_url } } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    })
    const j = await r.json().catch(() => ({}))
    const d = j?.data ?? j
    const id = d?.video_id ?? d?.id
    if (!r.ok || typeof id !== 'string') return { erro: `heygen ${r.status}: ${String(j?.error?.message || j?.message || j?.detail || 'sem video_id').slice(0, 200)}` }
    return { id }
  } catch (e) {
    return { erro: `heygen sem resposta: ${(e as Error).message}`.slice(0, 200) }
  }
}

const VIDEO_URL = /\.(mp4|mov|webm)(\?|$)/i

/** Estado de um vídeo: v3 primeiro, v1 se a v3 não o conhecer. Normaliza para {status, video_url, duration, erro}. */
export async function estadoHeygen(chave: string, vid: string): Promise<{ status: string; video_url?: string; duration?: number; erro?: string }> {
  const ler = async (url: string) => {
    const r = await fetch(url, { headers: { 'x-api-key': chave }, signal: AbortSignal.timeout(10000) })
    const j = await r.json().catch(() => ({}))
    return { ok: r.ok, d: j?.data ?? j ?? {} }
  }
  let { ok, d } = await ler(`${API}/v3/videos/${encodeURIComponent(vid)}`)
  if (!ok || !d?.status) ({ ok, d } = await ler(`${API}/v1/video_status.get?video_id=${encodeURIComponent(vid)}`))
  return {
    status: String(d?.status || 'desconhecido').toLowerCase(),
    video_url: typeof d?.video_url === 'string' ? d.video_url : undefined,
    duration: Number(d?.duration) || undefined,
    erro: d?.failure_message || d?.error?.message || (typeof d?.error === 'string' ? d.error : undefined),
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
    // Gerado pela rotina do plano (MCP): o URL já vem no pedido e não se pergunta nada à API.
    const d = typeof g.params?.heygen_url === 'string'
      ? { status: 'completed', video_url: g.params.heygen_url as string, duration: Number(g.params?.duracao) || undefined, erro: undefined }
      : await estadoHeygen(cfg.chave, vid)
    const agora = new Date().toISOString()
    if (d.status === 'failed') {
      const erro = `heygen: ${String(d.erro || 'falhou').slice(0, 300)}`
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
 * Reel do clone pronto → liga o vídeo à peça e cria o projecto JÁ NO MOLDE CINEMÁTICO (20/11/2026,
 * aprovado pelo Ricardo: «é mesmo isto que eu procuro»): o gémeo fica por baixo e o robô
 * video/cinematico/robo-cinematico.mjs monta por cima gancho cinético, legendas palavra a palavra,
 * imagens em PiP, chips, light leaks, música e cartão final com CTA, a -14 LUFS. O reel «à moda
 * antiga» (gancho + karaoke no editor do Mac) deixou de se produzir. Nada aqui publica. Nunca lança.
 */
async function projetoDoClone(db: SupabaseClient, g: Geracao, v: { ativoId: string; caminho: string; duracao: number }) {
  try {
    const pecaId = g.params.peca_id as string
    await db.from('estudio_ativos').update({ peca_id: pecaId }).eq('id', v.ativoId)
    const { data: peca } = await db.from('conteudo_magnetico_pecas').select('user_id, marca, guiao').eq('id', pecaId).maybeSingle()
    if (!peca) return
    const gu = (peca.guiao ?? {}) as any
    const segs: any[] = Array.isArray(gu.reel?.segmentos) ? gu.reel.segmentos : []
    const marca = peca.marca === 'morethanmoney' ? 'morethanmoney' : 'ricardo-garcia'
    const dur = Math.max(2, Math.min(v.duracao, 180))
    const projeto = normalizarProjeto({
      ...PROJETO_VAZIO,
      clips: [{ media: 'video', fonte: { tipo: 'ativo', ref: v.ativoId, caminho: v.caminho, url: null }, nome: 'Clone (HeyGen)', duracao_fonte: dur, de: 0, ate: dur }],
      legendas: 'karaoke',
      fundo: 'marca',
      molde: 'cinematico',
      cinematico: {
        marca,
        gancho: String(segs[0]?.texto_ecra || gu.gancho || ''),
        palavra_chave: String(gu.palavra_chave || ''),
        nicho: String(gu.nicho || ''),
        texto: String(g.params?.texto || ''),
        apoio: Array.isArray(g.params?.apoio) ? g.params.apoio : [],
        cta_url: String(gu.cta_url || ''),
        molde: moldeDoDia(),
      },
    })
    const titulo = gu.nicho ? `Reel · ${String(gu.nicho).slice(0, 60)} · cinemático` : 'Reel cinemático do clone'
    const linhas = [{ user_id: g.pedido_por || peca.user_id, titulo: titulo.slice(0, 120), marca, projeto, estado: 'a_render' }]
    // 21/11/2026 (Ricardo: «usa os conteúdos que crias para outros conteúdos»): o mesmo gémeo dá
    // também o reel da OUTRA conta, montado com a marca dela (cores, @, CTA e palavra do funil dela).
    // Um gémeo por dia (alternância) chega assim às duas contas sem gastar mais créditos.
    const outra = marca === 'morethanmoney' ? 'ricardo-garcia' : 'morethanmoney'
    const projetoOutra = normalizarProjeto({
      ...projeto,
      cinematico: {
        ...(projeto as any).cinematico,
        marca: outra,
        palavra_chave: outra === 'morethanmoney' ? 'COMEÇAR' : String(gu.palavra_chave || ''),
        cta_url: outra === 'morethanmoney' ? 'morethanmoney.pt' : String(gu.cta_url || ''),
        molde: moldeDoDia(new Date(), 1), // reaproveitado → outro molde de edição
      },
    })
    linhas.push({ user_id: g.pedido_por || peca.user_id, titulo: `${titulo} · versão ${outra === 'morethanmoney' ? 'MTM' : 'Ricardo'}`.slice(0, 120), marca: outra, projeto: projetoOutra, estado: 'a_render' })
    await db.from('estudio_projetos').insert(linhas)
  } catch {
    /* o vídeo já está na biblioteca; o projecto monta-se à mão no editor */
  }
}
