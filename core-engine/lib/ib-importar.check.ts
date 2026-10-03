import assert from 'node:assert/strict'
import {
  CORRETORAS,
  CORRETORA_NOME,
  data,
  detectarFormato,
  estadoInicial,
  importar,
  numero,
  pesoDaConta,
  type ContaImportada,
} from './ib-importar'

/**
 * As guardas do importador de corretoras.
 *
 * Usam linhas REAIS das quatro exportações que o dono colou. É de propósito: um importador testado
 * com dados inventados por mim passa sempre, porque eu invento no formato que o meu código espera.
 * Uma vírgula decimal mal lida aqui é dinheiro mal pago a uma pessoa.
 */

for (const c of CORRETORAS) assert.ok(CORRETORA_NOME[c], `corretora sem nome: ${c}`)

// ── Números: cada corretora escreve à sua maneira ───────────────────────────

// PU Prime e VT Markets: vírgula decimal.
assert.equal(numero('-11,77', true), -11.77)
assert.equal(numero('160,54', true), 160.54)
assert.equal(numero('1.246,22', true), 1246.22, 'milhares com ponto e decimal com vírgula')
// Infinox e Hantec: ponto decimal.
assert.equal(numero('12474.48000000', false), 12474.48)
assert.equal(numero('1,727.32', false), 1727.32, 'milhares com vírgula e decimal com ponto')
// A moeda vem colada ao valor na coluna de depósito.
assert.equal(numero('100(USD)', true), 100)
assert.equal(numero('2000(USC)', true), 2000)
assert.equal(numero('220(USD)', true), 220)
// Vazios e marcadores não são zero — são desconhecido.
for (const v of ['', ' ', '-', 'N/A', 'n/a', undefined]) {
  assert.equal(numero(v, true), null, `«${v}» tinha de ser desconhecido, não zero`)
}
// O erro que isto existe para impedir: ler vírgula decimal com as regras do ponto.
assert.notEqual(numero('-11,77', false), -11.77)

// ── Datas ───────────────────────────────────────────────────────────────────

assert.equal(data('2026-06-11'), '2026-06-11')
assert.equal(data('2023-12-07 12:59:16'), '2023-12-07', 'a hora não interessa, o dia sim')
assert.equal(data('2026-01-28 23:43:45'), '2026-01-28')
for (const v of ['', '-', 'N/A', undefined]) assert.equal(data(v), null, 'vazio nunca pode virar hoje')

// ── Cada exportação é reconhecida pelo seu cabeçalho ────────────────────────

const CAB_PU = 'DATA\tID de usuário\tConta\tFonte da campanha\tNome\tProprietário da conta\tTIPO DE CONTA\tPLATAFORMA\tMOEDA BASE\tLucro\tSALDO\tEquidade da Conta\tCrédito\tJornada da Conta\tData da Última Negociação\tÚltimo Instrumento Negociado\tÚltimos lotes negociados\tData do Último Depósito\tMontante do Último Depósito\tID de afiliado superior'
const CAB_VT = 'Date\tUser ID\tAccount\tCampaign source\tAccount type\tPlatform\tBase currency\tProfit\tMargin Level(%)\tBalance\tAccount Equity\tCredit\tAccount Journey\tLast Trade Date\tLast Traded Instrument\tLast Traded Lots\tLast Deposit Date\tLast Deposit Amount'
const CAB_HANTEC = 'Acc.\tPlatform\tServer\tTier\tIB ID\tName\tEmail\tPhone\tBalance\tEquity\tCampaign\tReg. Date\tDeposits\tWithdrawals\tVol. Traded\tComm. Paid\tComm. Unpaid'
const CAB_INFX_CLI = 'First Name\tLast Name\tEmail\tPhone\tLots\tIs IB\tDeposits, USD\tWithdrawals, USD\tBalance, USD\tCommission, USD'
const CAB_INFX_REF = 'Account\tIs Verified\tReferral\tCountry Of Residence\tReg. Date\tCommissioned Lots\tCommission Received, USD\tBalance'

assert.equal(detectarFormato(CAB_PU), 'pu_prime')
assert.equal(detectarFormato(CAB_VT), 'vtmarkets')
assert.equal(detectarFormato(CAB_HANTEC), 'hantec')
assert.equal(detectarFormato(CAB_INFX_CLI), 'infinox_clientes')
assert.equal(detectarFormato(CAB_INFX_REF), 'infinox_referencias')
assert.equal(detectarFormato('uma coisa qualquer\tsem sentido'), null)

// ── PU Prime: uma linha real ────────────────────────────────────────────────

