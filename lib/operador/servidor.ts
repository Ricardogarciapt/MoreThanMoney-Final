import type { SupabaseClient } from '@supabase/supabase-js'
import { aprovarEnvio, rejeitarEnvio } from '@/lib/envios-fila'
import { marcarPublicado, marcarSaltado } from '@/lib/instagram/fila-comentarios-servidor'
import {
  AGENTE_OPERADOR,
  CONTA_MARCA,
  TECTO_COMENTARIOS,
  TECTO_ENVIOS,
  TECTO_POSTS,
  decidirComentario,
  decidirEnvio,
  decidirPost,
  lerConfig,
  type ConfigOperador,
  type EnvioPendente,
  type ItemFila,
  type PostRascunho,
} from './regras'

/**
 * A passagem do agente operador: lê o que está por decidir, decide com `regras.ts`, faz (ou, em
 * ensaio, só escreve o que faria) e deixa TUDO em `operador_registo` para o dono auditar.
 */

export interface LinhaRegisto {
  area: 'posts' | 'envios' | 'comentarios'
  alvo_tabela: string
  alvo_id: string
  acao: string
  resumo: string
  motivo?: string | null
  modo: 'ensaio' | 'feito'
  antes?: Record<string, unknown> | null
  agente?: string
}

export async function registar(db: SupabaseClient, l: LinhaRegisto) {
  await db.from('operador_registo').insert({ agente: AGENTE_OPERADOR, ...l })
}

export async function lerConfigOperador(db: SupabaseClient): Promise<ConfigOperador> {
  const { data } = await db.from('site_settings').select('value').eq('key', 'operador').maybeSingle()
  return lerConfig(data?.value)
}

export async function gravarConfigOperador(db: SupabaseClient, c: ConfigOperador) {
  await db.from('site_settings').upsert({ key: 'operador', value: c }, { onConflict: 'key' })
}

