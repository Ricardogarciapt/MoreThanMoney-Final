import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto'

/**
 * O LINK «VER CREDENCIAIS» — uso único, 24 horas, só o dono.
 *
 * O email da conta leva login e servidor, nunca a password. Leva este link, que abre as passwords
 * UMA vez dentro da app a quem tiver sessão MTM como dono da conta (migração 084).
 *
 * Token: `v1.<linkId>.<expiraMs>.<nonce>.<assinatura>` — HMAC-SHA256 com `MTMFUNDED_CRED_KEY`.
 * A assinatura e o prazo verificam-se SEM base de dados (um token forjado ou velho nem chega à
 * tabela). Na tabela guarda-se só o sha256 do token inteiro.
 *
 * A ORDEM das verificações é a parte que importa:
 *   1. assinatura → 2. prazo → 3. linha existe e o hash bate → 4. DONO = sessão → 5. ainda por usar
 *   → 6. gastar atomicamente (`usado_em IS NULL` no próprio UPDATE).
 * O dono vem ANTES de gastar: alguém que apanhe o link (email reencaminhado) e o abra com outra
 * conta recebe 404 e o link continua a servir ao verdadeiro dono. E o passo 6 no UPDATE fecha a
 * corrida de dois separadores a abrir o mesmo link ao mesmo tempo — só um ganha.
 *
 * O repositório é uma interface para o teste (lib/mtmfunded/__tests__/credenciais-link.check.ts)
 * correr sem base de dados; `repoSupabase` é o de produção.
 */

export const VALIDADE_LINK_MS = 24 * 3600_000

export type MotivoLink = 'criacao' | 'fase' | 'regeneracao' | 'reenvio' | 'backfill' | 'pedido'

export interface LinhaLink {
  id: string
  account_id: string
  user_id: string
  motivo: MotivoLink
  token_hash: string
  expira_em: string
  usado_em: string | null
}

export interface RepoLinks {
  inserir(l: LinhaLink): Promise<void>
  ler(id: string): Promise<LinhaLink | null>
  /** Marca usado SÓ se ainda não estava e for deste dono. true = foi este pedido que o gastou. */
  gastar(id: string, userId: string, agoraIso: string): Promise<boolean>
}

function segredo(explicito?: string): string {
  const s = explicito ?? process.env.MTMFUNDED_CRED_KEY
  if (!s || s.length < 32) throw new Error('MTMFUNDED_CRED_KEY em falta ou curta')
  return `link-credenciais:${s}`
}

const assinar = (corpo: string, chave?: string) => createHmac('sha256', segredo(chave)).update(corpo).digest('base64url')
export const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex')

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Novo token para uma linha. Puro (menos o acaso) — a linha escreve-se em `emitirLink`. */
export function criarToken(linkId: string, agoraMs: number, chave?: string): { token: string; expiraMs: number } {
  const expiraMs = agoraMs + VALIDADE_LINK_MS
  const corpo = `v1.${linkId}.${expiraMs}.${randomBytes(18).toString('base64url')}`
  return { token: `${corpo}.${assinar(corpo, chave)}`, expiraMs }
}

export type LeituraToken = { ok: true; linkId: string; expiraMs: number } | { ok: false; motivo: 'formato' | 'assinatura' | 'expirado' }

/** Passos 1 e 2 — sem base de dados. */
export function lerToken(token: unknown, agoraMs: number, chave?: string): LeituraToken {
  if (typeof token !== 'string' || token.length > 300) return { ok: false, motivo: 'formato' }
  const partes = token.split('.')
  if (partes.length !== 5 || partes[0] !== 'v1' || !UUID.test(partes[1]) || !/^\d{10,16}$/.test(partes[2])) {
    return { ok: false, motivo: 'formato' }
  }
  if (!igual(partes[4], assinar(partes.slice(0, 4).join('.'), chave))) return { ok: false, motivo: 'assinatura' }
  const expiraMs = Number(partes[2])
  if (!(expiraMs > agoraMs)) return { ok: false, motivo: 'expirado' }
  return { ok: true, linkId: partes[1], expiraMs }
}

export async function emitirLink(
  p: { accountId: string; userId: string; motivo: MotivoLink },
  repo: RepoLinks,
  opts: { agoraMs?: number; chave?: string; id?: string } = {},
): Promise<{ linkId: string; token: string; expiraEm: string }> {
  const agoraMs = opts.agoraMs ?? Date.now()
  const linkId = opts.id ?? randomUUID()
  const { token, expiraMs } = criarToken(linkId, agoraMs, opts.chave)
  const expiraEm = new Date(expiraMs).toISOString()
  await repo.inserir({
    id: linkId, account_id: p.accountId, user_id: p.userId, motivo: p.motivo,
    token_hash: hashDoToken(token), expira_em: expiraEm, usado_em: null,
  })
  return { linkId, token, expiraEm }
}

