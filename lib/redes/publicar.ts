import { escaparLinkedin, partesTiktok, tituloShort } from './regras'
import { LINKEDIN_VERSAO, linkedinEhPagina, type Conta } from './oauth'

/**
 * Publicar UM vídeo vertical numa rede. Cada função recebe o ficheiro já em memória (os reels da
 * casa têm segundos e poucos MB) e devolve o id e o link do que ficou publicado.
 *
 * Contas e apps novas têm limites que não se contornam por código:
 *  · YouTube: um projecto Google sem auditoria publica tudo como PRIVADO. Fica registado na nota.
 *  · TikTok: uma app sem auditoria da TikTok só pode publicar como «só eu» (SELF_ONLY). Usamos a
 *    melhor visibilidade que o próprio TikTok oferece à conta e anotamos quando não é pública.
 *  · LinkedIn: publicar numa página exige a «Community Management API» aprovada na app.
 */

export type Saida = { id: string; url: string | null; nota?: string }

export async function publicarYoutube(token: string, video: Buffer, legenda: string): Promise<Saida> {
  const abrir = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(video.length),
    },
    body: JSON.stringify({
      snippet: { title: tituloShort(legenda), description: legenda.slice(0, 5000), categoryId: '27', defaultLanguage: 'pt-PT' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    }),
  })
  if (!abrir.ok) throw new Error(`YouTube ${abrir.status}: ${(await abrir.text()).slice(0, 200)}`)
  const destino = abrir.headers.get('location')
  if (!destino) throw new Error('o YouTube não devolveu destino de upload')
  const enviar = await fetch(destino, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'content-length': String(video.length) },
    body: new Uint8Array(video),
  })
  if (!enviar.ok) throw new Error(`YouTube upload ${enviar.status}: ${(await enviar.text()).slice(0, 200)}`)
  const j = (await enviar.json()) as { id?: string; status?: { privacyStatus?: string } }
  if (!j.id) throw new Error('o YouTube não devolveu id')
  const priv = j.status?.privacyStatus
  return {
    id: j.id,
    url: `https://www.youtube.com/shorts/${j.id}`,
    nota: priv && priv !== 'public' ? `ficou ${priv}: o projecto Google precisa da auditoria da API do YouTube para publicar em público` : undefined,
  }
}

const TT = 'https://open.tiktokapis.com/v2/post/publish'

export async function publicarTiktok(token: string, video: Buffer, legenda: string): Promise<Saida> {
  const h = { Authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' }
  const info = await fetch(`${TT}/creator_info/query/`, { method: 'POST', headers: h })
  const ij = (await info.json().catch(() => ({}))) as { data?: { privacy_level_options?: string[]; creator_username?: string }; error?: { code?: string; message?: string } }
  if (!info.ok || (ij.error?.code && ij.error.code !== 'ok')) throw new Error(`TikTok creator_info: ${ij.error?.message || info.status}`)
  const opcoes = ij.data?.privacy_level_options ?? []
  const privacidade = opcoes.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : opcoes.includes('SELF_ONLY') ? 'SELF_ONLY' : opcoes[0]
  if (!privacidade) throw new Error('o TikTok não deu nenhuma opção de visibilidade a esta conta')

  const { chunk, total } = partesTiktok(video.length)
  const init = await fetch(`${TT}/video/init/`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      post_info: { title: legenda.slice(0, 2200), privacy_level: privacidade, disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info: { source: 'FILE_UPLOAD', video_size: video.length, chunk_size: chunk, total_chunk_count: total },
    }),
  })
  const jj = (await init.json().catch(() => ({}))) as { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } }
  if (!init.ok || !jj.data?.upload_url || !jj.data.publish_id) throw new Error(`TikTok init: ${jj.error?.message || init.status}`)

  for (let i = 0; i < total; i++) {
    const ini = i * chunk
    const fim = i === total - 1 ? video.length - 1 : ini + chunk - 1
    const parte = video.subarray(ini, fim + 1)
    const r = await fetch(jj.data.upload_url, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4', 'content-length': String(parte.length), 'content-range': `bytes ${ini}-${fim}/${video.length}` },
      body: new Uint8Array(parte),
    })
    if (!r.ok) throw new Error(`TikTok upload parte ${i + 1}/${total}: ${r.status}`)
  }
  const user = ij.data?.creator_username
  return {
    id: jj.data.publish_id,
    url: user ? `https://www.tiktok.com/@${user}` : null,
    nota: privacidade !== 'PUBLIC_TO_EVERYONE' ? `publicado como ${privacidade}: a app TikTok ainda não passou a auditoria da Content Posting API` : 'enviado; o TikTok processa o vídeo em alguns minutos',
  }
}

const LI = 'https://api.linkedin.com/rest'

export async function publicarLinkedin(conta: Conta, token: string, video: Buffer, legenda: string): Promise<Saida> {
  const autor = conta.conta_externa_id
  if (!autor) throw new Error('falta o autor (página ou perfil) desta conta LinkedIn')
  const h = { Authorization: `Bearer ${token}`, 'LinkedIn-Version': LINKEDIN_VERSAO(), 'X-Restli-Protocol-Version': '2.0.0', 'content-type': 'application/json' }

  const init = await fetch(`${LI}/videos?action=initializeUpload`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ initializeUploadRequest: { owner: autor, fileSizeBytes: video.length, uploadCaptions: false, uploadThumbnail: false } }),
  })
  const ij = (await init.json().catch(() => ({}))) as { value?: { video?: string; uploadToken?: string; uploadInstructions?: { uploadUrl: string; firstByte: number; lastByte: number }[] }; message?: string }
  const v = ij.value
  if (!init.ok || !v?.video || !v.uploadInstructions?.length) throw new Error(`LinkedIn initializeUpload ${init.status}: ${ij.message || ''}`.trim())

  const etags: string[] = []
  for (const p of v.uploadInstructions) {
    const r = await fetch(p.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(video.subarray(p.firstByte, p.lastByte + 1)),
    })
    if (!r.ok) throw new Error(`LinkedIn upload ${r.status}`)
    etags.push(r.headers.get('etag') ?? '')
  }
  const fin = await fetch(`${LI}/videos?action=finalizeUpload`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken ?? '', uploadedPartIds: etags } }),
  })
  if (!fin.ok) throw new Error(`LinkedIn finalizeUpload ${fin.status}: ${(await fin.text()).slice(0, 200)}`)

  const post = await fetch(`${LI}/posts`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      author: autor,
      commentary: escaparLinkedin(legenda),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: v.video } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  if (!post.ok) throw new Error(`LinkedIn posts ${post.status}: ${(await post.text()).slice(0, 200)}`)
  const urn = post.headers.get('x-restli-id') || post.headers.get('x-linkedin-id') || ''
  return {
    id: urn || v.video,
    url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : null,
    nota: linkedinEhPagina(conta.marca) ? undefined : 'publicado no perfil pessoal',
  }
}
