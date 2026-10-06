/**
 * RECOLHA DE PROSPECTOS B2B de fontes PÚBLICAS — a página de contacto do site da própria empresa.
 *
 *  · respeita o robots.txt (User-agent `MTM-B2B-Recolha` e `*`); sem robots legível → não recolhe;
 *  · ritmo lento: no máximo 1 pedido por anfitrião a cada `RITMO_MS`, e só a página indicada (sem
 *    seguir links, sem varrer o site);
 *  · nada de LinkedIn (os termos proíbem) nem redes sociais;
 *  · guarda SEMPRE a URL de origem; só aceita emails do domínio do próprio site e que passem o
 *    validador (genéricos, ou comerciais publicados).
 *
 * `robotsPermite` e `extrairEmails` são puros (a guarda prende-os); `recolherDaPagina` faz a rede.
 */
import { dominioDe, eGenerico, validarProspecto } from './validador'
import type { Pais, Segmento } from './sequencias'

export const USER_AGENT = 'MTM-B2B-Recolha/1.0 (+https://www.morethanmoney.pt)'
export const RITMO_MS = 10_000
const PROIBIDOS = /(^|\.)(linkedin\.com|lnkd\.in|facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com)$/i

/** robots.txt → este caminho pode ser lido por nós? Puro. Regra mais longa vence; Allow ganha empates. */
export function robotsPermite(robots: string, caminho: string, ua = 'MTM-B2B-Recolha'): boolean {
  const grupos: Array<{ agentes: string[]; regras: Array<{ allow: boolean; p: string }> }> = []
  let atual: (typeof grupos)[number] | null = null
  let ultimoFoiAgente = false
  for (const bruta of String(robots ?? '').split(/\r?\n/)) {
    const linha = bruta.replace(/#.*/, '').trim()
    if (!linha) continue
    const m = linha.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const campo = m[1].toLowerCase()
    const valor = m[2].trim()
    if (campo === 'user-agent') {
      if (!atual || !ultimoFoiAgente) { atual = { agentes: [], regras: [] }; grupos.push(atual) }
      atual.agentes.push(valor.toLowerCase())
      ultimoFoiAgente = true
    } else if (campo === 'allow' || campo === 'disallow') {
      ultimoFoiAgente = false
      if (atual) atual.regras.push({ allow: campo === 'allow', p: valor })
    } else {
      ultimoFoiAgente = false
    }
  }
  const nosso = grupos.filter((g) => g.agentes.some((a) => a !== '*' && ua.toLowerCase().includes(a)))
  const aplica = nosso.length ? nosso : grupos.filter((g) => g.agentes.includes('*'))
  let melhor: { allow: boolean; len: number } | null = null
  for (const g of aplica) {
    for (const r of g.regras) {
      if (!r.p) continue // «Disallow:» vazio = tudo permitido
      const re = new RegExp('^' + r.p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'))
      if (re.test(caminho)) {
        if (!melhor || r.p.length > melhor.len || (r.p.length === melhor.len && r.allow)) melhor = { allow: r.allow, len: r.p.length }
      }
    }
  }
  return melhor ? melhor.allow : true
}

/** Emails escritos na página (texto e mailto:), só do domínio do próprio site. Puro. */
export function extrairEmails(html: string, hostDoSite: string): string[] {
  const limpo = String(html ?? '')
    .replace(/&#64;|&#x40;|\s\[at\]\s|\s\(at\)\s/gi, '@')
    .replace(/&#46;|\s\[dot\]\s|\s\(dot\)\s/gi, '.')
  const achados = limpo.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) ?? []
  const base = hostDoSite.toLowerCase().replace(/^www\./, '')
  const out = new Set<string>()
  for (const a of achados) {
    const e = a.toLowerCase()
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(e)) continue // «logo@2x.png» não é email
    const d = dominioDe(e)
    if (d === base || d.endsWith('.' + base) || base.endsWith('.' + d)) out.add(e)
  }
  return [...out]
}

const ultimoPedido = new Map<string, number>()
async function aoRitmo(host: string) {
  const falta = (ultimoPedido.get(host) ?? 0) + RITMO_MS - Date.now()
  if (falta > 0) await new Promise((r) => setTimeout(r, falta))
  ultimoPedido.set(host, Date.now())
}

export interface PedidoRecolha {
  url: string
  empresa: string
  segmento: Segmento
  pais: Pais
  /** Quem pede confirma que é uma empresa (viu NIF/CNPJ ou denominação). Sem isto fica por confirmar. */
  pessoaColectiva?: boolean
  identificacao?: string | null
  /** Endereços nominais que a página diz serem o contacto comercial — só estes passam como tal. */
  comerciaisPublicados?: string[]
}

export interface ResultadoRecolha {
  ok: boolean
  motivo?: string
  aceites: Array<{ email: string; tipo: 'generico' | 'comercial_publicado' }>
  recusados: Array<{ email: string; motivo: string }>
}

export async function recolherDaPagina(p: PedidoRecolha): Promise<ResultadoRecolha> {
  const vazio = (motivo: string): ResultadoRecolha => ({ ok: false, motivo, aceites: [], recusados: [] })
  let u: URL
  try { u = new URL(p.url) } catch { return vazio('URL inválida') }
  if (!/^https?:$/.test(u.protocol)) return vazio('Só http(s).')
  if (PROIBIDOS.test(u.hostname)) return vazio('Redes sociais/LinkedIn: não se recolhe daí.')

  await aoRitmo(u.host)
  let robots = ''
  try {
    const r = await fetch(`${u.origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) })
    if (r.status >= 500) return vazio(`robots.txt deu ${r.status} — na dúvida, não se recolhe.`)
    robots = r.ok ? await r.text() : '' // 4xx = sem robots = permitido (norma RFC 9309)
  } catch {
    return vazio('robots.txt ilegível — não se recolhe.')
  }
  if (!robotsPermite(robots, u.pathname + u.search)) return vazio('O robots.txt não deixa ler esta página.')

  await aoRitmo(u.host)
  let html = ''
  try {
    const r = await fetch(u.toString(), { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return vazio(`A página deu ${r.status}.`)
    html = (await r.text()).slice(0, 2_000_000)
  } catch (e) {
    return vazio(e instanceof Error ? e.message : 'erro a ler a página')
  }

  const comerciais = new Set((p.comerciaisPublicados ?? []).map((x) => x.trim().toLowerCase()))
  const res: ResultadoRecolha = { ok: true, aceites: [], recusados: [] }
  for (const email of extrairEmails(html, u.hostname)) {
    const tipo = eGenerico(email) ? 'generico' : comerciais.has(email) ? 'comercial_publicado' : null
    if (!tipo) { res.recusados.push({ email, motivo: 'Endereço nominal sem indicação de contacto comercial.' }); continue }
    // A pessoa colectiva pode estar por confirmar: valida-se o resto como se estivesse, e guarda-se a flag real.
    const v = validarProspecto({ email, emailTipo: tipo, fonteUrl: u.toString(), pessoaColectiva: true })
    if (!v.ok) { res.recusados.push({ email, motivo: v.motivo }); continue }
    res.aceites.push({ email, tipo })
  }
  return res
}
