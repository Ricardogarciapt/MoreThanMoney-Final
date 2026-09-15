/**
 * BACKFILL — o email das credenciais para as contas MTM Funded SIMULADAS que já existem.
 *
 * Cada conta recebe login, servidor «MTM Funded», tipo/programa e o link «Ver credenciais» (uso
 * único, 24 h, só o dono — lib/mtmfunded/credenciais-link.ts). NUNCA a password, nem aqui no
 * terminal: o script imprime login, tipo e o email do dono mascarado.
 *
 *   npx tsx scripts/mtmfunded-enviar-credenciais.ts                  → SIMULAÇÃO (por defeito): lista o que faria
 *   npx tsx scripts/mtmfunded-enviar-credenciais.ts --enviar         → envia
 *   … --limite 20            → no máximo 20 contas nesta corrida
 *   … --user <uuid>          → só as contas deste dono (INCLUI as da casa dele, se as tiver)
 *   … --repetir              → reenvia também a quem já recebeu um email de credenciais (091)
 *
 * Fica de fora, por decisão:
 *  · contas da casa (`conta_casa`, migração 082) — salvo `--user` a apontar ao próprio dono;
 *  · contas da corretora (motor mt5) — essas recebem o email do agente MT5, com o QR;
 *  · contas sem login/password, não activas, e torneios antes da véspera;
 *  · quem já recebeu (linha na 091 com `email_enviado_em`), salvo `--repetir`.
 *
 * PRÉ-REQUISITOS: migração 091 aplicada; MTMFUNDED_CRED_KEY, SUPABASE_SERVICE_ROLE_KEY, GMAIL_* no
 * ambiente (ou .env.local). O Gmail limita envios: vai uma conta de cada vez, com pausa.
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const argv = process.argv.slice(2)
const tem = (f: string) => argv.includes(f)
const valor = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const ENVIAR = tem('--enviar')
const REPETIR = tem('--repetir')
const LIMITE = Number(valor('--limite') ?? 500)
const SO_USER = valor('--user')

const mascarar = (e: string | null | undefined) => {
  if (!e) return '—'
  const [u, d] = e.split('@')
  return `${u.slice(0, 2)}***@${d ?? ''}`
}

async function main() {
  const { getSupabaseAdmin } = await import('../lib/supabase-admin-client')
  const { enviarCredenciaisDaConta } = await import('../lib/mtmfunded/credenciais-servico')
  const { tipoCurto } = await import('../lib/mtmfunded/etiquetas')
  const db = getSupabaseAdmin()

  if (SO_USER && !/^[0-9a-f-]{36}$/i.test(SO_USER)) throw new Error('--user tem de ser um uuid')

  // A 091 tem de existir: sem ela o envio não guarda o link e o email levaria um link morto.
  const { error: sem091 } = await db.from('mtm_funded_credenciais_links').select('id').limit(1)
  if (sem091) throw new Error(`migração 091 por aplicar (${sem091.message})`)

  // `conta_casa` só existe com a 082; sem ela, ninguém é da casa.
  const comCasa = !(await db.from('mtm_trading_accounts').select('conta_casa').limit(1)).error
  let q = db.from('mtm_trading_accounts')
    .select(`id, user_id, tipo, estado, mt5_login, metricas, created_at${comCasa ? ', conta_casa' : ''}`)
    .eq('motor', 'sim').eq('estado', 'ativa')
    .not('mt5_login', 'is', null).not('mt5_password_cifrada', 'is', null).not('user_id', 'is', null)
    .order('created_at', { ascending: true }).limit(2000)
  if (SO_USER) q = q.eq('user_id', SO_USER)
  const { data: contas, error } = await q
  if (error) throw new Error(error.message)
  const linhas = (contas ?? []) as unknown as Array<Record<string, unknown>>

  const ids = linhas.map((c) => String(c.id))
  const jaEnviadas = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('mtm_funded_credenciais_links').select('account_id')
      .in('account_id', ids.slice(i, i + 200)).not('email_enviado_em', 'is', null)
    for (const l of data ?? []) jaEnviadas.add(String(l.account_id))
  }
  const donos = [...new Set(linhas.map((c) => String(c.user_id)))]
  const emails = new Map<string, string | null>()
  for (let i = 0; i < donos.length; i += 200) {
    const { data } = await db.from('profiles').select('id, email').in('id', donos.slice(i, i + 200))
    for (const p of data ?? []) emails.set(String(p.id), (p.email as string | null) ?? null)
  }

  const alvo: Array<Record<string, unknown>> = []
  const saltadas: Record<string, number> = {}
  const saltar = (m: string) => { saltadas[m] = (saltadas[m] ?? 0) + 1 }
  for (const c of linhas) {
    if (c.conta_casa === true && !(SO_USER && c.user_id === SO_USER)) { saltar('conta da casa'); continue }
    if (!REPETIR && jaEnviadas.has(String(c.id))) { saltar('já recebeu'); continue }
    if (!emails.get(String(c.user_id))) { saltar('dono sem email'); continue }
    alvo.push(c)
  }

  console.log(`${ENVIAR ? 'ENVIO' : 'SIMULAÇÃO'} — ${linhas.length} contas simuladas activas com credenciais; ${alvo.length} a enviar (limite ${LIMITE}).`)
  for (const [m, n] of Object.entries(saltadas)) console.log(`  saltadas: ${n} · ${m}`)

  let enviados = 0
  let falhados = 0
  for (const c of alvo.slice(0, LIMITE)) {
    const etiqueta = tipoCurto(String(c.tipo), c.metricas as Record<string, unknown> | null)
    const quem = mascarar(emails.get(String(c.user_id)))
    const r = await enviarCredenciaisDaConta(String(c.id), 'backfill', { db, simular: !ENVIAR, incluirCasa: Boolean(SO_USER) })
    if (r.enviado) enviados++
    else if (ENVIAR) falhados++
    console.log(`  ${String(c.mt5_login).padEnd(9)} ${etiqueta.padEnd(7)} ${quem.padEnd(28)} ${r.enviado ? 'enviado' : r.motivo ?? '—'}`)
    if (ENVIAR) await new Promise((ok) => setTimeout(ok, 1500))
  }
  console.log(ENVIAR ? `\n${enviados} enviados, ${falhados} falhados.` : '\nNada enviado. Corre com --enviar para enviar.')
}

main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : e); process.exit(1) })