const curto = (t: string | null | undefined, n = 90) => {
  const s = (t ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Em ensaio, a mesma decisão não se escreve de meia em meia hora: uma vez por dia chega. */
async function jaEnsaiadoHoje(db: SupabaseClient, alvoId: string, acao: string) {
  const { count } = await db
    .from('operador_registo')
    .select('id', { count: 'exact', head: true })
    .eq('alvo_id', alvoId)
    .eq('acao', acao)
    .eq('modo', 'ensaio')
    .gte('criado_em', new Date(Date.now() - 24 * 3_600_000).toISOString())
  return (count ?? 0) > 0
}

export interface ResultadoPassagem {
  modo: ConfigOperador['modo']
  posts: number
  envios: number
  comentarios: number
  erros: string[]
}

export async function passagemOperador(db: SupabaseClient): Promise<ResultadoPassagem> {
  const cfg = await lerConfigOperador(db)
  const r: ResultadoPassagem = { modo: cfg.modo, posts: 0, envios: 0, comentarios: 0, erros: [] }
  if (cfg.modo === 'desligado') return r
  const feito = cfg.modo === 'ligado'
  const modo = feito ? 'feito' : 'ensaio'

  // ── Posts em rascunho do @morethanmoney.pt ──
  if (cfg.posts) {
    const { data: desf } = await db
      .from('operador_registo')
      .select('alvo_id')
      .eq('area', 'posts')
      .not('desfeito_em', 'is', null)
    const desfeitos = new Set((desf ?? []).map((d) => String(d.alvo_id)))
    const { data: posts, error } = await db
      .from('social_scheduled_posts')
      .select('id, ig_account_id, status, caption, media_urls, scheduled_at, updated_at, created_at, media_type')
      .eq('status', 'draft')
      .eq('ig_account_id', CONTA_MARCA)
      .order('scheduled_at', { ascending: true })
      .limit(30)
    if (error) r.erros.push(`posts: ${error.message}`)
    for (const p of (posts ?? []) as Array<PostRascunho & { media_type: string }>) {
      if (r.posts >= TECTO_POSTS) break
      const d = decidirPost(p, desfeitos)
      if (d.acao !== 'aprovar') continue
      if (!feito && (await jaEnsaiadoHoje(db, p.id, 'aprovar'))) continue
      const resumo = `Aprovar ${p.media_type.toLowerCase()} @morethanmoney.pt: «${curto(p.caption)}»`
      if (feito) {
        const agora = new Date().toISOString()
        const { data: mudou } = await db
          .from('social_scheduled_posts')
          .update({
            status: 'approved',
            approved_by: AGENTE_OPERADOR,
            approved_at: agora,
            updated_at: agora,
            error: null,
            ...(d.novoHorario ? { scheduled_at: d.novoHorario } : {}),
          })
          .eq('id', p.id)
          .eq('status', 'draft')
          .select('id')
        if (!mudou?.length) continue
      }
      await registar(db, {
        area: 'posts',
        alvo_tabela: 'social_scheduled_posts',
        alvo_id: p.id,
        acao: 'aprovar',
        resumo,
        motivo: d.motivo,
        modo,
        antes: { status: 'draft', scheduled_at: p.scheduled_at },
      })
      r.posts++
    }
  }

  // ── Envios por aprovar (Telegram, email) ──
  if (cfg.envios) {
    const { data: envios, error } = await db
      .from('aios_tasks')
      .select('id, kind, status, created_at, payload, title')
      .like('kind', 'envio:%')
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
      .limit(50)
    if (error) r.erros.push(`envios: ${error.message}`)
    for (const e of (envios ?? []) as Array<EnvioPendente & { title: string | null }>) {
      if (r.envios >= TECTO_ENVIOS) break
      const d = decidirEnvio(e)
      if (d.acao === 'deixar') continue
      if (!feito && (await jaEnsaiadoHoje(db, e.id, d.acao))) continue
      if (feito) {
        const res = d.acao === 'aprovar' ? await aprovarEnvio(e.id, AGENTE_OPERADOR) : await rejeitarEnvio(e.id, AGENTE_OPERADOR, d.motivo)
        if (!res.ok) {
          r.erros.push(`envio ${e.id}: ${res.erro ?? res.estado}`)
          continue
        }
      }
      await registar(db, {
        area: 'envios',
        alvo_tabela: 'aios_tasks',
        alvo_id: e.id,
        acao: d.acao,
        resumo: `${d.acao === 'aprovar' ? 'Enviar' : 'Rejeitar'}: ${curto(e.title ?? e.kind)}`,
        motivo: d.motivo,
        modo,
        antes: { status: 'pendente' },
      })
      r.envios++
    }
  }

  // ── Fila de comentários: tirar os velhos ──
  if (cfg.comentarios) {
    const { data: itens, error } = await db
      .from('ig_fila_comentarios')
      .select('id, estado, criado_em, comentario, hashtag, prospeto_id')
      .in('estado', ['pronto', 'aberto'])
      .order('criado_em', { ascending: true })
      .limit(200)
    if (error) r.erros.push(`comentarios: ${error.message}`)
    let ensaiados = 0
    for (const i of (itens ?? []) as Array<ItemFila & { comentario: string; hashtag: string | null; prospeto_id: string | null }>) {
      if (r.comentarios >= TECTO_COMENTARIOS) break
      const d = decidirComentario(i)
      if (d.acao !== 'saltar') continue
      if (feito) {
        await marcarSaltado(db, i.id)
        await registar(db, {
          area: 'comentarios',
          alvo_tabela: 'ig_fila_comentarios',
          alvo_id: i.id,
          acao: 'saltar',
          resumo: `Tirar da fila${i.hashtag ? ` (#${i.hashtag})` : ''}: «${curto(i.comentario, 70)}»`,
          motivo: d.motivo,
          modo,
          antes: { estado: i.estado, prospeto_id: i.prospeto_id },
        })
      } else {
        ensaiados++
      }
      r.comentarios++
    }
    // Em ensaio, centenas de linhas iguais não se auditam: fica uma, com o total.
    if (!feito && ensaiados > 0 && !(await jaEnsaiadoHoje(db, 'fila-velhos', 'saltar'))) {
      await registar(db, {
        area: 'comentarios',
        alvo_tabela: 'ig_fila_comentarios',
        alvo_id: 'fila-velhos',
        acao: 'saltar',
        resumo: `Tirar ${ensaiados} comentários velhos da fila`,
        motivo: decidirComentario({ id: '', estado: 'pronto', criado_em: '2000-01-01' }).motivo,
        modo,
      })
    }
  }

  return r
}

/**
 * O agente do Mac (Chrome, sessão do @morethanmoney.pt) publicou ou saltou um comentário da fila.
 * Grava como o «Publiquei» do painel e deixa a linha no registo.
 */
export async function registarDoMac(db: SupabaseClient, id: string, acao: 'publicado' | 'saltado', nota?: string) {
  const { data: item } = await db.from('ig_fila_comentarios').select('estado, comentario, hashtag').eq('id', id).maybeSingle()
  if (!item) throw new Error('Comentário desconhecido')
  if (acao === 'publicado') await marcarPublicado(db, id)
  else await marcarSaltado(db, id)
  await registar(db, {
    agente: 'Mac · @morethanmoney.pt',
    area: 'comentarios',
    alvo_tabela: 'ig_fila_comentarios',
    alvo_id: id,
    acao,
    resumo: `${acao === 'publicado' ? 'Comentou' : 'Saltou'}${item.hashtag ? ` (#${item.hashtag})` : ''}: «${curto(item.comentario as string, 90)}»`,
    motivo: nota ?? null,
    modo: 'feito',
  })
}

/** Desfazer uma linha do registo. Só o que ainda se pode desfazer: um envio que saiu, saiu. */
export async function desfazer(db: SupabaseClient, registoId: string, quem: string): Promise<{ ok: boolean; erro?: string }> {
  const { data: l } = await db.from('operador_registo').select('*').eq('id', registoId).maybeSingle()
  if (!l) return { ok: false, erro: 'linha desconhecida' }
  if (l.desfeito_em) return { ok: false, erro: 'já desfeito' }
  if (l.modo !== 'feito') return { ok: false, erro: 'em ensaio nada mudou; não há o que desfazer' }
  const antes = (l.antes ?? {}) as { scheduled_at?: string | null; estado?: string; prospeto_id?: string | null }

  if (l.area === 'posts' && l.acao === 'aprovar') {
    const { data } = await db
      .from('social_scheduled_posts')
      .update({ status: 'draft', approved_by: null, approved_at: null, scheduled_at: antes.scheduled_at ?? null, updated_at: new Date().toISOString() })
      .eq('id', l.alvo_id)
      .eq('status', 'approved')
      .select('id')
    if (!data?.length) return { ok: false, erro: 'já não está aprovado (publicado ou a publicar)' }
  } else if (l.area === 'comentarios' && l.acao === 'saltar') {
    await db.from('ig_fila_comentarios').update({ estado: antes.estado ?? 'pronto', saltado_em: null }).eq('id', l.alvo_id).eq('estado', 'saltado')
    if (antes.prospeto_id) await db.from('ig_radar_prospetos').update({ estado: 'na_fila' }).eq('id', antes.prospeto_id)
  } else {
    return { ok: false, erro: l.area === 'envios' ? 'a mensagem já saiu; não se desfaz' : 'isto não se desfaz daqui' }
  }

  await db.from('operador_registo').update({ desfeito_em: new Date().toISOString(), desfeito_por: quem }).eq('id', registoId)
  return { ok: true }
}

/** O registo para o painel: as últimas linhas e as contas de hoje. */
export async function lerRegisto(db: SupabaseClient, limite = 60) {
  const { data } = await db.from('operador_registo').select('*').order('criado_em', { ascending: false }).limit(limite)
  return { config: await lerConfigOperador(db), linhas: data ?? [] }
}
