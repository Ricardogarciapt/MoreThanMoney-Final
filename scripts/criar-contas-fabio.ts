/**
 * CONTAS DE ACOMPANHAMENTO DAS ESTRATÉGIAS — Fábio e Alcy (pedido do dono, 2026-09-14).
 *
 * Uma conta MTM Funded simulada (1 000 USD, tipo financiada, `metricas.analise = true`,
 * `aceita_t2t = true`) por estratégia do MTM Auto: premium-ouro, Goldkiller, sensei, aurum-flow,
 * mtm-scanner. Idempotente: correr outra vez não cria contas repetidas nem repete o aviso.
 *
 * Opcional — o caminho normal é a rota do admin, que corre na Vercel com a MTMFUNDED_CRED_KEY:
 *   POST /api/admin/mtmfunded { accao: 'sim_criar_contas_estrategia', userIds: [...], notificar: true }
 *
 *   npx tsx scripts/criar-contas-fabio.ts                 → só mostra o que faria (não escreve)
 *   npx tsx scripts/criar-contas-fabio.ts --escrever      → cria (localmente, precisa da MTMFUNDED_CRED_KEY)
 *   npx tsx scripts/criar-contas-fabio.ts --escrever --notificar
 *   MTM_ADMIN_BEARER=<token de sessão de admin> npx tsx scripts/criar-contas-fabio.ts --escrever --via-rota [--notificar]
 *
 * PRÉ-REQUISITO: a migração 070 aplicada. Imprime logins, nunca passwords.
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const UTILIZADORES = [
  '3cdbc1e5-3891-49de-a2f7-f76fafed0f80', // Fábio · ubuntu2295@gmail.com
  '610cbfd1-5f96-4f4f-8713-56f817852f08', // Alcy Landim · lbeliteclean@gmail.com (VIP)
]
const ESTRATEGIAS = ['premium-ouro', 'Goldkiller', 'sensei', 'aurum-flow', 'mtm-scanner']
const SALDO = 1000

const args = new Set(process.argv.slice(2))
const escrever = args.has('--escrever')
const notificar = args.has('--notificar')
const viaRota = args.has('--via-rota') || !(process.env.MTMFUNDED_CRED_KEY && process.env.MTMFUNDED_CRED_KEY.length >= 32)

type Resultado = { userId: string; email: string | null; erro?: string; contas: Array<{ estrategia: string; nomeEstrategia: string; login: string | null; nova: boolean; subscricao: string; erro?: string }>; aviso?: unknown }

function mostrar(resultados: Resultado[]) {
  for (const r of resultados) {
    console.log(`\n${r.email ?? r.userId}${r.erro ? ` — ERRO: ${r.erro}` : ''}`)
    for (const c of r.contas) {
      console.log(`  ${c.nomeEstrategia.padEnd(24)} login ${String(c.login ?? '—').padEnd(9)} ${c.nova ? 'NOVA' : 'já existia'} · subscrição ${c.subscricao}${c.erro ? ` · ERRO ${c.erro}` : ''}`)
    }
    if (r.aviso) console.log('  aviso:', JSON.stringify(r.aviso))
  }
}

async function main() {
  if (!escrever) {
    const { getSupabaseAdmin } = await import('../lib/supabase-admin-client')
    const db = getSupabaseAdmin()
    for (const u of UTILIZADORES) {
      const { data: p } = await db.from('profiles').select('email').eq('id', u).maybeSingle()
      const { data: ja, error } = await db.from('mtm_trading_accounts').select('segue_estrategia, mt5_login').eq('user_id', u).eq('motor', 'sim').not('segue_estrategia', 'is', null)
      if (error) console.log(`\n(a migração 070 ainda não está aplicada: ${error.message})`)
      console.log(`\n${p?.email ?? u}: criaria ${ESTRATEGIAS.filter((e) => !(ja ?? []).some((x) => String(x.segue_estrategia).toLowerCase() === e.toLowerCase())).join(', ') || 'nada (já tem todas)'}`)
    }
    console.log(`\nsó leitura. --escrever para criar${viaRota ? ' (via rota do admin: falta a MTMFUNDED_CRED_KEY local)' : ''}.`)
    return
  }

  if (viaRota) {
    const token = process.env.MTM_ADMIN_BEARER
    if (!token) { console.error('sem MTMFUNDED_CRED_KEY local e sem MTM_ADMIN_BEARER para usar a rota do admin'); process.exit(2) }
    const base = (process.env.MTM_API_BASE || 'https://www.morethanmoney.pt').replace(/\/+$/, '')
    const r = await fetch(`${base}/api/admin/mtmfunded`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ accao: 'sim_criar_contas_estrategia', userIds: UTILIZADORES, estrategias: ESTRATEGIAS, saldo: SALDO, notificar }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { console.error('rota respondeu', r.status, d); process.exit(1) }
    mostrar(d.resultados ?? [])
    return
  }

  const { criarContasDeEstrategia } = await import('../lib/mtmfunded/contas-estrategia')
  const resultados: Resultado[] = await criarContasDeEstrategia({ userIds: UTILIZADORES, estrategias: ESTRATEGIAS, saldo: SALDO, criadoPor: 'script' })
  if (notificar) {
    const { avisarContasDeEstrategia } = await import('../lib/mtmfunded/aviso-contas-estrategia')
    for (const r of resultados) if (!r.erro) r.aviso = await avisarContasDeEstrategia(r as never, SALDO)
  }
  mostrar(resultados)
}

main().catch((e) => { console.error(e); process.exit(1) })
