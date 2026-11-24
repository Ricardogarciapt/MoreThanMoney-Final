/**
 * «A Primeira Chave · Programa Completo» (Ruben Pereira) — a sala do curso.
 *
 * Um só produto do marketplace (`bootcamp-a-primeira-chave`) abre as QUATRO línguas: quem comprou
 * vê PT, EN, ES e FR. O material (slides, caderno e guia) vive em `conteudo-privado/cursos/`, fora
 * de `public/`, e só sai por `/api/cursos/a-primeira-chave/material`, que decide no servidor.
 */
import { temAcessoAoProduto } from '@/lib/marketplace/regras'
import { comprasDoMembro } from '@/lib/marketplace/servidor'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import INDICE from './primeira-chave-indice.json'

export const PRODUTO_SLUG = 'bootcamp-a-primeira-chave'
export const LINGUAS = ['pt', 'en', 'es', 'fr'] as const
export type Lingua = (typeof LINGUAS)[number]
export const NUM_MODULOS = 15

export type IndiceLingua = { curso: string; modulos: string[]; aulas: string[] }
export const indice = INDICE as Record<Lingua, IndiceLingua>

/** Peça pedida: `guia`, `slides-<n>` ou `caderno-<n>` (n de 1 a 15). Devolve o caminho relativo ou null. */
export function ficheiroDaPeca(lingua: string, peca: string): string | null {
  if (!(LINGUAS as readonly string[]).includes(lingua)) return null
  if (peca === 'guia') return `${lingua}/guia.pdf`
  const m = /^(slides|caderno)-(\d{1,2})$/.exec(peca)
  if (!m) return null
  const n = Number(m[2])
  if (n < 1 || n > NUM_MODULOS) return null
  return `${lingua}/${m[1]}/modulo-${n}.pdf`
}

/** Esta sessão abre o curso? (comprou o produto e não foi reembolsada, ou é admin) */
export async function podeAbrirCurso(req?: Request): Promise<boolean> {
  const sessao = await sessaoDoMembro(req)
  if (!sessao) return false
  const { data: produto } = await getSupabaseAdmin().from('marketplace_produtos').select('id').eq('slug', PRODUTO_SLUG).maybeSingle()
  if (!produto) return false
  const compras = await comprasDoMembro(sessao.userId)
  return temAcessoAoProduto(compras, produto.id as string, new Date().toISOString(), sessao.perfil)
}

/**
 * Links do Skool. Quem compra o curso no Skool (310 $) paga lá e o site não vê a compra, por isso
 * a sessão do site não lhe abre o material. As aulas do Skool levam então links ASSINADOS: cada um
 * abre só aquela peça, naquela língua, e a assinatura vem de um segredo do servidor (nunca sai daqui).
 * O Skool já fecha as aulas a quem não comprou; quem tiver o link abre aquele PDF e mais nada.
 * Os links obtêm-se em /api/admin/cursos/a-primeira-chave/links-skool (só admin).
 */
function segredoDosLinks(): string {
  const base = process.env.CURSO_LINKS_SEGREDO || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!base) throw new Error('sem segredo para assinar links')
  return `skool-material:${base}`
}

export async function assinaturaDaPeca(lingua: string, peca: string): Promise<string> {
  const { createHmac } = await import('node:crypto')
  return createHmac('sha256', segredoDosLinks()).update(`${lingua}:${peca}`).digest('base64url').slice(0, 22)
}

export async function assinaturaValida(lingua: string, peca: string, k: string | null): Promise<boolean> {
  if (!k) return false
  const { timingSafeEqual } = await import('node:crypto')
  const certo = Buffer.from(await assinaturaDaPeca(lingua, peca))
  const dado = Buffer.from(k)
  return certo.length === dado.length && timingSafeEqual(certo, dado)
}
