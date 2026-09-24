/**
 * `npx tsx lib/broker/__tests__/dados-corretora.check.ts`
 *
 * Estes testes protegem o que custou dois meses de rota da corretora a zero (medido a 2026-09-24):
 *  - 58 de 59 clientes com `deposits_usd` = 0, porque a importação escreveu zeros em vez de
 *    recusar um ficheiro sem a coluna dos depósitos;
 *  - dados de 66 dias que ninguém viu envelhecer;
 *  - dois leads com acesso cujo UID não existe em `broker_clients`, em grace permanente.
 *
 * Por isso os casos mais importantes aqui não são os felizes: são "recusa quando falta a coluna",
 * "célula vazia não apaga o que está guardado" e "o que não vem no ficheiro não desaparece".
 */

import assert from 'node:assert/strict'
import {
  ALIASES,
  DIAS_AVISO_FRESCURA,
  DIAS_LIMITE_FRESCURA,
  analisarCsvCorretora,
  avaliarFrescura,
  avaliarUidLead,
  chaveColuna,
  detetarSeparador,
  dividirLinha,
  fundirComGuardados,
  impactoNoAcesso,
  leadsSemCorrespondencia,
  lerNumero,
  validarUidBroker,
} from '@/lib/broker/dados-corretora'
import { MIN_DEPOSIT, looksLikeBrokerUid } from '@/lib/telegram-broker-gate'

// ── UIDs ─────────────────────────────────────────────────────────────────────────────────────
assert.deepEqual(validarUidBroker('100041585'), { ok: true, uid: '100041585' })
assert.deepEqual(validarUidBroker(' #100041585 '), { ok: true, uid: '100041585' })
assert.deepEqual(validarUidBroker('"100041585"'), { ok: true, uid: '100041585' })
assert.deepEqual(validarUidBroker('100041585.0'), { ok: true, uid: '100041585' }, 'o Excel transforma o UID em float')
assert.equal(validarUidBroker('1234').ok, false, 'curto de mais')
assert.equal(validarUidBroker('1234567890123').ok, false, 'longo de mais')
assert.equal(validarUidBroker('ABC12345').ok, false)
assert.equal(validarUidBroker('').ok, false)
assert.equal(validarUidBroker('Total').ok, false, 'a linha de totais do rodapé não pode virar cliente')

// Os limites TÊM de ser os mesmos que o bot aceita. Se divergirem, há gente aceite pelo bot que o
// importador nunca reconhece (ou ao contrário) — e o sintoma é gente em limbo sem explicação.
for (const uid of ['12345', '123456789012', '100041585', '1234', '1234567890123', 'abc', '']) {
  assert.equal(!!looksLikeBrokerUid(uid), validarUidBroker(uid).ok, `o bot e o importador discordam sobre "${uid}"`)
}

// ── UID do lead vs. UIDs do broker (o buraco dos dois leads em grace) ─────────────────────────
{
  const conhecidos = ['100041585', '100255066', '35251909']
  const casa = avaliarUidLead('100041585', conhecidos)
  assert.equal(casa.casa, true)
  assert.equal(casa.aviso, null)

  // O caso real: 7 dígitos quando os nossos têm 8 ou 9 → provável engano a escrever.
  const curto = avaliarUidLead('2165879', conhecidos)
  assert.equal(curto.casa, false)
  assert.equal(curto.comprimentoTipico, false)
  assert.match(String(curto.aviso), /engano/i)

  // O outro caso real: comprimento plausível mas inexistente → pode ser só dados velhos.
  const plausivel = avaliarUidLead('333076465', conhecidos)
  assert.equal(plausivel.casa, false)
  assert.equal(plausivel.comprimentoTipico, true)
  assert.match(String(plausivel.aviso), /velhos/i)

  const fora = leadsSemCorrespondencia(
    [
      { chat_id: '1', broker_uid: '100041585' },
      { chat_id: '2', broker_uid: '2165879' },
      { chat_id: '3', broker_uid: null },
    ],
    conhecidos,
  )
  assert.equal(fora.length, 1)
  assert.equal(fora[0].chat_id, '2')
}

