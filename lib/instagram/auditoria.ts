/**
 * AUDITORIA DAS PUBLICAÇÕES do @morethanmoney.pt (pedido do Ricardo, 17/11/2026).
 *
 * Lê do Instagram todas as publicações com as métricas e decide quais ficam (no máximo 50 no
 * perfil) e quais arquivar, das mais antigas para as mais recentes. O resultado fica em
 * `site_settings.ig_auditoria_mtm` para o painel e para o relatório.
 *
 * Regra:
 *   · nota = (comentários×6 + partilhas×5 + guardados×4 + gostos) ÷ alcance × 100 (a mesma dos
 *     reels automáticos: o comentário é o que abre o funil);
 *   · ficam as do visual atual (motores de hoje: carrossel diário, linhas, reels automáticos)
 *     e, até 50, as melhores notas das restantes;
 *   · as outras vão para a lista de arquivar, a mais antiga primeiro.
 *
 * A API do Instagram não arquiva nem esconde publicações: a lista é para o dono arquivar na app
 * (Arquivar não apaga, volta-se atrás quando se quiser). Nada aqui apaga nada.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { tokenForAccount } from './publish'

const GRAPH = 'https://graph.facebook.com/v21.0'
const IG_MTM = '17841474872672009'
export const CHAVE_AUDITORIA = 'ig_auditoria_mtm'
const MANTER = 50

export interface Publicacao {
  id: string
  data: string
  tipo: string
  link: string
  texto: string
  gostos: number
  comentarios: number
  alcance: number
  vistas: number
  guardados: number
  partilhas: number
  nota: number
  visualAtual: boolean
}

async function g(caminho: string, token: string): Promise<any> {
  const url = caminho.startsWith('http') ? caminho : `${GRAPH}/${caminho}`
  const sep = url.includes('?') ? '&' : '?'
  try {
    const r = await fetch(`${url}${url.includes('access_token=') ? '' : `${sep}access_token=${encodeURIComponent(token)}`}`, { cache: 'no-store' })
    return await r.json()
  } catch {
    return {}
  }
}

async function todas(token: string, max = 600): Promise<any[]> {
  const out: any[] = []
  let url: string | undefined = `${IG_MTM}/media?fields=id,caption,media_type,media_product_type,timestamp,comments_count,like_count,permalink&limit=50`
  for (let i = 0; url && i < 20 && out.length < max; i++) {
    const j = await g(url, token)
    out.push(...(j?.data ?? []))
    url = j?.paging?.next
  }
  return out
}

async function metricas(m: any, token: string): Promise<Record<string, number>> {
  const j = await g(`${m.id}/insights?metric=reach,saved,shares,views`, token)
  const out: Record<string, number> = {}
  for (const x of j?.data ?? []) out[x.name] = Number(x.values?.[0]?.value ?? x.total_value?.value) || 0
  return out
}

export async function auditarInstagram(): Promise<{ total: number; manter: number; arquivar: number; erro?: string }> {
  const token = await tokenForAccount(IG_MTM)
  if (!token) return { total: 0, manter: 0, arquivar: 0, erro: 'sem token da conta' }
  const db = getSupabaseAdmin()
  const media = await todas(token)
  if (!media.length) return { total: 0, manter: 0, arquivar: 0, erro: 'o Instagram não devolveu publicações' }

  // O que saiu dos motores de hoje é o «visual atual».
  const { data: nossos } = await db.from('social_scheduled_posts').select('published_media_id, created_by')
    .eq('ig_account_id', IG_MTM).not('published_media_id', 'is', null)
    .or('created_by.like.carrossel-diario:%,created_by.eq.reels-auto')
    .limit(2000)
  const atuais = new Set((nossos ?? []).map((r) => String(r.published_media_id)))

  const pubs: Publicacao[] = []
  for (let i = 0; i < media.length; i += 10) {
    const lote = media.slice(i, i + 10)
    const ms = await Promise.all(lote.map((m) => metricas(m, token)))
    lote.forEach((m, k) => {
      const x = ms[k]
      const gostos = Number(m.like_count) || 0
      const comentarios = Number(m.comments_count) || 0
      const alcance = x.reach || 0
      const nota = ((comentarios * 6 + (x.shares || 0) * 5 + (x.saved || 0) * 4 + gostos) / Math.max(50, alcance || x.views || 0)) * 100
      pubs.push({
        id: String(m.id), data: String(m.timestamp ?? ''), tipo: String(m.media_product_type === 'REELS' ? 'REELS' : m.media_type ?? ''),
        link: String(m.permalink ?? ''), texto: String(m.caption ?? '').replace(/\s+/g, ' ').slice(0, 90),
        gostos, comentarios, alcance, vistas: x.views || 0, guardados: x.saved || 0, partilhas: x.shares || 0,
        nota: Number(nota.toFixed(2)), visualAtual: atuais.has(String(m.id)),
      })
    })
  }

  const fica = new Set<string>()
  for (const p of [...pubs].filter((p) => p.visualAtual).sort((a, b) => b.data.localeCompare(a.data))) if (fica.size < MANTER) fica.add(p.id)
  for (const p of [...pubs].filter((p) => !p.visualAtual).sort((a, b) => b.nota - a.nota)) if (fica.size < MANTER) fica.add(p.id)
  const manter = pubs.filter((p) => fica.has(p.id)).sort((a, b) => b.data.localeCompare(a.data))
  const arquivar = pubs.filter((p) => !fica.has(p.id)).sort((a, b) => a.data.localeCompare(b.data))

  const notas = pubs.map((p) => p.nota).sort((a, b) => a - b)
  const resumo = {
    em: new Date().toISOString(),
    total: pubs.length,
    mediana_nota: notas.length ? notas[Math.floor(notas.length / 2)] : 0,
    por_tipo: pubs.reduce<Record<string, { n: number; nota_media: number }>>((acc, p) => {
      const t = (acc[p.tipo] ??= { n: 0, nota_media: 0 })
      t.nota_media = (t.nota_media * t.n + p.nota) / (t.n + 1)
      t.n++
      return acc
    }, {}),
    manter,
    arquivar,
  }
  await db.from('site_settings').upsert({ key: CHAVE_AUDITORIA, value: resumo }, { onConflict: 'key' })
  return { total: pubs.length, manter: manter.length, arquivar: arquivar.length }
}
