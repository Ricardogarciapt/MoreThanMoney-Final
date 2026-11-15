/**
 * APOLLO.IO — o cliente da casa (15/11/2026).
 *
 * A chave é a «master key» MTM e vive SÓ no ambiente: `APOLLO_API_KEY` (Vercel do site, Vercel da
 * Liliana, .env do Mac). Nunca no código, nunca em commits, nunca na memória do projecto.
 *
 * O que usamos, e porquê só isto:
 *   · `procurarEmpresas` — POST /mixed_companies/search. Dá EMPRESAS (nome, domínio, sector, país).
 *     É a parte que o motor B2B não tinha: descobrir quem existe. O email continua a vir da página
 *     de contacto pública da própria empresa (lib/b2b/recolha.ts), que é a prova que a lei pede.
 *   · `enriquecerEmpresa` — GET /organizations/enrich?domain=. Completa uma empresa que já temos.
 *   · `procurarPessoas` — POST /mixed_people/api_search. Devolve cargos e nomes SEM email (não gasta
 *     créditos de revelação). Serve para o perfil do lead no CRM, nunca para envio automático: um
 *     email nominal é dado pessoal e o validador B2B recusa-o sem prova de publicação.
 *
 * Sem chave → `{ ok:false, motivo }` e o resto do sistema segue como estava.
 */

const BASE = 'https://api.apollo.io/api/v1'

export type ResultadoApollo<T> = { ok: true; dados: T; creditos?: unknown } | { ok: false; motivo: string; estado?: number }

export interface EmpresaApollo {
  id: string
  nome: string
  site: string | null
  dominio: string | null
  linkedin: string | null
  sector: string | null
  funcionarios: number | null
  cidade: string | null
  pais: string | null
  palavras: string[]
}

export interface PessoaApollo {
  id: string
  nome: string
  cargo: string | null
  empresa: string | null
  dominio: string | null
  linkedin: string | null
  /** A Apollo diz se TEM email, sem o mostrar. */
  temEmail: boolean
}

export function apolloConfigurada(): boolean {
  return !!process.env.APOLLO_API_KEY?.trim()
}

async function pedir<T>(caminho: string, init: { method: 'GET' | 'POST'; corpo?: unknown }): Promise<ResultadoApollo<T>> {
  const chave = process.env.APOLLO_API_KEY?.trim()
  if (!chave) return { ok: false, motivo: 'APOLLO_API_KEY não está definida neste ambiente.' }
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': chave },
      body: init.corpo ? JSON.stringify(init.corpo) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const texto = await r.text()
    if (!r.ok) return { ok: false, estado: r.status, motivo: `Apollo ${r.status}: ${texto.slice(0, 200)}` }
    return { ok: true, dados: JSON.parse(texto) as T }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'erro a falar com a Apollo' }
  }
}

/** Puro: limpa o domínio («https://www.ex.pt/» → «ex.pt»). */
export function limparDominio(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return null
  const d = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null
}

/** Puro: uma organização crua da Apollo → a nossa forma. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function paraEmpresa(o: any): EmpresaApollo | null {
  if (!o || !o.id || !o.name) return null
  const dominio = limparDominio(o.primary_domain ?? o.website_url)
  return {
    id: String(o.id),
    nome: String(o.name).trim(),
    site: o.website_url ? String(o.website_url) : dominio ? `https://${dominio}` : null,
    dominio,
    linkedin: o.linkedin_url ? String(o.linkedin_url) : null,
    sector: o.industry ? String(o.industry) : null,
    funcionarios: Number.isFinite(Number(o.estimated_num_employees)) ? Number(o.estimated_num_employees) : null,
    cidade: o.city ? String(o.city) : null,
    pais: o.country ? String(o.country) : null,
    palavras: Array.isArray(o.keywords) ? o.keywords.slice(0, 12).map(String) : [],
  }
}

export interface FiltroEmpresas {
  palavras?: string[]
  locais?: string[]
  /** ex. ['1,10','11,50'] */
  funcionarios?: string[]
  pagina?: number
  porPagina?: number
}

export async function procurarEmpresas(f: FiltroEmpresas): Promise<ResultadoApollo<EmpresaApollo[]>> {
  const corpo: Record<string, unknown> = {
    page: Math.max(1, f.pagina ?? 1),
    per_page: Math.max(1, Math.min(25, f.porPagina ?? 10)),
  }
  if (f.palavras?.length) corpo.q_organization_keyword_tags = f.palavras
  if (f.locais?.length) corpo.organization_locations = f.locais
  if (f.funcionarios?.length) corpo.organization_num_employees_ranges = f.funcionarios
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await pedir<any>('/mixed_companies/search', { method: 'POST', corpo })
  if (!r.ok) return r
  const cruas = [...(r.dados?.organizations ?? []), ...(r.dados?.accounts ?? [])]
  const vistos = new Set<string>()
  const dados = cruas.map(paraEmpresa).filter((e): e is EmpresaApollo => {
    if (!e || vistos.has(e.dominio ?? e.id)) return false
    vistos.add(e.dominio ?? e.id)
    return true
  })
  return { ok: true, dados }
}

export async function enriquecerEmpresa(dominio: string): Promise<ResultadoApollo<EmpresaApollo | null>> {
  const d = limparDominio(dominio)
  if (!d) return { ok: false, motivo: 'domínio inválido' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await pedir<any>(`/organizations/enrich?domain=${encodeURIComponent(d)}`, { method: 'GET' })
  if (!r.ok) return r
  return { ok: true, dados: paraEmpresa(r.dados?.organization) }
}

export async function procurarPessoas(f: { dominios?: string[]; cargos?: string[]; locais?: string[]; porPagina?: number }): Promise<ResultadoApollo<PessoaApollo[]>> {
  const corpo: Record<string, unknown> = { page: 1, per_page: Math.max(1, Math.min(25, f.porPagina ?? 10)) }
  if (f.dominios?.length) corpo.q_organization_domains_list = f.dominios
  if (f.cargos?.length) corpo.person_titles = f.cargos
  if (f.locais?.length) corpo.person_locations = f.locais
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await pedir<any>('/mixed_people/api_search', { method: 'POST', corpo })
  if (!r.ok) return r
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dados = ((r.dados?.people ?? []) as any[]).map((p) => ({
    id: String(p.id),
    nome: [p.first_name, p.last_name_obfuscated ?? p.last_name].filter(Boolean).join(' ') || String(p.name ?? ''),
    cargo: p.title ? String(p.title) : null,
    empresa: p.organization?.name ? String(p.organization.name) : null,
    dominio: limparDominio(p.organization?.primary_domain ?? p.organization?.website_url),
    linkedin: p.linkedin_url ? String(p.linkedin_url) : null,
    temEmail: p.has_email === true,
  }))
  return { ok: true, dados }
}
