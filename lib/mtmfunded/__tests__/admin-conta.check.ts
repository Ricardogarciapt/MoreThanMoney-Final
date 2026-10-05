/**
 * A GESTÃO DE UMA CONTA PELO ADMIN — o que não pode falhar.
 *
 *  · só admin (401 sem sessão, 403 sem admin) e a guarda corre ANTES de qualquer leitura;
 *  · a pausa fecha as duas portas de ordens novas (abrirPosicao, criarPendente), e só essas;
 *  · o ajuste de saldo é a função atómica funded_somar_saldo — nunca um update de sim_saldo;
 *  · breach / reverter só nas transições certas, e nunca com posições abertas numa simulada;
 *  · um levantamento só se aprova/paga numa Funded activa, sem posições, dentro do levantável.
 *
 * Correr: npx tsx lib/mtmfunded/__tests__/admin-conta.check.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decisaoDeAcesso, motivoDePausa, transicao, podeAvancarFase, guardaLevantamento, validarPedido, paraCsv, barrasDeRegras,
  type ContextoLevantamento,
} from '../admin-conta'
import { executarAccao, ErroAdmin } from '../admin-conta-accoes'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}
function sim(nome: string, v: boolean) { eq(nome, v, true) }

const RAIZ = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

// ── 1. autorização ─────────────────────────────────────────────────────────
eq('sem sessão → 401', decisaoDeAcesso({ isAdmin: false })?.status, 401)
eq('sessão sem admin → 403', decisaoDeAcesso({ isAdmin: false, userId: 'u1' })?.status, 403)
eq('admin → passa', decisaoDeAcesso({ isAdmin: true, userId: 'u1' }), null)
eq('isAdmin sem userId não passa', decisaoDeAcesso({ isAdmin: true })?.status, 401)

{
  const rota = ler('app/api/admin/mtmfunded/conta/[id]/route.ts')
  for (const metodo of ['GET', 'POST']) {
    const i = rota.indexOf(`export async function ${metodo}(`)
    sim(`${metodo} existe`, i >= 0)
    const corpo = rota.slice(i, rota.indexOf('\n}\n', i))
    const guarda = corpo.indexOf("const g = await guarda()")
    const negado = corpo.indexOf("if ('negado' in g) return g.negado")
    const primeiraLeitura = Math.min(...['getSupabaseAdmin()', 'lerConta(', 'request.json('].map((s) => { const k = corpo.indexOf(s); return k < 0 ? Infinity : k }))
    sim(`${metodo}: guarda antes de ler a base ou o corpo`, guarda > 0 && negado > guarda && negado < primeiraLeitura)
  }
  sim('guarda usa verifyAdminAccess + decisaoDeAcesso', /verifyAdminAccess\(\)[\s\S]{0,80}decisaoDeAcesso\(a\)/.test(rota))
  /*
   * A sequência auditar→executar saiu da rota para `admin-conta-executar.ts` (24/09), porque o
   * bot de Telegram decide levantamentos pelo mesmo caminho. O teste segue-a para lá: o que não
   * pode acontecer é a acção correr antes de a intenção ficar escrita.
   */
  sim('POST passa pelo executor auditado', rota.includes('executarComAuditoria({'))
  sim('POST não executa por fora do executor', !rota.includes('executarAccao({'))
  const exec = ler('lib/mtmfunded/admin-conta-executar.ts')
  sim('o executor audita antes de executar', exec.indexOf("from('mtm_funded_admin_audit').insert") < exec.indexOf('executarAccao({'))
  sim('o executor fecha o registo com o depois', /from\('mtm_funded_admin_audit'\)\.update\(\{\s*\n?\s*depois/.test(exec))
}

// ── 2. pausa ───────────────────────────────────────────────────────────────
eq('sem pausa → null', motivoDePausa({ pausada_em: null }), null)
sim('com pausa → recusa com o motivo', String(motivoDePausa({ pausada_em: '2026-09-15T10:00:00Z', pausa_motivo: 'KYC' })).includes('KYC'))
{
  const ex = ler('lib/mtmfunded/simulado/execucao.ts')
  for (const f of ['abrirPosicao', 'criarPendente']) {
    const i = ex.indexOf(`export async function ${f}(`)
    const primeira = ex.slice(i).split('\n')[1].trim()
    eq(`${f}: primeira linha verifica a pausa`, primeira, 'await exigirContaSemPausa(conta)')
  }
  // Fechar, modificar e cancelar continuam permitidos numa conta em pausa.
  for (const f of ['fecharPosicao', 'modificarPosicao', 'cancelarPendente']) {
    const i = ex.indexOf(`export async function ${f}(`)
    const fim = ex.indexOf('\n}\n', i)
    sim(`${f}: não bloqueia pela pausa`, !ex.slice(i, fim).includes('exigirContaSemPausa'))
  }
  // Nenhuma porta de ordens insere posições/ordens por fora de execucao.ts.
  for (const p of ['app/api/mtmfunded/simulado/ordens/route.ts', 'app/api/mtmfunded/simulado/webhook/[token]/route.ts', 'lib/mtmfunded/simulado/t2t-simulado.ts']) {
    const src = ler(p)
    sim(`${p}: não insere em funded_positions/funded_orders directamente`, !/from\(['"]funded_(positions|orders)['"]\)\s*\.insert/.test(src))
  }
  const pausa = ler('lib/mtmfunded/simulado/pausa.ts')
  sim('pausa: coluna em falta (079 por aplicar) deixa passar', /42703\|PGRST204/.test(pausa))
}
{
  const base = { estado: 'ativa', motor: 'sim', tipo: 'desafio' }
  const ctx = { agora: 'T', motivo: 'KYC', adminId: 'adm', abertas: 2, pendentes: 1 }
  const p = transicao('pausar', base, ctx)
  sim('pausar uma activa com posições é permitido (o motor gere-as)', p.ok)
  eq('pausar mantém o estado (só colunas da pausa)', p.ok ? Object.keys(p.patch).sort() : null, ['pausa_motivo', 'pausada_em', 'pausada_por'])
  eq('pausar conta MT5 → 409', transicao('pausar', { ...base, motor: 'mt5' }, ctx).ok, false)
  eq('pausar duas vezes → 409', transicao('pausar', { ...base, pausada_em: 'T' }, ctx).ok, false)
  eq('retomar sem pausa → 409', transicao('retomar', base, ctx).ok, false)
  sim('retomar limpa a pausa', (() => { const t = transicao('retomar', { ...base, pausada_em: 'T' }, ctx); return t.ok && t.patch.pausada_em === null })())
}

// ── 3. transições breach / fechar ──────────────────────────────────────────
{
  const ctxPlana = { agora: 'T', motivo: 'fraude de latência', adminId: 'adm', abertas: 0, pendentes: 0 }
  const sim1 = { estado: 'ativa', motor: 'sim', tipo: 'desafio' }
  const b = transicao('marcar_breach', sim1, ctxPlana)
  eq('breach: activa e plana → quebrada', b.ok && b.patch.estado, 'quebrada')
  sim('breach: motivo fica com prefixo admin', b.ok && String(b.patch.quebrou_regra).startsWith('admin: '))
  eq('breach com posições abertas (sim) → 409', transicao('marcar_breach', sim1, { ...ctxPlana, abertas: 1 }).ok, false)
  sim('breach numa MT5 com «posições» não conta (a corretora decide)', transicao('marcar_breach', { ...sim1, motor: 'mt5' }, { ...ctxPlana, abertas: 3 }).ok)
  eq('breach de quem já está Breached → 409', transicao('marcar_breach', { ...sim1, estado: 'quebrada' }, ctxPlana).ok, false)
  const r = transicao('reverter_breach', { ...sim1, estado: 'quebrada' }, ctxPlana)
  eq('reverter: quebrada → ativa, limpa motivo e data', r.ok ? r.patch : null, { estado: 'ativa', quebrou_regra: null, quebrada_em: null })
  eq('reverter uma activa → 409', transicao('reverter_breach', sim1, ctxPlana).ok, false)
  eq('fechar conta → expirada (Closed)', (() => { const t = transicao('fechar_conta', sim1, ctxPlana); return t.ok && t.patch.estado })(), 'expirada')
  eq('fechar conta com pendentes → 409', transicao('fechar_conta', sim1, { ...ctxPlana, pendentes: 2 }).ok, false)
  eq('avançar fase: Funded não avança', podeAvancarFase({ ...sim1, tipo: 'financiada' }, 0, 0) != null, true)
  eq('avançar fase: desafio activo plano avança', podeAvancarFase(sim1, 0, 0), null)
  eq('avançar fase: com posições não', podeAvancarFase(sim1, 1, 0) != null, true)
}

// ── 4. executor com base de mentira ────────────────────────────────────────
type Registo = { tabela: string; op: string; payload?: unknown; filtros: Array<[string, unknown, unknown]> }
function baseFalsa(opts: { contagens?: Record<string, number>; updateDevolve?: unknown[]; rpc?: unknown } = {}) {
  const registos: Registo[] = []
  const rpcs: Array<{ nome: string; args: unknown }> = []
  const construtor = (tabela: string) => {
    const r: Registo = { tabela, op: 'select', filtros: [] }
    let head = false
    const q: Record<string, unknown> = {}
    const encadear = (nome: string, f?: (...a: unknown[]) => void) => { q[nome] = (...a: unknown[]) => { f?.(...a); return q }; }
    encadear('select', (_c, o) => { if ((o as { head?: boolean })?.head) head = true })
    encadear('insert', (p) => { r.op = 'insert'; r.payload = p })
    encadear('update', (p) => { r.op = 'update'; r.payload = p })
    for (const f of ['eq', 'is', 'in', 'neq', 'gte', 'lte']) encadear(f, (c, v) => r.filtros.push([f, c, v]))
    encadear('order'); encadear('limit')
    const resultado = () => {
      registos.push(r)
      if (head) return { count: opts.contagens?.[tabela] ?? 0, error: null }
      if (r.op === 'update') return { data: opts.updateDevolve ?? [{ id: 'x' }], error: null }
      return { data: null, error: null }
    }
    q.maybeSingle = () => Promise.resolve(resultado())
    q.single = () => Promise.resolve(resultado())
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko)
    return q
  }
  const db = {
    from: (t: string) => construtor(t),
    rpc: (nome: string, args: unknown) => { rpcs.push({ nome, args }); return Promise.resolve({ data: opts.rpc ?? 1234.5, error: null }) },
  }
  return { db: db as never, registos, rpcs }
}
const contaSim = { id: 'c1', estado: 'ativa', motor: 'sim', tipo: 'desafio', sim_saldo: 1000, saldo_inicial: 1000, mt5_login: '77123456', user_id: 'u1' }
async function espera(nome: string, f: () => Promise<unknown>, status: number) {
  try { await f(); eq(nome, 'sem erro', status) } catch (e) { eq(nome, e instanceof ErroAdmin ? e.status : String(e), status) }
}

async function executor() {
  {
    const f = baseFalsa({ rpc: 1250 })
    const r = await executarAccao({ db: f.db, adminId: 'adm', conta: contaSim, agora: 'T' }, { accao: 'ajustar_saldo', delta: 250, motivo: 'compensação de spread' })
    eq('ajustar saldo: uma chamada à função atómica', f.rpcs, [{ nome: 'funded_somar_saldo', args: { p_conta: 'c1', p_delta: 250 } }])
    sim('ajustar saldo: nenhum update de sim_saldo', !f.registos.some((x) => x.op === 'update' && JSON.stringify(x.payload).includes('sim_saldo')))
    eq('ajustar saldo: devolve o saldo da função', r.resposta.saldo, 1250)
  }
  {
    const f = baseFalsa()
    await espera('débito que deixa negativo → 409', () => executarAccao({ db: f.db, adminId: 'adm', conta: contaSim, agora: 'T' }, { accao: 'ajustar_saldo', delta: -1500, motivo: 'estorno' }), 409)
    eq('débito recusado não chama a função', f.rpcs.length, 0)
    await espera('ajustar saldo numa MT5 → 409', () => executarAccao({ db: f.db, adminId: 'adm', conta: { ...contaSim, motor: 'mt5' }, agora: 'T' }, { accao: 'ajustar_saldo', delta: 10, motivo: 'teste' }), 409)
  }
  {
    const f = baseFalsa({ contagens: { funded_positions: 0, funded_orders: 0 } })
    await executarAccao({ db: f.db, adminId: 'adm', conta: contaSim, agora: 'T' }, { accao: 'marcar_breach', motivo: 'fraude' })
    const up = f.registos.find((x) => x.tabela === 'mtm_trading_accounts' && x.op === 'update')
    eq('breach: escreve quebrada', (up?.payload as { estado?: string })?.estado, 'quebrada')
    sim('breach: guarda optimista no estado de partida', Boolean(up?.filtros.some(([op, c, v]) => op === 'eq' && c === 'estado' && v === 'ativa')))
    sim('breach: participante do torneio passa a quebrado', f.registos.some((x) => x.tabela === 'mtm_tournament_participants' && (x.payload as { estado?: string })?.estado === 'quebrado'))
  }
  {
    const f = baseFalsa({ contagens: { funded_positions: 2, funded_orders: 0 } })
    await espera('breach com 2 posições abertas → 409', () => executarAccao({ db: f.db, adminId: 'adm', conta: contaSim, agora: 'T' }, { accao: 'marcar_breach', motivo: 'fraude' }), 409)
    sim('breach recusado não escreve', !f.registos.some((x) => x.op === 'update'))
  }
  {
    const f = baseFalsa({ updateDevolve: [] })
    await espera('reverter quando o motor mexeu entretanto → 409', () => executarAccao({ db: f.db, adminId: 'adm', conta: { ...contaSim, estado: 'quebrada' }, agora: 'T' }, { accao: 'reverter_breach', motivo: 'engano' }), 409)
  }
  {
    const f = baseFalsa()
    await espera('reset sem o login escrito → 400', () => executarAccao({ db: f.db, adminId: 'adm', conta: contaSim, agora: 'T' }, { accao: 'reset', confirmacao: '77000000', motivo: 'pedido do trader' }), 400)
    eq('reset recusado não chama a função', f.rpcs.length, 0)
    await executarAccao({ db: f.db, adminId: 'adm', conta: contaSim, agora: 'T' }, { accao: 'reset', confirmacao: '77123456', motivo: 'pedido do trader' })
    eq('reset: função atómica com o saldo inicial', f.rpcs, [{ nome: 'funded_admin_reset_conta', args: { p_conta: 'c1', p_saldo: 1000 } }])
  }
}

// ── 5. levantamentos ───────────────────────────────────────────────────────
const L = (p: Partial<Omit<ContextoLevantamento, 'conta'>> & { conta?: Partial<ContextoLevantamento['conta']> }): ContextoLevantamento => ({
  abertas: 0, pendentes: 0, jaPagoOutros: 0, valor: 100, estadoAtual: 'pedido', novoEstado: 'aprovado',
  ...p,
  conta: { tipo: 'financiada', estado: 'ativa', motor: 'sim', saldo_inicial: 10000, sim_saldo: 10800, equityMetricas: null, ...(p.conta ?? {}) },
})
// 10.000 → 10.800: lucro 800 − almofada 300 = 500 × 75% = 375 levantáveis.
eq('Funded activa, plana, 100 de 375 → aprova', guardaLevantamento(L({})), null)
eq('375 exactos → aprova', guardaLevantamento(L({ valor: 375 })), null)
sim('376 → recusa (almofada/quota)', String(guardaLevantamento(L({ valor: 376 }))).includes('375.00'))
sim('desafio não levanta', guardaLevantamento(L({ conta: { tipo: 'desafio' } })) != null)
sim('conta Breached não levanta', guardaLevantamento(L({ conta: { estado: 'quebrada' } })) != null)
sim('posição aberta bloqueia', guardaLevantamento(L({ abertas: 1 })) != null)
sim('pendente bloqueia', guardaLevantamento(L({ pendentes: 1 })) != null)
sim('posições desconhecidas (MetaApi calada) bloqueiam', guardaLevantamento(L({ abertas: null, conta: { motor: 'mt5' } })) != null)
sim('saldo exacto manda (não as métricas)', guardaLevantamento(L({ valor: 300, conta: { sim_saldo: 10500, equityMetricas: 20000 } })) != null)
sim('o já pago das outras linhas conta', guardaLevantamento(L({ valor: 375, jaPagoOutros: 100 })) != null)
sim('pagar sem aprovar → recusa', guardaLevantamento(L({ novoEstado: 'pago', estadoAtual: 'em_analise' })) != null)
eq('pagar um aprovado dentro das regras → passa', guardaLevantamento(L({ novoEstado: 'pago', estadoAtual: 'aprovado' })), null)
sim('recusar sem motivo → recusa', guardaLevantamento(L({ novoEstado: 'recusado' })) != null)
eq('recusar com motivo passa mesmo com posições', guardaLevantamento(L({ novoEstado: 'recusado', motivo: 'UID errado', abertas: 3 })), null)
sim('pedido já pago não muda', guardaLevantamento(L({ estadoAtual: 'pago', novoEstado: 'recusado', motivo: 'xxx' })) != null)

// ── 6. validação do corpo ──────────────────────────────────────────────────
eq('sem chave → recusa', validarPedido({ accao: 'retomar', motivo: 'ok ok' }).ok, false)
eq('acção desconhecida → recusa', validarPedido({ accao: 'apagar_tudo', chave: 'abcdefgh12' }).ok, false)
eq('motivo curto → recusa', validarPedido({ accao: 'retomar', motivo: 'a', chave: 'abcdefgh12' }).ok, false)
eq('ajuste zero → recusa', validarPedido({ accao: 'ajustar_saldo', delta: 0, motivo: 'nada nada', chave: 'abcdefgh12' }).ok, false)
eq('reset sem confirmação → recusa', validarPedido({ accao: 'reset', motivo: 'pedido', chave: 'abcdefgh12' }).ok, false)
eq('pedido válido passa', validarPedido({ accao: 'pausar', motivo: 'KYC em falta', chave: 'abcdefgh12' }).ok, true)

// ── 7. CSV e barras ────────────────────────────────────────────────────────
eq('CSV neutraliza fórmulas', paraCsv([{ a: '=HYPERLINK("x")', b: -12.5 }], ['a', 'b']).split('\n')[1], `"'=HYPERLINK(""x"")";-12.5`)
{
  const barras = barrasDeRegras({ regras: { objetivo_pct: 8, perda_diaria_pct: 5, perda_maxima_pct: 10, dias_minimos: 5 }, saldoInicial: 10000, equity: 10400, ancoraDia: 10000, diasNegociados: 2, fase: 1, analise: false })
  eq('barras: objectivo 400/800 = 50%', barras.find((b) => b.chave === 'objetivo')?.pct, 50)
  eq('barras: dias 2/5 = 40%', barras.find((b) => b.chave === 'dias')?.pct, 40)
  eq('barras: perda diária 0% em lucro', barras.find((b) => b.chave === 'diaria')?.pct, 0)
}

executor().then(() => {
  console.log(`admin-conta: ${ok} ok, ${mau} falharam`)
  if (mau) process.exit(1)
}).catch((e) => { console.error(e); process.exit(1) })
