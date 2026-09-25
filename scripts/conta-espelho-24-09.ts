/**
 * CONTA-ESPELHO 10 K + CONTA DE 1 K A SEGUIR O MTM SCANNER — 24/09/2026, a pedido do dono.
 *
 * ── Porque é que isto existe ─────────────────────────────────────────────────────────────────────
 *
 * As estatísticas publicadas de cada estratégia saem de `mtmcopy_signal_tracking`, a tabela das
 * IDEIAS: cada sinal ganha um desfecho tudo-ou-nada — bateu no alvo ou bateu no stop. Como as
 * estratégias fecham em parciais (TP1, TP2, resto no trailing), essa medição é sistematicamente
 * PIOR do que a realidade: um sinal que embolsou TP1 e TP2 e depois voltou ao stop conta lá como
 * perda inteira.
 *
 * O instrumento honesto é a CONTA-ESPELHO: uma conta que abre o que os sinais dizem e fecha o que as
 * saídas reais dizem, com cada parcial pesada pelo lote que fechou.
 *
 * A conta-espelho ORIGINAL era uma conta PU Prime demo na MetaApi
 * (`6014b4fc-3ed3-458a-8cea-7099cf29b51f`, login 700163127). Parou a 2026-08-26 às 23:14 UTC — a
 * conta foi APAGADA na MetaApi (hoje responde 404) e está no registo de contas inexistentes
 * (lib/mtmcopy/metaapi-inexistentes.ts). Um id da MetaApi apagado não volta: só com conta nova.
 *
 * A sucessora já existe e é outra coisa: a conta «Todos os sinais» do MTM Funded simulado
 * (`recolhe_todos_sinais`, migração 092), viva desde 15/09 — só que com 1 000 USD e 0,01 lotes, o
 * lote MÍNIMO, que não se parte em três. Nunca houve uma parcial para contar. Daí o pedido do dono:
 * uma conta-espelho NOVA de 10 000 USD, onde 0,10 lotes dão TP1 a 0,05 e TP2 a 0,02.
 *
 * ── O que este script cria ───────────────────────────────────────────────────────────────────────
 *
 *  A. «MTM Funded · Conta-espelho 10K» — 10 000 USD, `recolhe_todos_sinais`, abre TODOS os sinais de
 *     TODOS os canais do Tap to Trade (lib/mtmfunded/estrategias-sinais/todos-os-sinais.ts, chamada
 *     pelo signal-tracker quando a entrada enche). Ninguém a copia: é só para medir.
 *  B. «MTM Funded · MTM Scanner» — 1 000 USD com `segue_estrategia = 'mtm-scanner'`, igual às outras
 *     contas de estratégia do dono. AVISO: hoje NÃO vai receber nada (ver o relatório) — o provider
 *     `mtm-scanner` está inactivo, não tem linha em `mestres_estrategias` (logo, sem conta mestre) e
 *     o canal que lhe dava sinais (`trade-ideas-setup`) saiu do mapa do T2T a 27/08. A conta fica
 *     criada e à espera; o dia em que o MTM Scanner voltar a produzir, ela mede-o desde o primeiro.
 *
 * As duas nascem `sem_regras` + `conta_casa` + `conta_real_casa` e sem T2T (`aceita_t2t = false`):
 * cada instrumento mede UMA coisa, e um sinal aceite à mão no T2T abriria uma segunda posição na
 * mesma conta e estragava a contagem.
 *
 * ── GOTCHA que já custou caro ────────────────────────────────────────────────────────────────────
 *
 * `camposDeContaSimulada(saldo)` JÁ deixa o saldo, a equity, a âncora e o pico no valor certo.
 * NUNCA chamar `funded_somar_saldo` a seguir: o saldo fica a dobrar (aconteceu nas contas de capital
 * de 23/09 e teve de ser reposto à mão). Este script não soma nada — só regista.
 *
 * ── Correr ───────────────────────────────────────────────────────────────────────────────────────
 *
 *   npx tsx scripts/conta-espelho-24-09.ts             → só mostra o que faria
 *   npx tsx scripts/conta-espelho-24-09.ts --escrever  → cria
 *
 * Idempotente pelas COLUNAS, não por marca em `metricas` (o motor da VPS reescreve `metricas` a cada
 * minuto e uma marca posta aqui podia perder-se entre a leitura e a gravação dele):
 *   · A conta-espelho é a única do dono com `recolhe_todos_sinais` e `saldo_inicial = 10000`;
 *   · a do scanner é a única do dono com `segue_estrategia = 'mtm-scanner'`.
 * Correr outra vez não abre contas repetidas.
 */
