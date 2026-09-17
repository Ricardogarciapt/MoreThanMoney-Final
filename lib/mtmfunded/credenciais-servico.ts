import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cifrar, decifrar } from './credenciais'
import { emitirLink, repoSupabase, urlDoLink, type MotivoLink } from './credenciais-link'
import { montarEmailCredenciais } from './email-credenciais'

/**
 * AS CREDENCIAIS DE UMA CONTA MTM FUNDED, DO LADO DO SERVIDOR — um só sítio para as três portas:
 *   · «Mostrar» no painel (re-autenticação com a password da conta MTM);
 *   · o link seguro do email (./credenciais-link.ts);
 *   · «Gerar nova password» (re-autenticação) — e o admin (lib/mtmfunded/admin-conta-accoes.ts).
 *
 * Regras que atravessam o ficheiro:
 *   · a conta procura-se SEMPRE pelo dono no mesmo select (`.eq('user_id', …)`);
 *   · nenhuma password nem token vai para `console.*` — só login, motivo e o id da conta;
 *   · contas de torneio só abrem na véspera (a mesma porta de sempre, agora partilhada).
 */

export type ResultadoCredenciais =
  | { ok: true; login: string | null; servidor: string | null; password: string | null; investor: string | null; aviso?: string; bloqueada?: boolean; abrePor?: string }
  | { ok: false; status: number; erro: string }

const CAMPOS = 'id, user_id, motor, tipo, estado, mt5_login, servidor, mt5_password_cifrada, mt5_investor_cifrada, tournament_id, program_id, metricas'

async function portaDoTorneio(db: SupabaseClient, tournamentId: string | null | undefined): Promise<string | null> {
  if (!tournamentId) return null
  const { data: t } = await db.from('mtm_tournaments').select('comeca_em').eq('id', tournamentId).maybeSingle()
  if (!t?.comeca_em) return null
  const abrem = new Date(t.comeca_em as string).getTime() - 24 * 3600_000
  return Date.now() < abrem ? new Date(abrem).toISOString() : null
}

/** As credenciais da conta para o DONO. Quem chama já decidiu que a pessoa se re-autenticou. */
export async function credenciaisDoDono(contaId: string, userId: string, db = getSupabaseAdmin()): Promise<ResultadoCredenciais> {
  if (!/^[0-9a-f-]{36}$/i.test(contaId)) return { ok: false, status: 400, erro: 'conta inválida' }
  const { data: conta } = await db.from('mtm_trading_accounts').select(CAMPOS).eq('id', contaId).eq('user_id', userId).maybeSingle()
  if (!conta) return { ok: false, status: 404, erro: 'Conta não encontrada' }
  const login = (conta.mt5_login as string | null) ?? null
  const servidor = (conta.servidor as string | null) ?? null

  if (conta.tipo === 'torneio') {
    const abrePor = await portaDoTorneio(db, conta.tournament_id as string | null)
    if (abrePor) {
      return { ok: true, login, servidor, password: null, investor: null, bloqueada: true, abrePor,
        aviso: 'As credenciais desta conta abrem na véspera do torneio. Recebes um email nesse dia.' }
    }
  }
  if (!conta.mt5_password_cifrada) {
    return { ok: true, login, servidor, password: null, investor: null,
      aviso: conta.estado === 'ativa' ? 'A conta existe mas a palavra-passe não ficou guardada. Gera uma nova ou pede ao apoio.' : 'A conta ainda está a ser emitida.' }
  }
  let password: string | null
  let investor: string | null = null
  try {
    password = decifrar(conta.mt5_password_cifrada as string)
    if (conta.mt5_investor_cifrada) investor = decifrar(conta.mt5_investor_cifrada as string)
  } catch {
    return { ok: false, status: 500, erro: 'Não foi possível ler a palavra-passe' }
  }
  if (!password) return { ok: false, status: 500, erro: 'Não foi possível ler a palavra-passe' }
  return { ok: true, login, servidor, password, investor }
}

