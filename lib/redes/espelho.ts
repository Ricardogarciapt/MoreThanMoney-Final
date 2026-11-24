import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { publicarLinkedin, publicarTiktok, publicarYoutube, type Saida } from './publicar'
import { tokenDa, type Conta } from './oauth'
import { IG_DA_MARCA, MARCAS, MAX_POR_DIA, adaptarLegenda, type Marca } from './regras'

/**
 * ESPELHO — o reel que saiu no Instagram da marca volta a sair nas redes novas, sozinho.
 *
 * 1. Junta à fila (`redes_publicacoes`) cada REELS publicado nas últimas 48 h na conta de
 *    Instagram da marca, uma linha por conta ligada e activa. O par (origem, conta) é único,
 *    por isso correr duas vezes não duplica nada.
 * 2. Publica o que está na fila, uma de cada vez por conta, no máximo MAX_POR_DIA por conta.
 *
 * Os carrosséis diários NÃO entram: só REELS. O interruptor por marca está em
 * site_settings.redes_espelho ({"morethanmoney": true, "ricardo-garcia": false}).
 */

const MAX_TENTATIVAS = 3

export async function lerEspelho(): Promise<Record<Marca, boolean>> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'redes_espelho').maybeSingle()
  const v = (data?.value ?? {}) as Partial<Record<Marca, boolean>>
  return { morethanmoney: v.morethanmoney !== false, 'ricardo-garcia': v['ricardo-garcia'] === true }
}

export async function enfileirar(): Promise<number> {
  const db = getSupabaseAdmin()
  const ligado = await lerEspelho()
  const { data: contas } = await db.from('redes_contas').select('id, rede, marca').eq('ativa', true)
  let novas = 0
  for (const marca of MARCAS) {
    if (!ligado[marca]) continue
    const destino = (contas ?? []).filter((c) => c.marca === marca)
    if (!destino.length) continue
    const { data: reels } = await db
      .from('social_scheduled_posts')
      .select('id, media_urls, caption')
      .eq('ig_account_id', IG_DA_MARCA[marca])
      .eq('media_type', 'REELS')
      .eq('status', 'published')
      .gte('updated_at', new Date(Date.now() - 48 * 3600_000).toISOString())
      .limit(20)
    for (const r of reels ?? []) {
      const video = (r.media_urls ?? [])[0]
      if (!video) continue
      const linhas = destino.map((c) => ({
        origem_id: r.id,
        conta_id: c.id,
        video_url: video,
        legenda: adaptarLegenda(String(r.caption ?? ''), c.rede),
      }))
      const { data } = await db.from('redes_publicacoes').upsert(linhas, { onConflict: 'origem_id,conta_id', ignoreDuplicates: true }).select('id')
      novas += data?.length ?? 0
    }
  }
  return novas
}

async function baixar(url: string): Promise<Buffer> {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`o vídeo não se deixou ler (HTTP ${r.status})`)
  return Buffer.from(new Uint8Array(await r.arrayBuffer()))
}

export type Resultado = { id: string; rede: string; estado: string; url?: string | null; nota?: string; erro?: string }

export async function publicarFila(max = 3): Promise<Resultado[]> {
  const db = getSupabaseAdmin()
  const agora = new Date()
  // Linhas presas em «a_publicar» há mais de 20 min (ronda que morreu) voltam à fila.
  await db.from('redes_publicacoes').update({ estado: 'na_fila' }).eq('estado', 'a_publicar')
    .lt('atualizado_em', new Date(agora.getTime() - 20 * 60_000).toISOString()).lt('tentativas', MAX_TENTATIVAS)

  const { data: fila } = await db
    .from('redes_publicacoes')
    .select('id, conta_id, video_url, legenda, tentativas')
    .in('estado', ['na_fila', 'erro'])
    .lt('tentativas', MAX_TENTATIVAS)
    .lte('publicar_em', agora.toISOString())
    .order('criado_em', { ascending: true })
    .limit(20)
  if (!fila?.length) return []

  const ids = [...new Set(fila.map((f) => f.conta_id))]
  const { data: contas } = await db.from('redes_contas').select('*').in('id', ids).eq('ativa', true)
  const porId = new Map((contas ?? []).map((c) => [c.id, c as Conta]))

  const inicioDia = new Date(agora); inicioDia.setUTCHours(0, 0, 0, 0)
  const usadas = new Set<string>()
  const out: Resultado[] = []
  for (const linha of fila) {
    if (out.length >= max) break
    const conta = porId.get(linha.conta_id)
    if (!conta || usadas.has(conta.id)) continue
    const { count } = await db.from('redes_publicacoes').select('id', { count: 'exact', head: true })
      .eq('conta_id', conta.id).eq('estado', 'publicado').gte('publicado_em', inicioDia.toISOString())
    if ((count ?? 0) >= MAX_POR_DIA) continue
    usadas.add(conta.id)

    const tentativas = (linha.tentativas ?? 0) + 1
    await db.from('redes_publicacoes').update({ estado: 'a_publicar', tentativas, atualizado_em: new Date().toISOString() }).eq('id', linha.id)
    try {
      const video = await baixar(linha.video_url)
      const token = await tokenDa(conta)
      let s: Saida
      if (conta.rede === 'youtube') s = await publicarYoutube(token, video, linha.legenda)
      else if (conta.rede === 'tiktok') s = await publicarTiktok(token, video, linha.legenda)
      else s = await publicarLinkedin(conta, token, video, linha.legenda)
      await db.from('redes_publicacoes').update({
        estado: 'publicado', id_externo: s.id, url: s.url, nota: s.nota ?? null, erro: null,
        publicado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
      }).eq('id', linha.id)
      out.push({ id: linha.id, rede: conta.rede, estado: 'publicado', url: s.url, nota: s.nota })
    } catch (e) {
      const erro = (e instanceof Error ? e.message : String(e)).slice(0, 500)
      // Volta a tentar daqui a 30 min; à terceira fica em erro de vez.
      await db.from('redes_publicacoes').update({
        estado: 'erro', erro, atualizado_em: new Date().toISOString(),
        publicar_em: new Date(Date.now() + 30 * 60_000).toISOString(),
      }).eq('id', linha.id)
      out.push({ id: linha.id, rede: conta.rede, estado: 'erro', erro })
    }
  }
  return out
}
