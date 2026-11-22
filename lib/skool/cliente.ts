import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Cliente do Skool — o lado de dentro do conector MCP (`/api/mcp/skool`).
 *
 * O Skool NÃO tem API pública. Tudo aqui fala com o mesmo backend que o site deles usa, com a
 * sessão do dono (os cookies do browser). Duas portas:
 *
 *  · LER: as páginas de www.skool.com trazem os dados completos num `__NEXT_DATA__` embebido no
 *    HTML. Lemos esse JSON em vez do `/_next/data/{buildId}`, porque o buildId muda a cada deploy
 *    deles e um caminho com ele fixo parte sem aviso.
 *  · ESCREVER: `https://api2.skool.com` (posts, comentários, chat), com os mesmos cookies.
 *
 * ── A sessão ────────────────────────────────────────────────────────────────────────────────
 * Cookies `auth_token` (dura meses), `client_id` e `aws-waf-token` (~3,5 dias). Vêm de
 * `integracoes_privadas.skool_sessao` (tabela sem acesso público — site_settings é legível por todos) (renovável pela ferramenta `skool_sessao_guardar`, sem deploy) ou,
 * em falta, da env `SKOOL_COOKIE`. NUNCA em código nem em commits.
 */

const WWW = 'https://www.skool.com'
const API = 'https://api2.skool.com'
const CHAVE_SESSAO = 'skool_sessao'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export interface SessaoSkool {
  cookie: string
  grupo: string
  atualizadaEm?: string
}

let cacheSessao: { s: SessaoSkool; ate: number } | null = null

export async function lerSessao(): Promise<SessaoSkool> {
  if (cacheSessao && cacheSessao.ate > Date.now()) return cacheSessao.s
  let s: SessaoSkool | null = null
  try {
    const { data } = await getSupabaseAdmin().from('integracoes_privadas').select('valor').eq('chave', CHAVE_SESSAO).maybeSingle()
    const v = data?.valor as Partial<SessaoSkool> | undefined
    if (v?.cookie) s = { cookie: v.cookie, grupo: v.grupo || grupoPorOmissao(), atualizadaEm: v.atualizadaEm }
  } catch {
    // Sem Supabase neste ambiente: cai para a env.
  }
  if (!s && process.env.SKOOL_COOKIE?.trim()) s = { cookie: process.env.SKOOL_COOKIE.trim(), grupo: grupoPorOmissao() }
  if (!s) throw new Error('Sessão do Skool em falta: define SKOOL_COOKIE na Vercel ou usa skool_sessao_guardar.')
  cacheSessao = { s, ate: Date.now() + 60_000 }
  return s
}

function grupoPorOmissao(): string {
  return process.env.SKOOL_GRUPO?.trim() || 'morethanmoney-1132'
}

/** Aceita o cabeçalho Cookie inteiro OU só os valores; guarda só os cookies que interessam. */
export function normalizarCookie(bruto: string): string {
  const pares = bruto
    .replace(/^cookie:\s*/i, '')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.includes('='))
  const uteis = pares.filter((p) => /^(auth_token|client_id|aws-waf-token)=/.test(p))
  return (uteis.length ? uteis : pares).join('; ')
}

