/**
 * DEPÓSITOS E LEVANTAMENTOS — o que este teste trava.
 *
 * Dois incidentes reais, escritos em forma de teste:
 *
 *  · O ZERO QUE NÃO ERA UM ZERO. `broker_clients.deposits_usd` estava a zero em 58 dos 59 clientes
 *    porque a coluna nunca foi mapeada. Um ecrã que leia esse zero e escreva «não atingiu o
 *    mínimo» repete o erro no momento exacto em que uma pessoa está a decidir. Um valor em falta
 *    tem de dizer «não sei», e um zero em dados velhos também.
 *
 *  · A REGRA QUE SÓ UM DOS LADOS CONHECIA. O bloqueio de 12 meses do capital da casa estava só na
 *    rota do TRADER: o cliente via a regra, quem aprovava não. Aprovar um levantamento de uma
 *    conta bloqueada era possível, e não dava erro nenhum.
 *
 * E ainda o limite dos 64 bytes do `callback_data` — um botão que passa dele é rejeitado pelo
 * Telegram em silêncio, e quem toca fica a olhar para um ecrã que não responde.
 *
 *   npx tsx lib/__tests__/telegram-admin-dinheiro.check.ts
 */
import {
  DESTINOS,
  LETRA_DO_DESTINO,
  MOTIVOS_DE_RECUSA,
  avaliarLevantamento,
  confirmacaoDeposito,
  confirmacaoLevantamento,
  lerDeposito,
  tecladoDeposito,
  tecladoLevantamento,
  textoLevantamento,
  type PedidoDeLevantamento,
} from '../telegram-admin-dinheiro'

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const MIN = 350
const base = { frescura: 'fresco' as const, diasDosDados: 2, minimoUsd: MIN }

// ── 1. o zero que não é um zero ────────────────────────────────────────────
{
  sim('sem UID → não sei', lerDeposito({ ...base, uid: null, corretora: null }).certeza === 'nao_sei')

  sim(
    'UID fora da lista → não sei (não «não depositou»)',
    lerDeposito({ ...base, uid: '10123456', corretora: null }).certeza === 'nao_sei',
  )

  const semValor = lerDeposito({ ...base, uid: '10123456', corretora: { deposits_usd: null } })
  sim('depósito a null → não sei', semValor.certeza === 'nao_sei')
  sim('e diz em voz alta que não é zero', semValor.frase.includes('Não é zero'))
  sim('e nunca inventa um valor', semValor.valorUsd === null)

  // O caso que fechou o funil dois meses: zero escrito por um importador que não via a coluna.
  const zeroVelho = lerDeposito({
    uid: '10123456',
    corretora: { deposits_usd: 0 },
    frescura: 'velho',
    diasDosDados: 66,
    minimoUsd: MIN,
  })
  sim('zero em dados velhos → não sei', zeroVelho.certeza === 'nao_sei')
  sim('e manda importar um export novo', /export novo/i.test(zeroVelho.frase))

  // Num export fresco, um zero é um zero: aí sim decide.
  sim('zero em dados frescos → abaixo', lerDeposito({ ...base, uid: '1', corretora: { deposits_usd: 0 } }).certeza === 'abaixo')

  const chega = lerDeposito({ ...base, uid: '1', corretora: { deposits_usd: MIN } })
  sim('exactamente o mínimo → confirmado', chega.certeza === 'confirmado')
  sim('e só aí é automático', chega.automatico === true)
  sim('abaixo do mínimo nunca é automático', lerDeposito({ ...base, uid: '1', corretora: { deposits_usd: MIN - 1 } }).automatico === false)
  sim('não sei nunca é automático', semValor.automatico === false)
}

// ── 2. dois toques, e o que não acontece ───────────────────────────────────
{
  const teclado = tecladoDeposito('123456789', [{ text: '⬅️', callback_data: 'admin:menu' }])
  const decisoes = teclado.inline_keyboard.flat().filter((b) => b.callback_data?.startsWith('admin:dep'))
  sim('a lista só pergunta (?)', decisoes.length === 2 && decisoes.every((b) => b.callback_data!.includes('dep?')))

  for (const aprovar of [true, false]) {
    const c = confirmacaoDeposito({
      aprovar,
      chatIdLead: '123456789',
      nome: 'João',
      leitura: lerDeposito({ ...base, uid: '1', corretora: { deposits_usd: MIN } }),
    })
    sim(`confirmação (${aprovar ? 'aprovar' : 'recusar'}) leva ao !`, c.teclado.inline_keyboard[0][0].callback_data!.includes('dep!'))
    sim(`confirmação (${aprovar ? 'aprovar' : 'recusar'}) diz que não mexe em dinheiro`, /não mexe em dinheiro/i.test(c.texto))
  }
}

// ── 3. os levantamentos: a regra tem de ser dita ───────────────────────────
const HOJE = Date.parse('2026-09-24T12:00:00Z')