// ── Frescura ─────────────────────────────────────────────────────────────────────────────────
{
  const agora = Date.parse('2026-09-24T12:00:00Z')
  const hà = (dias: number) => new Date(agora - dias * 86_400_000).toISOString()

  assert.equal(avaliarFrescura(null, agora).estado, 'sem_dados')
  assert.equal(avaliarFrescura(hà(3), agora).estado, 'fresco')
  assert.equal(avaliarFrescura(hà(DIAS_AVISO_FRESCURA), agora).estado, 'a_envelhecer')
  assert.equal(avaliarFrescura(hà(DIAS_LIMITE_FRESCURA), agora).estado, 'velho')

  // O estado real medido a 2026-09-24: export de 20/07, 66 dias.
  const real = avaliarFrescura('2026-07-20T20:47:37Z', agora)
  assert.equal(real.estado, 'velho')
  assert.equal(real.dias, 65)
  assert.match(real.mensagem, /grace/)

  // Avisar DEPOIS do precipício não serve de nada.
  assert.ok(DIAS_AVISO_FRESCURA < DIAS_LIMITE_FRESCURA, 'o aviso tem de vir antes do limite')
}

// ── Números como os exports os dão ───────────────────────────────────────────────────────────
assert.equal(lerNumero('350'), 350)
assert.equal(lerNumero('1,234.56'), 1234.56, 'convenção anglo-saxónica')
assert.equal(lerNumero('1.234,56'), 1234.56, 'convenção europeia')
assert.equal(lerNumero('$350.00'), 350)
assert.equal(lerNumero('350 USD'), 350)
assert.equal(lerNumero('350,5'), 350.5)
assert.equal(lerNumero('1,234'), 1234, 'três dígitos depois da vírgula = milhares')
assert.equal(lerNumero('(120.50)'), -120.5, 'contabilidade escreve negativos entre parênteses')
assert.equal(lerNumero('-120.50'), -120.5)
assert.equal(lerNumero(30.87), 30.87)
// O ponto central: vazio NÃO é zero.
for (const vazio of ['', '   ', '-', 'N/A', null, undefined]) {
  assert.equal(lerNumero(vazio), null, `"${vazio}" tem de dar null, não 0`)
}

// ── CSV ──────────────────────────────────────────────────────────────────────────────────────
assert.deepEqual(dividirLinha('a,"b,c",d', ','), ['a', 'b,c', 'd'])
assert.deepEqual(dividirLinha('a,"diz ""olá""",c', ','), ['a', 'diz "olá"', 'c'])
assert.equal(detetarSeparador('a;b;c\n1;2;3'), ';', 'exports europeus saem com ponto-e-vírgula')
assert.equal(detetarSeparador('a,b,c\n1,2,3'), ',')
assert.equal(chaveColuna('Total Deposit (USD)'), 'totaldepositusd')
assert.equal(chaveColuna('Depósitos'), 'depositos')

// O ficheiro como a corretora o dá: BOM, preâmbulo antes do cabeçalho, linha de totais no fim.
{
  const csv =
    '﻿PU Prime — IB Client Report\r\n' +
    'Generated: 2026-09-24\r\n' +
    '\r\n' +
    'Client UID,First Name,Last Name,Email,Total Deposit,Balance\r\n' +
    '100041585,Ana,Silva,ana@ex.pt,"1,250.00","980.40"\r\n' +
    '100255066,Bruno,Costa,bruno@ex.pt,350,350\r\n' +
    '100999111,Carla,,carla@ex.pt,,120\r\n' +
    'Total,,,,"1,600.00","1,450.40"\r\n'
  const r = analisarCsvCorretora(csv)
  assert.equal(r.ok, true, r.erro ?? '')
  assert.equal(r.separador, ',')
  assert.equal(r.linhas.length, 3)
  assert.equal(r.ignoradas.length, 1, 'a linha "Total" é ignorada, não vira cliente')
  assert.match(r.ignoradas[0].motivo, /UID inválido/)
  assert.equal(r.mapeamento.deposits_usd, 'Total Deposit')
  assert.equal(r.mapeamento.balance_usd, 'Balance')
  assert.equal(r.linhas[0].deposits_usd, 1250)
  assert.equal(r.linhas[0].balance_usd, 980.4)
  assert.equal(r.linhas[2].deposits_usd, null, 'célula vazia → null, nunca 0')
  assert.equal(r.linhas[2].last_name, null)
}