export async function guardarSessao(cookieBruto: string, grupo?: string): Promise<{ cookies: string[] }> {
  const cookie = normalizarCookie(cookieBruto)
  if (!/auth_token=/.test(cookie)) throw new Error('Falta o cookie auth_token — sem ele o Skool não te reconhece.')
  const atual = await lerSessao().catch(() => null)
  const valor: SessaoSkool = { cookie, grupo: grupo || atual?.grupo || grupoPorOmissao(), atualizadaEm: new Date().toISOString() }
  const { error } = await getSupabaseAdmin()
    .from('integracoes_privadas')
    .upsert({ chave: CHAVE_SESSAO, valor, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' })
  if (error) throw new Error(`Não consegui guardar a sessão: ${error.message}`)
  cacheSessao = null
  return { cookies: cookie.split(';').map((c) => c.split('=')[0].trim()) }
}

function cabecalhos(s: SessaoSkool, extra: Record<string, string> = {}): Record<string, string> {
  return {
    cookie: s.cookie,
    'user-agent': UA,
    'accept-language': 'pt-PT,pt;q=0.9,en;q=0.8',
    origin: WWW,
    referer: `${WWW}/${s.grupo}`,
    ...extra,
  }
}

function explicarFalha(status: number, corpo: string, onde: string): Error {
  const dica =
    status === 401
      ? 'sessão expirada (auth_token): volta a copiar os cookies do browser'
      : status === 403 || status === 405
        ? 'bloqueio da firewall do Skool (aws-waf-token expira a cada ~3,5 dias): renova os cookies'
        : status === 404
          ? 'não existe (caminho, slug ou id errado)'
          : status === 429
            ? 'demasiados pedidos: espera um minuto'
            : 'resposta inesperada'
  return new Error(`Skool ${onde} → HTTP ${status} (${dica}). ${corpo.slice(0, 300)}`)
}

/** Lê o `__NEXT_DATA__.props.pageProps` de qualquer página do Skool. `caminho` começa sem "/". */
export async function lerPagina(caminho: string): Promise<{ pageProps: Record<string, any>; buildId?: string }> {
  const s = await lerSessao()
  const url = `${WWW}/${caminho.replace(/^\/+/, '')}`
  const r = await fetch(url, {
    headers: cabecalhos(s, { accept: 'text/html,application/xhtml+xml' }),
    redirect: 'manual',
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  })
  if (r.status >= 300 && r.status < 400) throw new Error(`Skool redirecionou ${url} para ${r.headers.get('location')} — a sessão provavelmente expirou.`)
  const html = await r.text()
  if (!r.ok) throw explicarFalha(r.status, html, `GET ${url}`)
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error(`Página ${url} sem __NEXT_DATA__ (o Skool mudou o formato ou a firewall devolveu um desafio).`)
  const dados = JSON.parse(m[1])
  return { pageProps: dados?.props?.pageProps ?? {}, buildId: dados?.buildId }
}

/** Chamada crua ao api2.skool.com. */
export async function chamarApi(metodo: string, caminho: string, corpo?: unknown): Promise<unknown> {
  const s = await lerSessao()
  const url = caminho.startsWith('http') ? caminho : `${API}/${caminho.replace(/^\/+/, '')}`
  if (!url.startsWith(API + '/')) throw new Error('Só se fala com api2.skool.com.')
  const r = await fetch(url, {
    method: metodo.toUpperCase(),
    headers: cabecalhos(s, { accept: 'application/json', ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) }),
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  })
  const texto = await r.text()
  if (!r.ok) throw explicarFalha(r.status, texto, `${metodo.toUpperCase()} ${url}`)
  if (!texto) return { ok: true, status: r.status }
  try {
    return JSON.parse(texto)
  } catch {
    return { ok: true, status: r.status, texto: texto.slice(0, 2000) }
  }
}

let cacheGrupo: { slug: string; id: string; ate: number } | null = null

/** O id interno do grupo (necessário nas escritas), lido da página do grupo. */
export async function idDoGrupo(): Promise<string> {
  const s = await lerSessao()
  if (cacheGrupo && cacheGrupo.slug === s.grupo && cacheGrupo.ate > Date.now()) return cacheGrupo.id
  const { pageProps } = await lerPagina(s.grupo)
  const id = pageProps?.currentGroup?.id
  if (!id) throw new Error('Não encontrei o id do grupo na página — confirma o slug da comunidade.')
  cacheGrupo = { slug: s.grupo, id, ate: Date.now() + 10 * 60_000 }
  return id
}

/** Encurta texto longo para as respostas não comerem o contexto do modelo. */
export function curto(t: unknown, max = 400): string {
  const s = typeof t === 'string' ? t : t == null ? '' : JSON.stringify(t)
  return s.length > max ? s.slice(0, max) + '…' : s
}
