/**
 * A APOLLO COMO FONTE DO MOTOR B2B (15/11/2026).
 *
 * A Apollo descobre EMPRESAS; o email continua a sair da página de contacto PÚBLICA da própria
 * empresa, pelo mesmo caminho de sempre (`recolherDaPagina`: robots.txt, ritmo lento, só caixas
 * genéricas do domínio). Assim nada do que a lei e a guarda exigem muda:
 *   · a `fonte_url` é a página da empresa, nunca a Apollo;
 *   · `pessoa_colectiva` só fica true se quem pede o confirmar (a Apollo não é prova de NIF/CNPJ);
 *   · emails nominais da Apollo NÃO entram em `b2b_prospectos` — a Apollo só dá nomes e cargos
 *     para o perfil, e quem fala com essas pessoas é um humano.
 *
 * `filtrosDoSegmento` e `paginasDeContacto` são puros (a guarda está em `apollo.check.ts`).
 */
import { procurarEmpresas, type EmpresaApollo } from '@/lib/apollo/cliente'
import { recolherDaPagina } from './recolha'
import { AGENTE_B2B, type Pais, type Segmento } from './sequencias'

type Supa = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** As palavras com que a Apollo procura cada segmento. Os locais vêm do país. */
const PALAVRAS: Record<Segmento, string[]> = {
  ib_afiliado: ['forex', 'introducing broker', 'trading education', 'affiliate marketing'],
  comunidade: ['trading community', 'investing community', 'personal finance'],
  criador: ['finance content creator', 'youtube finance', 'personal finance media'],
  escola: ['trading school', 'financial education', 'investment courses'],
  prop_firm: ['prop trading', 'proprietary trading', 'funded trader'],
}

export function filtrosDoSegmento(segmento: Segmento, pais: Pais, extra: string[] = []) {
  const palavras = [...PALAVRAS[segmento], ...extra.map((x) => x.trim()).filter(Boolean)].slice(0, 8)
  return { palavras, locais: [pais === 'BR' ? 'Brazil' : 'Portugal'] }
}

/** As páginas onde uma empresa costuma pôr o contacto, por ordem. Só 2: o ritmo é de 10 s por pedido. */
export function paginasDeContacto(site: string, pais: Pais): string[] {
  let origem: string
  try { origem = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`).origin } catch { return [] }
  return [`${origem}${pais === 'BR' ? '/contato' : '/contactos'}`, `${origem}/`]
}

export interface ResultadoImportacao {
  ok: boolean
  motivo?: string
  empresasVistas: number
  gravados: number
  jaConhecidas: string[]
  semEmail: Array<{ empresa: string; site: string | null; motivo: string }>
  aceites: Array<{ empresa: string; email: string; fonte: string }>
}

/**
 * Procura empresas na Apollo e tenta a página de contacto de cada uma. `limite` é pequeno de
 * propósito: cada empresa custa ~20 s (robots + página ao ritmo de 10 s) e créditos Apollo.
 */
export async function importarDaApollo(
  db: Supa,
  p: { segmento: Segmento; pais: Pais; limite?: number; pagina?: number; palavras?: string[]; pessoaColectiva?: boolean },
): Promise<ResultadoImportacao> {
  const res: ResultadoImportacao = { ok: true, empresasVistas: 0, gravados: 0, jaConhecidas: [], semEmail: [], aceites: [] }
  const f = filtrosDoSegmento(p.segmento, p.pais, p.palavras)
  const limite = Math.max(1, Math.min(10, p.limite ?? 5))
  const r = await procurarEmpresas({ ...f, pagina: p.pagina, porPagina: Math.min(25, limite * 2) })
  if (!r.ok) return { ...res, ok: false, motivo: r.motivo }

  const comSite = r.dados.filter((e) => e.dominio)
  const { data: conhecidas } = await db.from('b2b_prospectos').select('site')
  const dominiosConhecidos = new Set(
    ((conhecidas ?? []) as Array<{ site: string | null }>).map((x) => String(x.site ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')),
  )

  const agora = new Date().toISOString()
  for (const e of comSite) {
    if (res.empresasVistas >= limite) break
    if (dominiosConhecidos.has(e.dominio!)) { res.jaConhecidas.push(e.nome); continue }
    res.empresasVistas++
    const achou = await tentarEmpresa(e, p)
    if (!achou.ok) { res.semEmail.push({ empresa: e.nome, site: e.site, motivo: achou.motivo }); continue }
    const linhas = achou.aceites.map((a) => ({
      empresa: e.nome, site: `https://${e.dominio}`, segmento: p.segmento, pais: p.pais,
      email: a.email, email_tipo: a.tipo, fonte_url: achou.url, fonte_verificada_em: agora,
      identificacao: `apollo:${e.id}`, pessoa_colectiva: p.pessoaColectiva === true,
      agente: AGENTE_B2B, nota: `Apollo · ${[e.sector, e.cidade, e.funcionarios ? `${e.funcionarios} func.` : null].filter(Boolean).join(' · ')}`.slice(0, 300),
    }))
    const { data, error } = await db.from('b2b_prospectos').upsert(linhas, { onConflict: 'email', ignoreDuplicates: true }).select('email')
    if (error) return { ...res, ok: false, motivo: error.message }
    res.gravados += ((data ?? []) as unknown[]).length
    for (const a of achou.aceites) res.aceites.push({ empresa: e.nome, email: a.email, fonte: achou.url })
  }
  return res
}

async function tentarEmpresa(
  e: EmpresaApollo,
  p: { segmento: Segmento; pais: Pais; pessoaColectiva?: boolean },
): Promise<{ ok: true; url: string; aceites: Array<{ email: string; tipo: 'generico' | 'comercial_publicado' }> } | { ok: false; motivo: string }> {
  let ultimo = 'sem página de contacto legível'
  for (const url of paginasDeContacto(e.site ?? e.dominio!, p.pais)) {
    const r = await recolherDaPagina({ url, empresa: e.nome, segmento: p.segmento, pais: p.pais, pessoaColectiva: p.pessoaColectiva })
    if (r.ok && r.aceites.length) return { ok: true, url, aceites: r.aceites }
    ultimo = r.motivo ?? (r.recusados.length ? `só emails nominais (${r.recusados.length})` : 'nenhum email genérico na página')
  }
  return { ok: false, motivo: ultimo }
}