// O ficheiro europeu, com ';' e vírgula decimal.
{
  const r = analisarCsvCorretora('UID;Nome;Depósitos;Saldo\n100041585;Ana;1.250,00;980,40\n')
  assert.equal(r.ok, true, r.erro ?? '')
  assert.equal(r.separador, ';')
  assert.equal(r.linhas[0].deposits_usd, 1250)
  assert.equal(r.linhas[0].balance_usd, 980.4)
}

// A RECUSA que faltava: sem coluna de depósitos, o ficheiro não entra.
{
  const r = analisarCsvCorretora('Client UID,Name,Balance\n100041585,Ana,980\n')
  assert.equal(r.ok, false)
  assert.match(String(r.erro), /DEPÓSITOS/)
  assert.match(String(r.erro), /Balance/, 'o erro diz que colunas viu, para se saber o que acrescentar')
  assert.equal(r.linhas.length, 0, 'não entra NADA — nem sequer os saldos')
  // Com o guarda desligado explicitamente, aí sim passa (é uma decisão de quem chama).
  const forcado = analisarCsvCorretora('Client UID,Name,Balance\n100041585,Ana,980\n', { exigirDepositos: false })
  assert.equal(forcado.ok, true)
  assert.equal(forcado.linhas[0].deposits_usd, null)
}

// Sem coluna de UID não há ficheiro nenhum.
{
  const r = analisarCsvCorretora('Qualquer,Coisa\n1,2\n')
  assert.equal(r.ok, false)
  assert.match(String(r.erro), /UID/)
}

// Duplicados: fica o último, mas diz-se quais foram.
{
  const r = analisarCsvCorretora('UID,Deposit,Balance\n100041585,100,100\n100041585,500,500\n')
  assert.equal(r.linhas.length, 1)
  assert.equal(r.linhas[0].deposits_usd, 500)
  assert.deepEqual(r.duplicados, ['100041585'])
}

// O depósito BRUTO ganha ao líquido quando o ficheiro traz os dois — com os nomes literais do
// Funds/Rebate Report da PU Prime, que é como o ficheiro vai mesmo chegar.
{
  const r = analisarCsvCorretora(
    'User ID,Account Number,Gross Deposit,Withdrawals,Net Deposit,Balance,Account Equity,Currency,Status\n' +
      '100041585,100041585,"1,200.00",300.00,"900.00","880.10","875.00",USD,Active\n',
  )
  assert.equal(r.ok, true, r.erro ?? '')
  assert.equal(r.mapeamento.deposits_usd, 'Gross Deposit')
  assert.equal(r.linhas[0].deposits_usd, 1200)
  assert.equal(r.mapeamento.balance_usd, 'Balance', 'o saldo ganha à equity: a equity oscila com posições abertas')
  assert.equal(r.linhas[0].balance_usd, 880.1)
}