export type AberturaLink =
  | { ok: true; accountId: string; motivo: MotivoLink }
  | { ok: false; status: 400 | 401 | 404 | 410; erro: string }

/**
 * Passos 1–6. `userId` é o da SESSÃO (nunca do corpo do pedido).
 *
 * Link de outra pessoa e link inexistente dão a MESMA resposta (404): distingui-los dizia a quem
 * apanhou um link que ele é verdadeiro.
 */
export async function abrirLink(
  token: unknown, userId: string | null, repo: RepoLinks,
  opts: { agoraMs?: number; chave?: string } = {},
): Promise<AberturaLink> {
  if (!userId) return { ok: false, status: 401, erro: 'Entra na tua conta MTM para veres as credenciais.' }
  const agoraMs = opts.agoraMs ?? Date.now()
  const t = lerToken(token, agoraMs, opts.chave)
  if (!t.ok) {
    return t.motivo === 'expirado'
      ? { ok: false, status: 410, erro: 'Este link expirou (vale 24 horas). Pede um novo no WebTrader → A minha conta → Credenciais.' }
      : { ok: false, status: 400, erro: 'Link inválido.' }
  }
  const linha = await repo.ler(t.linkId)
  if (!linha || !igual(linha.token_hash, hashDoToken(token as string))) return { ok: false, status: 404, erro: 'Link não encontrado.' }
  if (linha.user_id !== userId) return { ok: false, status: 404, erro: 'Link não encontrado.' }
  if (!(Date.parse(linha.expira_em) > agoraMs)) {
    return { ok: false, status: 410, erro: 'Este link expirou (vale 24 horas). Pede um novo no WebTrader → A minha conta → Credenciais.' }
  }
  if (linha.usado_em) return { ok: false, status: 410, erro: 'Este link já foi usado. Por segurança só abre uma vez — pede um novo na tua área.' }
  const gastou = await repo.gastar(linha.id, userId, new Date(agoraMs).toISOString())
  if (!gastou) return { ok: false, status: 410, erro: 'Este link já foi usado. Por segurança só abre uma vez — pede um novo na tua área.' }
  return { ok: true, accountId: linha.account_id, motivo: linha.motivo }
}

/** O repositório de produção (tabela da 084, service role). */
export function repoSupabase(db: import('@supabase/supabase-js').SupabaseClient): RepoLinks {
  const T = 'mtm_funded_credenciais_links'
  return {
    async inserir(l) {
      const { error } = await db.from(T).insert(l)
      if (error) throw new Error(`link de credenciais não gravou: ${error.message}`)
    },
    async ler(id) {
      const { data } = await db.from(T).select('id, account_id, user_id, motivo, token_hash, expira_em, usado_em').eq('id', id).maybeSingle()
      return (data as LinhaLink | null) ?? null
    },
    async gastar(id, userId, agoraIso) {
      const { data, error } = await db.from(T).update({ usado_em: agoraIso })
        .eq('id', id).eq('user_id', userId).is('usado_em', null).select('id')
      return !error && Boolean(data?.length)
    },
  }
}

/** O URL do link: o token no FRAGMENTO — o browser não o manda ao servidor nem no Referer. */
export function urlDoLink(site: string, token: string): string {
  return `${site.replace(/\/$/, '')}/mtmfunded/credenciais#t=${encodeURIComponent(token)}`
}

/**
 * CONCESSÃO CURTA depois de abrir o link: deixa «Gerar nova password» no mesmo ecrã a quem não tem
 * password MTM (Google/PrimeVerse) sem pedir outro link. 10 minutos, presa à conta E ao dono.
 */
export const VALIDADE_CONCESSAO_MS = 10 * 60_000

export function emitirConcessao(accountId: string, userId: string, agoraMs = Date.now(), chave?: string): string {
  const corpo = `c1.${accountId}.${userId}.${agoraMs + VALIDADE_CONCESSAO_MS}`
  return `${corpo}.${assinar(corpo, chave)}`
}

export function concessaoValida(token: unknown, accountId: string, userId: string, agoraMs = Date.now(), chave?: string): boolean {
  if (typeof token !== 'string' || token.length > 300) return false
  const partes = token.split('.')
  if (partes.length !== 5 || partes[0] !== 'c1') return false
  if (!igual(partes[4], assinar(partes.slice(0, 4).join('.'), chave))) return false
  return partes[1] === accountId && partes[2] === userId && Number(partes[3]) > agoraMs
}
