/**
 * Reels de marca pessoal do @ricardogarciapt («gémeo IA»): o site escolhe o guião, gera a voz
 * clonada do Ricardo (lib/voz, Fish) e devolve tudo ao robô (.github/workflows/reels-ricardo.yml),
 * que desenha o vídeo com services/reels-ricardo/render.py e o entrega de volta para a fila do IG.
 *
 * Nada sai sem `site_settings.reels_ricardo.ligado = true` (ver interruptor.ts). Em modo teste
 * os reels saem como «reels de teste» do Instagram (só não seguidores no início).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { falarParaStorage } from '@/lib/voz'
import { CRIADOR_REELS_PESSOAL, IG_PERSONAL_ID } from '@/lib/instagram/publish'
import { FOTOS_IA, FOTOS_LOCAIS } from '@/lib/carrossel-diario/fotos'
import { lerInterruptorReels } from './interruptor'
import guioes from './guioes.json'

export type GuiaoReel = (typeof guioes)['reels'][number]

const SITE = 'https://www.morethanmoney.pt'
const CHAVE_ESTADO = 'reels_ricardo_estado'
/** Hora de publicar, em Lisboa: depois do carrossel das 19:00. */
const HORA = { h: 20, m: 30 }

export const BANCO: GuiaoReel[] = guioes.reels

type Estado = { feitos: number[] }

async function lerEstado(): Promise<Estado> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE_ESTADO).maybeSingle()
  const v = (data?.value ?? {}) as Partial<Estado>
  return { feitos: Array.isArray(v.feitos) ? v.feitos.map(Number).filter(Number.isFinite) : [] }
}

async function gravarEstado(e: Estado): Promise<void> {
  await getSupabaseAdmin().from('site_settings').upsert({ key: CHAVE_ESTADO, value: e }, { onConflict: 'key' })
}

/** Próximo guião ainda não feito, pela ordem do funil (topo → meio → fundo). */
export function proximoGuiao(feitos: number[], pedido?: number): GuiaoReel | null {
  if (pedido) return BANCO.find((r) => r.n === pedido) ?? null
  return BANCO.find((r) => !feitos.includes(r.n)) ?? null
}

export function legendaCompleta(r: GuiaoReel): string {
  return `${r.legenda}\n\n${r.hashtags.join(' ')}`
}

/** As fotos do Ricardo como URLs públicos (reais do site + retratos IA aprovados). */
export function fotosDoRicardo(): string[] {
  return [...FOTOS_LOCAIS.map((p) => `${SITE}/${p}`), ...FOTOS_IA]
}

/** Data/hora UTC de HH:MM em Lisboa no dia `dia` (AAAA-MM-DD). */
export function horaLisboa(dia: string, h = HORA.h, m = HORA.m): Date {
  const palpite = new Date(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  const off = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', timeZoneName: 'shortOffset' })
    .formatToParts(palpite)
    .find((p) => p.type === 'timeZoneName')?.value // «GMT» ou «GMT+1»
  const horas = Number(off?.replace('GMT', '') || 0)
  return new Date(palpite.getTime() - horas * 3_600_000)
}

/**
 * O que o robô deve desenhar agora. Não desenha se o interruptor estiver desligado (a menos que
 * se peça um `n` explícito, para pré-visualizar) nem se a fila já tiver reels suficientes.
 */
export async function planear(pedido?: number) {
  const estado = await lerInterruptorReels()
  if (!pedido && !estado.ligado) return { nada: 'desligado' as const }
  const db = getSupabaseAdmin()
  if (!pedido) {
    const { count } = await db
      .from('social_scheduled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', CRIADOR_REELS_PESSOAL)
      .in('status', ['approved', 'processing', 'publishing'])
    if ((count ?? 0) >= estado.porDia * 2) return { nada: 'fila cheia' as const }
  }
  const { feitos } = await lerEstado()
  const reel = proximoGuiao(feitos, pedido)
  if (!reel) return { nada: 'banco esgotado' as const }

  const vozes: string[] = []
  for (let i = 0; i < reel.falas.length; i++) {
    const r = await falarParaStorage(db, reel.falas[i], `reels-ricardo/${reel.n}-${reel.slug}/${i + 1}.mp3`)
    if (!r.ok) return { erro: `voz falhou na fala ${i + 1}: ${r.motivo}${r.detalhe ? ` (${r.detalhe})` : ''}` }
    vozes.push(r.url)
  }
  return { reel, vozes, fotos: fotosDoRicardo(), teste: estado.teste }
}

/** Próxima vaga das 20:30 de Lisboa a partir de amanhã, sem dois reels no mesmo dia. */
async function proximaVaga(): Promise<Date> {
  const { data } = await getSupabaseAdmin()
    .from('social_scheduled_posts')
    .select('scheduled_at')
    .eq('created_by', CRIADOR_REELS_PESSOAL)
    .in('status', ['approved', 'processing', 'publishing', 'published'])
    .order('scheduled_at', { ascending: false })
    .limit(1)
  const ultimo = data?.[0]?.scheduled_at ? new Date(data[0].scheduled_at as string) : null
  const base = new Date(Math.max(Date.now(), ultimo ? ultimo.getTime() + 20 * 3_600_000 : 0))
  let dia = base.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' })
  let quando = horaLisboa(dia)
  if (quando.getTime() < base.getTime() + 30 * 60_000) {
    dia = new Date(quando.getTime() + 24 * 3_600_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' })
    quando = horaLisboa(dia)
  }
  return quando
}

/**
 * O robô entrega o vídeo e a capa: entra na fila da conta pessoal como «approved» (o ig-publish
 * ainda confirma o interruptor no momento de publicar). `rascunho` deixa-o em draft para rever.
 */
export async function entregar(n: number, videoUrl: string, capaUrl: string | null, rascunho = false) {
  const reel = BANCO.find((r) => r.n === n)
  if (!reel) throw new Error(`guião ${n} não existe`)
  const quando = await proximaVaga()
  const { data, error } = await getSupabaseAdmin()
    .from('social_scheduled_posts')
    .insert({
      channel: 'instagram',
      ig_account_id: IG_PERSONAL_ID,
      ig_username: 'ricardogarciapt',
      pillar: `reels-ricardo:${reel.etapa}:${reel.slug}`,
      media_type: 'REELS',
      media_urls: capaUrl ? [videoUrl, capaUrl] : [videoUrl],
      caption: legendaCompleta(reel),
      scheduled_at: quando.toISOString(),
      status: rascunho ? 'draft' : 'approved',
      approved_by: rascunho ? null : 'reels-ricardo',
      approved_at: rascunho ? null : new Date().toISOString(),
      created_by: CRIADOR_REELS_PESSOAL,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  if (!rascunho) {
    const estado = await lerEstado()
    if (!estado.feitos.includes(n)) await gravarEstado({ feitos: [...estado.feitos, n] })
  }
  return { ok: true, id: data.id as string, scheduled_at: quando.toISOString(), estado: rascunho ? 'draft' : 'approved' }
}