/**
 * RE-AUTENTICAÇÃO: a password da conta MTM (não a da conta de negociação).
 *
 * Cliente NOVO a cada chamada, sem persistir sessão: o singleton anon é partilhado entre pedidos e
 * ficaria com a sessão desta pessoa. A sessão criada pelo login de verificação revoga-se logo.
 * Contas só Google/PrimeVerse não têm password — para essas há o link seguro por email.
 */
const falhas = new Map<string, number[]>()

export async function confirmarPasswordMtm(userId: string, password: string): Promise<'ok' | 'errada' | 'sem_password'> {
  if (!password || password.length > 200) return 'errada'
  // 5 falhas em 15 min por pessoa (por instância): os pedidos saem todos do IP do servidor, e o
  // limite do Supabase por IP bloqueava toda a gente por causa de uma só pessoa a tentar adivinhar.
  const recentes = (falhas.get(userId) ?? []).filter((t) => Date.now() - t < 15 * 60_000)
  if (recentes.length >= 5) return 'errada'
  const r = await verificar(userId, password)
  if (r === 'errada') falhas.set(userId, [...recentes, Date.now()])
  else if (r === 'ok') falhas.delete(userId)
  return r
}

async function verificar(userId: string, password: string): Promise<'ok' | 'errada' | 'sem_password'> {
  const admin = getSupabaseAdmin()
  const { data } = await admin.auth.admin.getUserById(userId)
  const user = data?.user
  if (!user?.email) return 'sem_password'
  const temPassword = (user.identities ?? []).some((i) => i.provider === 'email')
  if (!temPassword) return 'sem_password'
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iwscxotvmtkphajmasof.supabase.co').trim()
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  if (!anon) return 'errada'
  const cliente = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: s, error } = await cliente.auth.signInWithPassword({ email: user.email, password })
  if (error || s?.user?.id !== userId) return 'errada'
  if (s.session?.access_token) await admin.auth.admin.signOut(s.session.access_token, 'local').catch(() => undefined)
  return 'ok'
}

export async function gerarNovasPasswords(conta: { id: string }, db = getSupabaseAdmin()): Promise<{ password: string; investor: string }> {
  const { gerarPassword } = await import('./simulado/credenciais')
  const password = gerarPassword()
  const investor = gerarPassword()
  const { error } = await db.from('mtm_trading_accounts').update({
    mt5_password_cifrada: cifrar(password), mt5_investor_cifrada: cifrar(investor), updated_at: new Date().toISOString(),
  }).eq('id', conta.id).eq('motor', 'sim')
  if (error) throw new Error(`não foi possível gravar as passwords novas: ${error.message}`)
  return { password, investor }
}

/** Limite dos links pedidos no painel: 3 por conta por hora (um email por clique chega). */
export async function podePedirLink(accountId: string, db = getSupabaseAdmin()): Promise<boolean> {
  const desde = new Date(Date.now() - 3600_000).toISOString()
  const { count, error } = await db.from('mtm_funded_credenciais_links').select('id', { count: 'exact', head: true })
    .eq('account_id', accountId).gte('criado_em', desde)
  if (error) return false
  return (count ?? 0) < 3
}

export interface ResultadoEnvio {
  enviado: boolean
  motivo?: string
  login?: string | null
}

/**
 * Emite um link e envia o email das credenciais. Só contas SIMULADAS (as da corretora recebem o
 * email do agente MT5, com o QR). Nunca lança: quem cria contas não pode falhar por causa do email.
 *
 * `simular` (dry-run): diz o que faria, sem link nem email.
 */
