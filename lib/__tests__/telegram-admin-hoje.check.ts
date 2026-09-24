/**
 * O «HOJE» — o que este teste trava.
 *
 *  1. CÊNTIMOS NÃO SÃO EUROS. `payment_history.amount` é um inteiro em cêntimos. Um ecrã que o
 *     mostre a dividir por nada anuncia cem vezes a facturação do dia — e ninguém duvida de um
 *     número que está no sítio certo.
 *  2. «NINGUÉM PAGOU» NÃO É «NÃO CONSEGUI LER». Zero às nove da manhã é normal; zero porque a
 *     tabela não respondeu é uma avaria. As duas coisas não podem sair escritas da mesma maneira.
 *  3. SÓ CONTA O QUE ESTÁ `succeeded`. Um pagamento falhado tem valor e tem linha — somá-lo é
 *     inventar receita.
 *
 *   npx tsx lib/__tests__/telegram-admin-hoje.check.ts
 */
import { diaDeLisboa, montarHoje, tecladoHoje, textoHoje, type FontesDeHoje } from '../telegram-admin-hoje'

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const HOJE = Date.parse('2026-09-24T12:00:00Z')

const vazio: FontesDeHoje = {
  pagamentosDeHoje: [],
  pagamentosLidos: true,
  nomes: {},
  aExpirar: [],
  comFalhaDePagamento: [],
  paradas: [],
  sinaisHoje: 0,
  pedidosDeAcesso: 0,
  levantamentosAbertos: 0,
  agoraMs: HOJE,
}

// ── 1. cêntimos → euros, e só o que passou ────────────────────────────────
{
  const h = montarHoje({
    ...vazio,
    nomes: { u1: 'João', u2: 'Ana' },
    pagamentosDeHoje: [
      { user_id: 'u1', amount: 3500, currency: 'eur', status: 'succeeded', plan: 'membro' },
      { user_id: 'u2', amount: 6500, currency: 'eur', status: 'succeeded', plan: 'premium' },
      { user_id: 'u2', amount: 59700, currency: 'eur', status: 'failed', plan: 'elite_annual' },
    ],
  })
  sim('soma em euros, não em cêntimos', h.entrou?.total === 100)
  sim('conta só os que passaram', h.entrou?.quantos === 2)
  sim('e conta os falhados à parte', h.falharam === 1)
  sim('o falhado não entra no total', h.entrou!.total === 100)
  sim('quem pagou vem por valor', h.quemPagou[0].nome === 'Ana' && h.quemPagou[1].nome === 'João')

  const t = textoHoje(h)
  sim('o texto mostra 100,00 €', t.includes('100,00 €'))
  sim('o texto diz que só conta o Stripe', /Só conta o que passou pelo Stripe/.test(t))
}

// ── 2. «não sei» escreve-se diferente de «ninguém» ────────────────────────
{
  const semLeitura = montarHoje({ ...vazio, pagamentosLidos: false })
  sim('leitura falhada → entrou fica a null', semLeitura.entrou === null)
  sim('e o texto diz que não conseguiu ler', /não consegui ler/i.test(textoHoje(semLeitura)))
  sim('e o aviso é outro', semLeitura.avisos.some((a) => /não é zero/.test(a)))

  const diaCalmo = montarHoje(vazio)
  sim('dia sem vendas → zero honesto', diaCalmo.entrou?.quantos === 0)
  sim('e o texto diz «ainda não entrou nada»', /Ainda não entrou nada/.test(textoHoje(diaCalmo)))
}

// ── 3. o que está à espera dele vira botão ────────────────────────────────
{
  const h = montarHoje({ ...vazio, pedidosDeAcesso: 3, levantamentosAbertos: 1 })
  sim('duas filas à espera', h.aMinhaEspera.length === 2)
  const botoes = tecladoHoje(h, [{ text: '⬅️', callback_data: 'admin:menu' }]).inline_keyboard.flat()
  sim('há botão para os depósitos', botoes.some((b) => b.callback_data === 'admin:dep'))
  sim('há botão para os levantamentos', botoes.some((b) => b.callback_data === 'admin:lev'))
  // Nada à espera não pode deixar botões vazios a sugerir trabalho que não existe.
  const calmo = tecladoHoje(montarHoje(vazio), [{ text: '⬅️', callback_data: 'admin:menu' }]).inline_keyboard.flat()
  sim('sem filas, sem botões de fila', !calmo.some((b) => b.callback_data === 'admin:dep'))
}

// ── 4. os que expiram saem por ordem de urgência ──────────────────────────
{
  const h = montarHoje({
    ...vazio,
    aExpirar: [
      { nome: 'Ana', quandoIso: '2026-09-29T00:00:00Z', plano: 'premium' },
      { nome: 'João', quandoIso: '2026-09-25T00:00:00Z', plano: 'membro' },
    ],
  })
  sim('quem expira primeiro aparece primeiro', h.aExpirar[0].nome === 'João')
}

// ── 5. o dia é o de Lisboa (um pagamento à meia-noite e meia não é de ontem) ──
sim('o dia é o de Lisboa', diaDeLisboa(Date.parse('2026-06-30T23:30:00Z')) === '2026-07-01')

if (falhas.length) {
  console.error(`telegram-admin-hoje: ${ok} ok, ${falhas.length} falharam`)
  for (const f of falhas) console.error('  ✗', f)
  process.exit(1)
}
console.log(`telegram-admin-hoje: ${ok} ok, 0 falharam`)