const puPrime = importar(
  CAB_PU +
    '\n' +
    '2026-09-02\t2056173\t35249554\t\tPedro Goncalves\tSubtil Garcia Ricardo\tCopyTrading Standard\tMT5\tUSD\t\t120,54\t160,54\t40\tFinanciada\t\t\t\t2026-09-23\t100(USD)\t7526800',
)
assert.equal(puPrime.formato, 'pu_prime')
assert.equal(puPrime.linhas.length, 1)
const pg = puPrime.linhas[0]
assert.equal(pg.conta, '35249554')
assert.equal(pg.cliente_nome, 'Pedro Goncalves')
assert.equal(pg.saldo, 120.54, 'vírgula decimal da PU Prime')
assert.equal(pg.equity, 160.54)
assert.equal(pg.moeda, 'USD')
assert.equal(pg.ib_externo, '7526800')
assert.equal(pg.ultimo_deposito, '2026-09-23')
assert.equal(pg.depositos_usd, 100)
// Está na casa: não há nada a trazer.
assert.equal(estadoInicial(pg), 'na_casa')

/**
 * O ID DA PESSOA, que estava a ser deitado fora.
 *
 * É ele que agrupa várias contas ao mesmo cliente. Sem ele, as 33 contas da PU Prime parecem 33
 * clientes quando são cerca de oito pessoas com várias contas cada. Um painel que diz 33 onde há
 * 8 não está a arredondar — está a contar outra coisa, e saem decisões de negócio daqui.
 */
assert.equal(pg.cliente_externo_id, '2056173')
assert.equal(pg.jornada, 'Financiada')
assert.equal(pg.credito, 40)

// Duas contas com IDs de usuário diferentes são duas pessoas; com o mesmo ID, é uma só.
const duasContas = importar(
  CAB_PU +
    '\n2026-08-24\t702278\t34744057\t\tSubtil Garcia Ricardo\tSubtil Garcia Ricardo\tMT5 Standard\tMT5\tUSD\t\t0\t0\t0\tTrading em 30 dias\t2026-09-14\tXAUUSD.s\t0.01 Standard\t\t\t7526800' +
    '\n2026-08-24\t702278\t34744071\t\tSubtil Garcia Ricardo\tSubtil Garcia Ricardo\tMT5 Standard\tMT5\tUSD\t\t0\t0\t0\tTrading em 30 dias\t2026-09-04\tXAUUSD.s\t0.01 Standard\t\t\t7526800',
)
assert.equal(duasContas.linhas.length, 2, 'duas contas')
assert.equal(
  new Set(duasContas.linhas.map((l) => l.cliente_externo_id)).size,
  1,
  'mas uma pessoa só — é isto que o ID de usuário existe para dizer',
)

// A campanha diz quem veio de nós. Só duas contas da PU Prime a têm, e é informação que não se
// consegue recuperar de mais lado nenhum.
const comCampanha = importar(
  CAB_PU +
    '\n2026-09-03\t2165879\t35251909\tmorethanmoney\tMario Oliveira\tSubtil Garcia Ricardo\tCopyTrading Standard\tMT5\tUSD\t\t0\t0\t0\tFinanciada\t\t\t\t2026-09-03\t350(USD)\t7526800',
)
assert.equal(comCampanha.linhas[0].campanha, 'morethanmoney')

// ── Hantec: a conta com mais volume da exportação ───────────────────────────

const hantec = importar(
  CAB_HANTEC +
    '\n' +
    '50130263\tMT5\t1\t1\t19350\tFabio Henriques\thenriques-fabio@protonmail.com\t911062665\t0.23\t0.23\tPIP LAT-MUL_68\t2025-11-07 18:54:09\t1619.93\t0\t24.31\t151.39\t0',
)
assert.equal(hantec.formato, 'hantec')
const fh = hantec.linhas[0]
assert.equal(fh.corretora, 'hantec')
assert.equal(fh.conta, '50130263')
assert.equal(fh.cliente_email, 'henriques-fabio@protonmail.com')
assert.equal(fh.ib_externo, '19350')
assert.equal(fh.volume_lotes, 24.31)
assert.equal(fh.depositos_usd, 1619.93)
assert.equal(fh.comissao_usd, 151.39, 'paga mais por pagar')
// Fora da casa e com dinheiro mexido: é conversa a ter.
assert.equal(estadoInicial(fh), 'a_transitar')
assert.equal(fh.tier, '1')
assert.equal(fh.campanha, 'PIP LAT-MUL_68')
assert.equal(fh.levantamentos_usd, 0)

/**
 * OS LEVANTAMENTOS mudam a história.
 *
 * Esta conta depositou 6300 — e levantou 7710. Sem a coluna dos levantamentos, o painel diria
 * «depositou 6300 USD» e alguém trataria esta pessoa como um cliente a crescer, quando o dinheiro
 * já saiu todo. O líquido é negativo, e é essa a verdade.
 */
const comLevantamentos = importar(
  CAB_HANTEC +
    '\n50108924\tMT5\t1\t1\t19350\tRui Rodrigues\trui.pmcr@gmail.com\t+351968350028\t0.0\t0.0\tPIP LAT-MUL_68\t2025-07-20 01:53:36\t6300.0\t-7710.94\t133.22\t623.23\t0',
)
const rui = comLevantamentos.linhas[0]
assert.equal(rui.depositos_usd, 6300)
assert.equal(rui.levantamentos_usd, -7710.94)
assert.ok((rui.depositos_usd ?? 0) + (rui.levantamentos_usd ?? 0) < 0, 'o líquido é negativo')