// ── Fusão: o que não vem no ficheiro não desaparece ───────────────────────────────────────────
{
  const guardados = [
    { uid: '100041585', first_name: 'Ana', deposits_usd: 1000, balance_usd: 900, email: 'ana@ex.pt' },
    { uid: '100255066', first_name: 'Bruno', deposits_usd: 350, balance_usd: 350 },
    { uid: '100777222', first_name: 'Dora', deposits_usd: 5000, balance_usd: 4800 },
  ]
  const doFicheiro = [
    { uid: '100041585', first_name: 'Ana', last_name: null, email: null, deposits_usd: 1400, balance_usd: 900 },
    { uid: '100255066', first_name: null, last_name: null, email: null, deposits_usd: null, balance_usd: null },
    { uid: '100888333', first_name: 'Eva', last_name: null, email: null, deposits_usd: 700, balance_usd: 700 },
  ]
  const f = fundirComGuardados(doFicheiro, guardados)

  assert.equal(f.novos, 1)
  assert.equal(f.alterados, 1)
  assert.equal(f.iguais, 1)

  const ana = f.paraGravar.find((l) => l.uid === '100041585')!
  assert.equal(ana.estado, 'alterado')
  assert.equal(ana.deposits_usd, 1400)
  assert.equal(ana.email, 'ana@ex.pt', 'o email guardado não se perde só porque o ficheiro não o traz')
  assert.ok(ana.alteracoes.some((a) => a.includes('1000→1400')))

  // O caso que zerou 58 clientes em julho: células vazias a passarem por cima de valores bons.
  const bruno = f.paraGravar.find((l) => l.uid === '100255066')!
  assert.equal(bruno.estado, 'igual')
  assert.equal(bruno.deposits_usd, 350, 'célula vazia NÃO zera o depósito guardado')
  assert.equal(bruno.balance_usd, 350)
  assert.equal(bruno.first_name, 'Bruno')

  // E o essencial: um export parcial não faz desaparecer quem não vem nele.
  assert.deepEqual(f.ausentesDoFicheiro, ['100777222'])
  assert.equal(f.paraGravar.some((l) => l.uid === '100777222'), false, 'quem falta no ficheiro fica intocado')
}

// ── O aviso antes de gravar ──────────────────────────────────────────────────────────────────
{
  const paraGravar = fundirComGuardados(
    [
      { uid: '100041585', first_name: null, last_name: null, email: null, deposits_usd: 900, balance_usd: 900 },
      { uid: '100255066', first_name: null, last_name: null, email: null, deposits_usd: 400, balance_usd: 12 },
    ],
    [],
  ).paraGravar
  const leads = [
    { chat_id: '1', broker_uid: '100041585', username: 'ana' },
    { chat_id: '2', broker_uid: '100255066', first_name: 'Bruno' },
    { chat_id: '3', broker_uid: '2165879', first_name: 'Carlos' },
  ]
  const i = impactoNoAcesso(leads, paraGravar, { revogacao: 300, validacao: MIN_DEPOSIT })

  assert.deepEqual(i.passamAValidar.map((x) => x.quem), ['@ana'])
  assert.deepEqual(i.passamASerRevogaveis.map((x) => x.quem), ['Bruno'], 'saldo $12 com dados frescos = revogável')
  assert.deepEqual(i.continuamSemCorrespondencia.map((x) => x.quem), ['Carlos'])
}

// ── Aliases ──────────────────────────────────────────────────────────────────────────────────
// Sem estas três listas o importador não serve para nada, e uma lista vazia passaria despercebida.
for (const campo of ['uid', 'deposits_usd', 'balance_usd']) {
  assert.ok(ALIASES[campo]?.length, `faltam aliases para ${campo}`)
}
assert.ok(
  ALIASES.deposits_usd.indexOf('grossdeposit') < ALIASES.deposits_usd.indexOf('netdeposit'),
  'o depósito bruto tem de ganhar ao líquido: quem depositou e levantou depositou à mesma',
)
assert.ok(
  ALIASES.balance_usd.indexOf('balance') < ALIASES.balance_usd.indexOf('accountequity'),
  'o saldo tem de ganhar à equity',
)

console.log('✓ dados-corretora: CSV, frescura, UIDs e fusão sem perdas')