import { join } from 'node:path'
import type { ContaPlaneada } from '../lib/mtmfunded/estrategias-sinais/contas'

const RAIZ = join(__dirname, '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

/** O dono: as contas da casa do Ricardo (as mesmas de scripts/criar-contas-ricardo.ts). */
const EMAIL_DONO = 'ricardogarciapt@proton.me'

const SALDO_ESPELHO = 10_000
const SALDO_SCANNER = 1_000
const ESTRATEGIA_SCANNER = 'mtm-scanner'

const ROTULO_ESPELHO = 'MTM Funded · Conta-espelho 10K'
const ROTULO_SCANNER = 'MTM Funded · MTM Scanner'

const escrever = process.argv.includes('--escrever')

/** Colunas comuns: sem regras de avaliação, conta da casa, negociação real da casa, sem T2T. */
const COLUNAS_BASE = {
  sem_regras: true,
  conta_casa: true,
  conta_real_casa: true,
  aceita_t2t: false,
} as const

async function main() {
  const { getSupabaseAdmin } = await import('../lib/supabase-admin-client')
  const { criarContaPlaneada } = await import('../lib/mtmfunded/estrategias-sinais/contas')
  const db = getSupabaseAdmin()

  const { data: dono } = await db.from('profiles').select('id, email').eq('email', EMAIL_DONO).maybeSingle()
  if (!dono) throw new Error(`perfil do dono (${EMAIL_DONO}) não encontrado`)
  const userId = String(dono.id)

  // ── ANTES: o que já lá está ────────────────────────────────────────────────────────────────────
  const { data: existentes } = await db
    .from('mtm_trading_accounts')
    .select('id, mt5_login, tipo, estado, saldo_inicial, sim_saldo, segue_estrategia, recolhe_todos_sinais')
    .eq('user_id', userId)
    .eq('motor', 'sim')
    .limit(200)
  const contas = existentes ?? []

  console.log(`\nANTES — contas simuladas do dono: ${contas.length}`)
  for (const c of contas.filter((x) => x.recolhe_todos_sinais === true || String(x.segue_estrategia ?? '').toLowerCase() === ESTRATEGIA_SCANNER)) {
    console.log(`  · ${c.mt5_login} · ${Number(c.saldo_inicial)} USD · saldo ${Number(c.sim_saldo ?? 0)} · ` +
      `${c.recolhe_todos_sinais ? 'recolhe TODOS os sinais' : `segue ${c.segue_estrategia}`} · ${c.estado}`)
  }

  const espelhoJa = contas.find((c) => c.recolhe_todos_sinais === true && Number(c.saldo_inicial) === SALDO_ESPELHO)
  const scannerJa = contas.find((c) => String(c.segue_estrategia ?? '').toLowerCase() === ESTRATEGIA_SCANNER)
  // A conta-espelho antiga de 1 000 USD fica como está — NÃO se apaga nem se desliga nada aqui. Duas
  // contas a recolher os mesmos sinais não se estorvam: a de 1 K continua a série desde 15/09 e serve
  // de controlo à de 10 K (mesmos sinais, lotes diferentes).
  const espelho1k = contas.find((c) => c.recolhe_todos_sinais === true && Number(c.saldo_inicial) !== SALDO_ESPELHO)

  const plano: ContaPlaneada[] = []
  if (!espelhoJa) {
    plano.push({
      papel: 'todos_os_sinais', slug: null, rotulo: ROTULO_ESPELHO, saldo: SALDO_ESPELHO,
      tipo: 'financiada', ligarNasApps: true, subscrever: false,
      colunas: { ...COLUNAS_BASE, segue_estrategia: null, recolhe_todos_sinais: true },
    })
  }
  if (!scannerJa) {
    plano.push({
      papel: 'estrategia', slug: ESTRATEGIA_SCANNER, rotulo: ROTULO_SCANNER, saldo: SALDO_SCANNER,
      tipo: 'financiada', ligarNasApps: true, subscrever: true,
      colunas: { ...COLUNAS_BASE, segue_estrategia: ESTRATEGIA_SCANNER, recolhe_todos_sinais: false },
    })
  }

  console.log('\nA ESCREVER:')
  if (espelhoJa) console.log(`  (já existe) conta-espelho 10K · login ${espelhoJa.mt5_login}`)
  if (scannerJa) console.log(`  (já existe) conta MTM Scanner · login ${scannerJa.mt5_login}`)
  for (const c of plano) {
    console.log(`  + mtm_trading_accounts: ${c.rotulo} · ${c.saldo} USD · tipo ${c.tipo} · ${JSON.stringify(c.colunas)}`)
    if (c.ligarNasApps) console.log('    + mtmcopy_connections (T2T desligado) + mtmauto_accounts')
    if (c.subscrever) console.log(`    + mtmauto_subscriptions → ${c.slug}`)
  }
  if (!plano.length) console.log('  (nada — as duas contas já existem)')

  if (!escrever) {
    console.log('\nsó leitura — --escrever para criar.')
    return
  }

  for (const c of plano) {
    const r = await criarContaPlaneada(userId, c, 'script:conta-espelho-24-09')
    if (r.erro || !r.accountId) { console.error(`  ✗ ${c.rotulo}: ${r.erro ?? 'sem conta'}`); continue }
    // A ligação T2T nasce com `t2t_enabled: true` (ligacaoT2T). Nestas contas o T2T fica FECHADO: um
    // sinal aceite à mão abriria uma segunda posição na mesma conta e duplicava a medição.
    await db.from('mtmcopy_connections').update({ t2t_enabled: false, updated_at: new Date().toISOString() })
      .eq('funded_account_id', r.accountId)
    console.log(`  ✓ ${r.rotulo} · login ${r.login} · conta ${r.accountId} · ` +
      `T2T ${r.t2t} · MTM Auto ${r.mtmauto} · subscrição ${r.subscricao}`)
  }

  // ── DEPOIS: o estado final, lido outra vez da base ─────────────────────────────────────────────
  const { data: finais } = await db
    .from('mtm_trading_accounts')
    .select('id, mt5_login, tipo, estado, saldo_inicial, sim_saldo, segue_estrategia, recolhe_todos_sinais, conta_real_casa, aceita_t2t')
    .eq('user_id', userId).eq('motor', 'sim')
    .or(`recolhe_todos_sinais.eq.true,segue_estrategia.ilike.${ESTRATEGIA_SCANNER}`)
    .order('created_at', { ascending: true })
  console.log('\nDEPOIS:')
  for (const c of finais ?? []) {
    console.log(`  · ${c.mt5_login} · ${Number(c.saldo_inicial)} USD · saldo ${Number(c.sim_saldo ?? 0)} · ` +
      `${c.recolhe_todos_sinais ? 'espelho (todos os sinais)' : `segue ${c.segue_estrategia}`} · ` +
      `T2T ${c.aceita_t2t ? 'ON' : 'off'} · ${c.estado}`)
  }
  if (espelho1k) {
    console.log(`\nNota: a conta-espelho de ${Number(espelho1k.saldo_inicial)} USD (login ${espelho1k.mt5_login}) ` +
      'continua a recolher — nada foi apagado nem desligado.')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
