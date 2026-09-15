/**
 * CONTAS MTM FUNDED DO DONO — ricardogarciapt@proton.me (pedido de 15/09).
 *
 * 8 contas simuladas de 1 000 USD no NOSSO servidor, SEM regras de programa (sem_regras + analise):
 *   · uma por estratégia (segue_estrategia): MTM Auto Premium, Sensei, Aurum Flow, GoldKiller,
 *     MTM Auto Edge, MTM Auto King, MTM Auto Wolf;
 *   · «Todos os sinais» (recolhe_todos_sinais): abre cada sinal do sistema a 0,01 com a fonte no comentário.
 * Todas `conta_casa` (contam para a equidade da MTM) e ligadas como contas pessoais em T2T / MTM Copy
 * (mtmcopy_connections mtmfunded) e MTM System / MTM Auto (mtmauto_accounts mtmfunded), com
 * subscrição à estratégia quando ele ainda não a tem.
 *
 *   npx tsx scripts/criar-contas-ricardo.ts               → só mostra o plano (não escreve)
 *   npx tsx scripts/criar-contas-ricardo.ts --escrever    → cria (precisa da MTMFUNDED_CRED_KEY local)
 *
 * PRÉ-REQUISITOS: migrações 070, 072, 074 e 092 aplicadas. Imprime logins, NUNCA passwords; não
 * envia email. Idempotente: correr outra vez só repõe ligações em falta.
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const EMAIL = (process.argv.find((a) => a.startsWith('--email=')) ?? '--email=ricardogarciapt@proton.me').slice('--email='.length).toLowerCase()
const escrever = process.argv.includes('--escrever')

async function main() {
  const { getSupabaseAdmin } = await import('../lib/supabase-admin-client')
  const { planoContasDoDono, ligarContaExistente, criarContaPlaneada, ESTRATEGIAS_DO_DONO } = await import('../lib/mtmfunded/estrategias-sinais/contas')
  const db = getSupabaseAdmin()

  const { data: perfil } = await db.from('profiles').select('id, email').ilike('email', EMAIL).maybeSingle()
  if (!perfil) { console.error(`utilizador ${EMAIL} não encontrado`); process.exit(2) }
  const userId = String(perfil.id)

  type Linha = { id: string; tipo: string; segue_estrategia: string | null; provider_slug: string | null; recolhe_todos_sinais?: boolean | null; mt5_login: string | null; saldo_inicial: number | null }
  const ler = async (cols: string) => {
    const r = await db.from('mtm_trading_accounts').select(cols).eq('user_id', userId).eq('motor', 'sim').neq('estado', 'cancelada')
    return { data: (r.data ?? null) as unknown as Linha[] | null, error: r.error }
  }
  let { data: existentes, error } = await ler('id, tipo, segue_estrategia, provider_slug, recolhe_todos_sinais, mt5_login, saldo_inicial')
  if (error) {
    console.log(`  (092 por aplicar: ${error.message} — plano sem a coluna recolhe_todos_sinais)`)
    if (escrever) process.exit(2)
    ;({ data: existentes, error } = await ler('id, tipo, segue_estrategia, provider_slug, mt5_login, saldo_inicial'))
    if (error) { console.error(`leitura falhou: ${error.message}`); process.exit(2) }
  }

  const { data: provs } = await db.from('mtmauto_providers').select('slug, ativo')
  const slugs = new Set((provs ?? []).map((p) => String(p.slug).toLowerCase()))
  const faltam = ESTRATEGIAS_DO_DONO.filter((e) => !slugs.has(e.slug.toLowerCase())).map((e) => e.slug)

  const plano = planoContasDoDono(existentes ?? [])
  console.log(`\n${EMAIL} (${userId.slice(0, 8)}…)`)
  for (const j of plano.jaExistem) console.log(`  já existe   ${j.rotulo.padEnd(38)} ${j.id.slice(0, 8)}…`)
  for (const c of plano.criar) console.log(`  CRIAR       ${c.rotulo.padEnd(38)} ${c.saldo} USD · ${c.slug ? `segue ${c.slug}` : 'todos os sinais'} · sem regras · conta da casa · T2T+MTM Auto`)
  if (faltam.length) console.log(`\n  ⚠ estratégias que ainda não existem em mtmauto_providers: ${faltam.join(', ')} (aplicar a 092)`)

  if (!escrever) { console.log('\nsó leitura. --escrever para criar.'); return }
  if (!(process.env.MTMFUNDED_CRED_KEY && process.env.MTMFUNDED_CRED_KEY.length >= 32)) {
    console.error('\nfalta a MTMFUNDED_CRED_KEY local (as credenciais nascem cifradas)'); process.exit(2)
  }

  for (const c of plano.criar) {
    const r = await criarContaPlaneada(userId, c, 'script:criar-contas-ricardo')
    console.log(`  ${r.erro ? 'ERRO ' : 'ok   '} ${c.rotulo.padEnd(38)} login ${String(r.login ?? '—').padEnd(9)} T2T ${r.t2t} · MTM Auto ${r.mtmauto} · subscrição ${r.subscricao}${r.erro ? ` · ${r.erro}` : ''}`)
  }
  // repor ligações das que já existiam
  const antigas = plano.jaExistem
  if (antigas.length) {
    const planoCompleto = planoContasDoDono([])
    for (const j of antigas) {
      const conta = (existentes ?? []).find((x) => x.id === j.id)!
      const c = planoCompleto.criar.find((p) => p.rotulo === j.rotulo)
      if (!c) continue
      const r = { rotulo: c.rotulo, accountId: j.id, login: (conta.mt5_login as string) ?? null, nova: false, t2t: 'n/a', mtmauto: 'n/a', subscricao: 'n/a' } as Parameters<typeof ligarContaExistente>[3]
      await ligarContaExistente(userId, { id: j.id, mt5_login: r.login, saldo_inicial: Number(conta.saldo_inicial ?? 1000) }, c, r)
      await db.from('mtm_trading_accounts').update({ sem_regras: true, conta_casa: true }).eq('id', j.id)
      console.log(`  ligada ${c.rotulo.padEnd(38)} T2T ${r.t2t} · MTM Auto ${r.mtmauto} · subscrição ${r.subscricao}${r.erro ? ` · ${r.erro}` : ''}`)
    }
  }
  console.log('\nas passwords estão cifradas na base — vêem-se no painel/admin, nunca aqui nem por email.')
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