// Linhas da Hantec sem dados nenhuns (as `N/A`) não podem virar zeros nem datas de hoje.
const hantecVazia = importar(
  CAB_HANTEC + '\n' + '50136784\tMT5\t1\t2\t20268\tN/A\tN/A\tN/A\tN/A\tN/A\t\t2025-12-16 20:43:43\tN/A\tN/A\tN/A\t4.09\t0',
)
const hv = hantecVazia.linhas[0]
assert.equal(hv.cliente_nome, null)
assert.equal(hv.saldo, null, 'N/A é desconhecido, não zero')
assert.equal(hv.registo, '2025-12-16')
assert.equal(hv.comissao_usd, 4.09)
assert.equal(estadoInicial(hv), 'a_transitar', 'gerou comissão, logo mexeu')

// ── Infinox: clientes (sem número de conta) e referências ───────────────────

const infxCli = importar(
  CAB_INFX_CLI +
    '\n' +
    'Cayo Washington\tMagni\tcayomagni@gmail.com\t351913471226\t0.00000000\tNo\t0\t0\t3.2\t0' +
    '\n' +
    'Fabiano\tda Silva\t\t921123456\t0.00000000\tNo\t0\t0\t0\t0',
)
assert.equal(infxCli.formato, 'infinox_clientes')
assert.equal(infxCli.linhas.length, 1, 'sem email não há como identificar a pessoa')
assert.equal(infxCli.ignoradas, 1)
const cayo = infxCli.linhas[0]
assert.equal(cayo.conta, 'email:cayomagni@gmail.com', 'a chave é o email, que é estável entre exportações')
assert.equal(cayo.cliente_nome, 'Cayo Washington Magni')
assert.equal(cayo.saldo, 3.2)
assert.equal(cayo.volume_lotes, 0)
// Saldo sem volume, sem depósito e sem comissão: não vale o tempo da equipa.
assert.equal(estadoInicial(cayo), 'a_fechar')

const infxRef = importar(
  CAB_INFX_REF +
    '\n' +
    '87916410\tYes\tCayo Washington Magni\tPortugal\t2025-05-09 12:07:41\t228.43000000\t696.93 USD\t0.5700000000 EUR',
)
assert.equal(infxRef.formato, 'infinox_referencias')
const ref = infxRef.linhas[0]
assert.equal(ref.conta, '87916410')
assert.equal(ref.cliente_nome, 'Cayo Washington Magni')
assert.equal(ref.volume_lotes, 228.43)
assert.equal(ref.comissao_usd, 696.93, 'o «USD» colado ao número não pode estragar a leitura')
assert.equal(ref.registo, '2025-05-09')
assert.equal(estadoInicial(ref), 'a_transitar', '228 lotes é exactamente o que se quer trazer')
assert.equal(ref.pais, 'Portugal')

// ── VT Markets ──────────────────────────────────────────────────────────────

const vt = importar(
  CAB_VT +
    '\n' +
    '2026-04-08\t1888958\t27343219\t\tStandard STP\tMT5\tUSD\t216,7\t2862,16\t1246,22\t1950,28\t500\tTrading in 30 days\t2026-09-24\tXAUUSD-STD\t0.01 Standard\t2026-04-08\t500(USD)',
)
assert.equal(vt.formato, 'vtmarkets')
const v = vt.linhas[0]
assert.equal(v.conta, '27343219')
assert.equal(v.saldo, 1246.22)
assert.equal(v.equity, 1950.28)
assert.equal(v.depositos_usd, 500)
assert.equal(v.ultima_negociacao, '2026-09-24')
assert.equal(v.cliente_externo_id, '1888958')
assert.equal(v.jornada, 'Trading in 30 days')
assert.equal(v.lucro, 216.7)
assert.equal(v.ultimo_instrumento, 'XAUUSD-STD')
assert.equal(estadoInicial(v), 'a_transitar')

// ── A ordem por que a equipa trabalha isto ──────────────────────────────────

const comVolume: ContaImportada = { ...ref }
const semNada: ContaImportada = { ...cayo }
assert.ok(pesoDaConta(comVolume) > pesoDaConta(semNada), 'o volume tem de mandar na ordem')

// ── Recusas honestas ────────────────────────────────────────────────────────

const semCabecalho = importar('2026-09-02\t123\t456')
assert.equal(semCabecalho.linhas.length, 0)
assert.match(String(semCabecalho.erro), /cabeçalho/i, 'tem de dizer o que fazer, não só que falhou')

const vazio = importar('')
assert.equal(vazio.linhas.length, 0)
assert.ok(vazio.erro)

// Um cabeçalho certo sem dados nenhuns não é um erro — é um ficheiro vazio.
const soCabecalho = importar(CAB_PU)
assert.ok(soCabecalho.erro, 'sem linhas de dados avisa-se')

console.log('ib-importar: OK')
