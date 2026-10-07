/**
 * AJUSTES DE SALDO COM REFERÊNCIA (197) — o que não pode falhar.
 *
 *  · o ajuste grava o histórico com a referência (pela função registada, nunca um update de sim_saldo);
 *  · sem referência (ou com uma fora do formato) o pedido é recusado antes de tocar na base;
 *  · o email ao cliente só sai quando é pedido (caixa marcada ou botão da linha);
 *  · a referência sugerida tem o formato dos créditos de 23/09 (PP260923-PG-200 → DL261007-PG-195);
 *  · o lote mínimo da conta «Todos os sinais» puxa 0,01 para 0,02 e não mexe em lotes maiores;
 *  · a SQL da 197/198 não lê o saldo na aplicação e fecha as funções ao público.
 *
 * Correr: npx tsx lib/mtmfunded/__tests__/ajustes-saldo.check.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validarPedido } from '../admin-conta'
import { executarAccao, type EnviarEmail } from '../admin-conta-accoes'
import { gerarReferencia, iniciaisDoNome, dataDaReferencia, referenciaValida, motivoComReferencia } from '../referencia-ajuste'
import { construirEmailAjuste } from '../email-ajuste-saldo'
import { aplicarLoteMinimo } from '../estrategias-sinais/calculo'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}
const sim = (nome: string, v: boolean) => eq(nome, v, true)
const RAIZ = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

// ── base de mentira: regista rpc/insert/update e responde ao histórico e ao perfil ──
type Registo = { tabela: string; op: string; payload?: unknown }
function base() {
  const registos: Registo[] = []
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = []
  const linhaAjuste = {
    id: 'aj-1', account_id: 'c1', delta: 195, saldo_depois: 2505.8, referencia: 'DL261007-PG-195',
    observacao: 'Divisão de lucros · cópia de trading de 1 a 7 de outubro', estado: 'aplicado', aplicado_em: '2026-10-07T14:13:53Z', criado_em: '2026-10-07T14:13:53Z',
  }
  const from = (tabela: string) => {
    const r: Registo = { tabela, op: 'select' }
    const q: Record<string, unknown> = {}
    const cadeia = (n: string, f?: (...a: unknown[]) => void) => { q[n] = (...a: unknown[]) => { f?.(...a); return q } }
    cadeia('select'); cadeia('eq'); cadeia('in'); cadeia('order'); cadeia('limit')
    cadeia('insert', (p) => { r.op = 'insert'; r.payload = p })
    cadeia('update', (p) => { r.op = 'update'; r.payload = p })
    const res = () => {
      registos.push(r)
      if (r.op !== 'select') return { data: r.op === 'insert' ? { id: 'novo' } : [{ id: 'x' }], error: null }
      if (tabela === 'mtm_funded_ajustes_saldo') return { data: linhaAjuste, error: null }
      if (tabela === 'profiles') return { data: { full_name: 'Pedro Goncalves', email: 'cliente@exemplo.test' }, error: null }
      return { data: null, error: null }
    }
    q.maybeSingle = () => Promise.resolve(res())
    q.single = () => Promise.resolve(res())
    q.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => Promise.resolve(res()).then(a, b)
    return q
  }
  const db = {
    from,
    rpc: (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args })
      return Promise.resolve({ data: { id: 'aj-1', saldo: 2505.8, saldoAntes: 2310.8, delta: args.p_delta }, error: null })
    },
  }
  return { db: db as never, registos, rpcs }
}
const conta = { id: 'c1', estado: 'ativa', motor: 'sim', tipo: 'real', sim_saldo: 2310.8, saldo_inicial: 1984, mt5_login: '77915116', user_id: 'u1' }
const corpoPedro = {
  accao: 'ajustar_saldo', delta: 195, referencia: 'DL261007-PG-195', origem: 'DL',
  observacao: 'Divisão de lucros · cópia de trading de 1 a 7 de outubro', chave: 'abcdefgh12',
}

async function correr() {
  // ── 1. o ajuste grava o histórico com a referência ────────────────────────
  {
    const v = validarPedido(corpoPedro)
    sim('pedido do Pedro é válido', v.ok)
    if (!v.ok) return
    eq('motivo da auditoria no formato «… · REF …»', 'motivo' in v.pedido ? v.pedido.motivo : null, 'Divisão de lucros · cópia de trading de 1 a 7 de outubro · REF DL261007-PG-195')
    const f = base()
    const enviados: string[] = []
    const espiao: EnviarEmail = async (para) => { enviados.push(para) }
    const r = await executarAccao({ db: f.db, adminId: 'adm', adminEmail: 'dono@exemplo.test', conta, agora: 'T', enviarEmail: espiao }, v.pedido)
    eq('uma só chamada: a função que regista', f.rpcs.map((x) => x.nome), ['funded_ajustar_saldo_registado'])
    eq('a referência vai para o histórico', f.rpcs[0].args.p_referencia, 'DL261007-PG-195')
    eq('a observação vai para o histórico', f.rpcs[0].args.p_observacao, 'Divisão de lucros · cópia de trading de 1 a 7 de outubro')
    eq('quem fez vai para o histórico', [f.rpcs[0].args.p_admin_id, f.rpcs[0].args.p_admin_email], ['adm', 'dono@exemplo.test'])
    sim('nenhum update de sim_saldo pela aplicação', !f.registos.some((x) => x.op === 'update' && JSON.stringify(x.payload).includes('sim_saldo')))
    eq('devolve antes e depois', [r.resposta.saldoAntes, r.resposta.saldo], [2310.8, 2505.8])
    // ── 3. sem pedido, sem email ───────────────────────────────────────────
    eq('sem a caixa marcada NÃO sai email', enviados.length, 0)
    eq('a resposta diz que não foi pedido', r.resposta.email, 'nao_pedido')
  }

  // ── 2. sem referência é recusado ──────────────────────────────────────────
  {
    const { referencia: _r, ...semRef } = corpoPedro
    eq('sem referência → recusa', validarPedido(semRef).ok, false)
    eq('referência vazia → recusa', validarPedido({ ...corpoPedro, referencia: '   ' }).ok, false)
    eq('referência com HTML → recusa', validarPedido({ ...corpoPedro, referencia: '<b>X</b>' }).ok, false)
    eq('referência curta → recusa', validarPedido({ ...corpoPedro, referencia: 'AB' }).ok, false)
    eq('transferência sem referência → recusa', validarPedido({ accao: 'transferir_saldo', destino: '77720210', valor: null, chave: 'abcdefgh12' }).ok, false)
    eq('reposição sem referência → recusa', validarPedido({ accao: 'repor_saldo_negativo', alvo: 1000, chave: 'abcdefgh12' }).ok, false)
    const sql = ler('supabase/migrations/197_funded_ajustes_saldo_e_arquivo.sql')
    sim('a base também recusa sem referência (função)', sql.includes("raise exception 'referência obrigatória'"))
    sim('a base também recusa sem referência (coluna not null + check)', /referencia text not null check/.test(sql))
  }

  // ── 3b. com a caixa marcada (ou botão), sai UM email, ao dono da conta ─────
  {
    const v = validarPedido({ ...corpoPedro, enviarEmail: true })
    if (!v.ok) { eq('pedido com email válido', v.ok, true); return }
    const f = base()
    const enviados: Array<{ para: string; assunto: string; html: string }> = []
    const espiao: EnviarEmail = async (para, m) => { enviados.push({ para, assunto: m.subject, html: m.html }) }
    const r = await executarAccao({ db: f.db, adminId: 'adm', conta, agora: 'T', enviarEmail: espiao }, v.pedido)
    eq('com a caixa marcada sai um email', enviados.length, 1)
    eq('vai para o email do dono da conta', enviados[0]?.para, 'cliente@exemplo.test')
    sim('o email leva a referência', Boolean(enviados[0]?.html.includes('DL261007-PG-195')))
    sim('o email leva o saldo novo', Boolean(enviados[0]?.html.includes('2505,80') || enviados[0]?.html.includes('2 505,80') || enviados[0]?.html.includes('2505.80')))
    eq('estado do envio na resposta', r.resposta.email, 'enviado')
    sim('marca a linha do histórico como enviada', f.registos.some((x) => x.tabela === 'mtm_funded_ajustes_saldo' && x.op === 'update' && JSON.stringify(x.payload).includes('"email_estado":"enviado"')))

    const f2 = base()
    const enviados2: string[] = []
    const v2 = validarPedido({ accao: 'email_ajuste', ajusteId: '11111111-1111-1111-1111-111111111111', chave: 'abcdefgh12' })
    if (!v2.ok) { eq('email_ajuste válido', v2.ok, true); return }
    await executarAccao({ db: f2.db, adminId: 'adm', conta, agora: 'T', enviarEmail: async (p) => { enviados2.push(p) } }, v2.pedido)
    eq('o botão «Enviar email» de uma linha manda um', enviados2.length, 1)
    eq('o botão não mexe no saldo', f2.rpcs.length, 0)
  }

  // ── 4. a referência ───────────────────────────────────────────────────────
  eq('iniciais Pedro Goncalves', iniciaisDoNome('Pedro Goncalves'), 'PG')
  eq('iniciais com acentos e 3 nomes', iniciaisDoNome('Fábio José Rodrigues'), 'FR')
  eq('data em AAMMDD (Lisboa)', dataDaReferencia(new Date('2026-10-07T12:00:00Z')), '261007')
  eq('meia-noite e meia em Lisboa já é o dia seguinte', dataDaReferencia(new Date('2026-10-07T23:30:00Z')), '261008')
  eq('a do Pedro', gerarReferencia({ origem: 'DL', data: new Date('2026-10-07T12:00:00Z'), nome: 'Pedro Goncalves', valor: 195 }), 'DL261007-PG-195')
  eq('igual à antiga da PU Prime', gerarReferencia({ origem: 'PP', data: new Date('2026-09-23T12:00:00Z'), nome: 'Pedro Goncalves', valor: 200 }), 'PP260923-PG-200')
  eq('prefixo longo com hífen', gerarReferencia({ origem: 'MTM-CAP', data: new Date('2026-09-23T12:00:00Z'), nome: 'Rui Rocha', valor: 6000 }), 'MTM-CAP-260923-RR-6000')
  sim('as antigas continuam válidas', ['PP260923-SV-125', 'PAMM-VT-260923-NM-1200', 'TR261007-RG-77181835'].every(referenciaValida))
  eq('motivo sem observação usa a descrição da origem', motivoComReferencia('PP', 'PP260923-PG-200'), 'PUPRIME-MT5-TO-MTMFUNDED · REF PP260923-PG-200')

  // ── 5. o template do email ────────────────────────────────────────────────
  {
    const m = construirEmailAjuste({ nome: 'Pedro Goncalves', login: '77915116', delta: 195, referencia: 'DL261007-PG-195', observacao: 'Divisão <b>x</b>', saldoNovo: 2505.8, em: new Date('2026-10-07T14:13:53Z') })
    sim('assunto com a referência', m.subject.includes('DL261007-PG-195'))
    sim('casca da marca (ouro sobre carvão)', m.html.includes('#D2A63C') && m.html.includes('#08080b'))
    sim('observação escapada', m.html.includes('Divisão &lt;b&gt;x&lt;/b&gt;') && !m.html.includes('<b>x</b>'))
    sim('sem passwords', !/password|palavra-passe/i.test(m.html))
    sim('texto simples também leva tudo', m.text.includes('+195,00 USD') && m.text.includes('2505,80 USD') || m.text.includes('2 505,80 USD'))
  }

  // ── 6. lote mínimo («Todos os sinais») ────────────────────────────────────
  const xau = { volume_min: 0.01, volume_step: 0.01, volume_max: 50 }
  eq('0,01 sobe para 0,02', aplicarLoteMinimo(0.01, 0.02, xau), 0.02)
  eq('0,10 fica 0,10', aplicarLoteMinimo(0.1, 0.02, xau), 0.1)
  eq('sem mínimo fica como veio', aplicarLoteMinimo(0.01, null, xau), 0.01)
  eq('passo de 0,1 arredonda para cima', aplicarLoteMinimo(0.1, 0.02, { volume_min: 0.1, volume_step: 0.1, volume_max: 10 }), 0.1)
  sim('todos-os-sinais passa o lote mínimo da conta', ler('lib/mtmfunded/estrategias-sinais/todos-os-sinais.ts').includes('accountId, loteMinimo'))

  // ── 7. a SQL ──────────────────────────────────────────────────────────────
  {
    const a = ler('supabase/migrations/197_funded_ajustes_saldo_e_arquivo.sql')
    const b = ler('supabase/migrations/198_contas_limpeza_plano.sql')
    sim('ajuste: o antes sai do depois devolvido pela função atómica', a.includes('v_depois := public.funded_somar_saldo(p_conta, p_delta);') && a.includes('v_antes := v_depois - p_delta;'))
    sim('transferência: tranca as duas linhas por ordem de id', a.includes('order by id for update'))
    sim('transferência: débito e crédito pela função atómica', a.includes('public.funded_somar_saldo(p_origem, -v_valor)') && a.includes('public.funded_somar_saldo(p_destino, v_valor)'))
    sim('nenhum update directo de sim_saldo na 197', !/set\s+sim_saldo/i.test(a))
    sim('nenhum update directo de sim_saldo na 198', !/sim_saldo\s*=/i.test(b))
    for (const fn of ['funded_ajustar_saldo_registado', 'funded_transferir_saldo', 'funded_repor_saldo_negativo', 'funded_arquivar_conta', 'funded_desarquivar_conta']) {
      sim(`${fn}: fechada a anon/authenticated`, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`).test(a))
    }
    for (const fn of ['limpeza_executar', 'limpeza_rejeitar', 'limpeza_bloqueio']) {
      sim(`${fn}: fechada a anon/authenticated`, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`).test(b))
    }
    sim('limpeza: só executa linhas pendentes', b.includes("if l.estado <> 'pendente' then"))
    sim('limpeza: apagar só depois de arquivada', b.includes('arquiva primeiro'))
  }
}

correr().then(() => {
  console.log(`ajustes-saldo: ${ok} ok, ${mau} falharam`)
  if (mau) process.exit(1)
}).catch((e) => { console.error(e); process.exit(1) })