function pedido(over: Partial<PedidoDeLevantamento['conta']> = {}, resto: Partial<PedidoDeLevantamento> = {}): PedidoDeLevantamento {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    valorUsd: 500,
    estado: 'pedido',
    uidBroker: '10123456',
    criadoEm: '2026-09-20T09:00:00Z',
    conta: {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      login: '77661181',
      tipo: 'financiada',
      estado: 'ativa',
      motor: 'sim',
      saldoInicial: 10_000,
      simSaldo: 12_000,
      equityMetricas: null,
      metricas: {},
      ...over,
    },
    jaPagoOutros: 0,
    abertas: 0,
    pendentes: 0,
    ...resto,
  }
}

{
  const livre = avaliarLevantamento(pedido(), 'aprovado', undefined, HOJE)
  sim('conta limpa e valor dentro do levantável → aprova', livre.pode === true)

  // O bloqueio de 12 meses: existia, e quem decidia não o via.
  const preso = pedido({ metricas: { bloqueio_levantamento_ate: '2027-09-10T00:00:00Z' } })
  const v = avaliarLevantamento(preso, 'aprovado', undefined, HOJE)
  sim('capital com prazo → NÃO aprova', v.pode === false)
  sim('e diz a data em vez de recusar em silêncio', /10\/09\/2027/.test(String(v.porque)))
  sim('e traz a regra escrita para se poder explicar', /12 meses/.test(String(v.regra)))
  sim('mas recusar continua a ser possível', avaliarLevantamento(preso, 'recusado', MOTIVOS_DE_RECUSA.b, HOJE).pode === true)
  sim('o ecrã do pedido mostra o cadeado', /não levanta até/.test(textoLevantamento(preso, HOJE)))

  // Na dúvida não se paga: sem leitura das posições, não há aprovação.
  sim('posições por confirmar → não aprova', avaliarLevantamento(pedido({}, { abertas: null, pendentes: null }), 'aprovado', undefined, HOJE).pode === false)
  sim('posições abertas → não aprova', avaliarLevantamento(pedido({}, { abertas: 2 }), 'aprovado', undefined, HOJE).pode === false)
  sim('pagar sem aprovar → não', avaliarLevantamento(pedido({}, { estado: 'pedido' }), 'pago', undefined, HOJE).pode === false)
  sim('recusar sem motivo → não', avaliarLevantamento(pedido(), 'recusado', '', HOJE).pode === false)
  sim(
    'valor acima do levantável → não',
    avaliarLevantamento(pedido({}, { valorUsd: 9_000 }), 'aprovado', undefined, HOJE).pode === false,
  )
}

// ── 4. os botões cabem nos 64 bytes do Telegram ────────────────────────────
{
  const VOLTAR = [{ text: '⬅️ Painel', callback_data: 'admin:menu' }]
  const todos = [
    ...tecladoLevantamento(pedido(), VOLTAR).inline_keyboard.flat(),
    ...tecladoLevantamento(pedido({}, { estado: 'aprovado' }), VOLTAR).inline_keyboard.flat(),
    ...confirmacaoLevantamento(pedido(), 'aprovado').teclado.inline_keyboard.flat(),
    ...confirmacaoLevantamento(pedido(), 'recusado').teclado.inline_keyboard.flat(),
    ...tecladoDeposito('123456789', VOLTAR).inline_keyboard.flat(),
  ]
  const grandes = todos.filter((b) => b.callback_data && Buffer.byteLength(b.callback_data, 'utf8') > 64)
  sim(`nenhum callback_data passa dos 64 bytes (${grandes.map((b) => b.callback_data).join(', ')})`, grandes.length === 0)
  sim('e há botões que testar', todos.length > 8)
}

// ── 5. recusar exige escolher um motivo, e o motivo é o segundo toque ─────
{
  const c = confirmacaoLevantamento(pedido(), 'recusado')
  const motivos = c.teclado.inline_keyboard.flat().filter((b) => b.callback_data?.includes('lv!r:'))
  sim('a recusa oferece motivos prontos', motivos.length === Object.keys(MOTIVOS_DE_RECUSA).length)
  sim('cada motivo é já o toque que faz', motivos.every((b) => b.callback_data!.includes('lv!')))
  sim('e o texto diz que não mexe em dinheiro', /Não mexe em dinheiro/i.test(c.texto))
  sim('todos os motivos passam a guarda dos 3 caracteres', Object.values(MOTIVOS_DE_RECUSA).every((m) => m.trim().length >= 3))
}

// ── 6. as letras dos destinos batem certo nos dois sentidos ────────────────
for (const [letra, destino] of Object.entries(DESTINOS)) {
  sim(`${letra} ↔ ${destino}`, LETRA_DO_DESTINO[destino] === letra)
}

if (falhas.length) {
  console.error(`telegram-admin-dinheiro: ${ok} ok, ${falhas.length} falharam`)
  for (const f of falhas) console.error('  ✗', f)
  process.exit(1)
}
console.log(`telegram-admin-dinheiro: ${ok} ok, 0 falharam`)