export async function enviarCredenciaisDaConta(
  accountId: string,
  motivo: MotivoLink,
  opts: { db?: SupabaseClient; simular?: boolean; incluirCasa?: boolean } = {},
): Promise<ResultadoEnvio> {
  const db = opts.db ?? getSupabaseAdmin()
  try {
    const { data: conta } = await db.from('mtm_trading_accounts').select(CAMPOS).eq('id', accountId).maybeSingle()
    if (!conta) return { enviado: false, motivo: 'conta não existe' }
    const login = (conta.mt5_login as string | null) ?? null
    if (conta.motor !== 'sim') return { enviado: false, motivo: 'conta da corretora (email do agente MT5)', login }
    if (!login || !conta.mt5_password_cifrada) return { enviado: false, motivo: 'conta sem credenciais', login }
    if (!conta.user_id) return { enviado: false, motivo: 'conta sem dono', login }
    if (!opts.incluirCasa) {
      const casa = await eContaDaCasa(db, accountId)
      if (casa) return { enviado: false, motivo: 'conta da casa', login }
    }
    if (conta.tipo === 'torneio' && (await portaDoTorneio(db, conta.tournament_id as string | null))) {
      return { enviado: false, motivo: 'torneio: as credenciais só abrem na véspera', login }
    }
    // Tipo, fase, tamanho, oferta e idioma saem da conta real — ./entrega-conta-dados.ts.
    const { dadosDeEntrega } = await import('./entrega-conta-dados')
    const dados = await dadosDeEntrega(db, accountId)
    const perfil = dados?.perfil
    if (!dados || !perfil?.email) return { enviado: false, motivo: 'dono sem email', login }
    if (opts.simular) return { enviado: false, motivo: 'simulação (nada enviado)', login }

    const { getSiteUrl, createMailTransporter, mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } = await import('@/lib/mail-transport')
    const site = getSiteUrl()
    const link = await emitirLink({ accountId, userId: conta.user_id as string, motivo }, repoSupabase(db))
    const email = montarEmailCredenciais({
      nome: perfil.nome.split(/\s+/)[0] || 'Trader',
      login,
      servidor: (conta.servidor as string | null) ?? 'MTM Funded',
      conta: dados.conta,
      idioma: dados.idioma,
      motivo,
      urlLink: urlDoLink(site, link.token),
      expiraEm: link.expiraEm,
      urlWebtrader: `${site}/webtrader`,
      siteUrl: site,
    })
    await createMailTransporter().sendMail({
      from: mailFrom(), to: perfil.email, subject: email.assunto,
      html: prepareBrandedEmailHtml(email.html), text: email.texto, attachments: brandedMailAttachments(),
    })
    await db.from('mtm_funded_credenciais_links').update({ email_enviado_em: new Date().toISOString() }).eq('id', link.linkId)
    console.log(`[mtmfunded/credenciais] email enviado — login ${login} · ${motivo}`)
    return { enviado: true, login }
  } catch (e) {
    // Só a mensagem: um erro do transporte pode citar o corpo, e o corpo tem o link.
    const msg = e instanceof Error ? e.message.replace(/#t=[^\s"')]+/g, '#t=…') : 'erro'
    console.error(`[mtmfunded/credenciais] envio falhou — conta ${accountId} · ${motivo}: ${msg}`)
    return { enviado: false, motivo: 'falhou o envio' }
  }
}

/**
 * `conta_casa` (082) ou `conta_real_casa` (109): as duas são contas do dono, não de cliente, e não
 * recebem o email de entrega de cliente (o texto da Funded fala do capital patrocinado a 10%, que
 * não é a regra de uma conta real da casa de 1K). Sem as colunas, nenhuma conta é da casa.
 */
export async function eContaDaCasa(db: SupabaseClient, accountId: string): Promise<boolean> {
  const { selecionarComOpcionais } = await import('./numeros-conta')
  const { data, error } = await selecionarComOpcionais<{ conta_casa?: boolean; conta_real_casa?: boolean }>(
    'id', (cols) => db.from('mtm_trading_accounts').select(cols).eq('id', accountId).limit(1) as never,
  )
  if (error || !data[0]) return false
  return data[0].conta_casa === true || data[0].conta_real_casa === true
}
