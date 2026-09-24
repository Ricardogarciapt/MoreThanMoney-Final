/**
 * PRONTIDÃO PARA FECHO — o que este teste trava.
 *
 * Um sistema de pontuação morre de duas maneiras, e as duas são silenciosas:
 *
 *   1. O número deixa de se explicar. Alguém junta um bónus, os pontos sobem, e ao fim de um mês
 *      ninguém sabe porquê — a lista deixa de se ler. Por isso testa-se que a SOMA dos critérios
 *      é exactamente a pontuação, sem parcelas escondidas.
 *
 *   2. O próximo passo aponta para o degrau errado. Dizer a quem ainda não abriu conta na
 *      corretora que «falta ligar a conta ao copiador» é falar-lhe de um degrau que ele não vê —
 *      e ele deixa de responder. Por isso testa-se a ORDEM da escada, degrau a degrau.
 *
 *   npx tsx lib/__tests__/pontuacao-fecho.check.ts
 */
import assert from 'node:assert/strict'
import { prontidaoDeFecho, proximoPasso, type DadosDeFecho } from '../prospecao/pontuacao-fecho'

/** Um lead que não deu passo nenhum. Tudo o resto é este, com uma coisa mudada. */
const ZERO: DadosDeFecho = {
  falouEmPrivado: false,
  interesse: null,
  estado: null,
  passoMtmAuto: null,
  uidCorretora: null,
  uidConfirmado: false,
  depositoUsd: null,
  temConta: false,
  contaACopiar: false,
  pagante: false,
  diasSemSinal: null,
  seguimentosSemResposta: 0,
}

function com(mudanca: Partial<DadosDeFecho>): DadosDeFecho {
  return { ...ZERO, ...mudanca }
}

// ── 1. O número explica-se: é a soma dos critérios e nada mais ──
{
  const casos: DadosDeFecho[] = [
    ZERO,
    com({ falouEmPrivado: true, interesse: 'mtmauto', uidCorretora: '100041585' }),
    com({
      falouEmPrivado: true,
      interesse: 'ecossistema',
      uidCorretora: '100041585',
      uidConfirmado: true,
      depositoUsd: 400,
      temConta: true,
      estado: 'granted',
    }),
    com({ falouEmPrivado: true, diasSemSinal: 60, seguimentosSemResposta: 3 }),
  ]
  for (const c of casos) {
    const r = prontidaoDeFecho(c)
    const soma = r.criterios.reduce((s, x) => s + x.pontos, 0)
    assert.equal(
      r.pontos,
      Math.max(0, Math.min(100, soma)),
      'a pontuação tem de ser a soma dos critérios — nada de bónus escondidos',
    )
    assert.ok(r.criterios.length > 0, 'nunca há pontuação sem critérios à vista')
    assert.ok(r.proximoPasso.length > 10, 'o próximo passo nunca pode vir vazio')
  }
}

// ── 2. Quem não escreveu ao bot NÃO é acionável pelo sistema ──
// É a parede da API do Telegram, não uma opção de desenho. Se este teste cair, alguém construiu
// por cima um "enviar a todos" que o Telegram vai recusar — ou pior, aceitar e banir o bot.
{
  const a = prontidaoDeFecho(com({ falouEmPrivado: false, uidConfirmado: true, depositoUsd: 900 }))
  assert.equal(a.acionavelPeloSistema, false)
  assert.match(a.proximoPasso, /não lhe pode escrever primeiro|Abordagem tua/i)

  const b = prontidaoDeFecho(com({ falouEmPrivado: true }))
  assert.equal(b.acionavelPeloSistema, true)
}

// ── 3. Depositar vale mais do que dizer que sim ──
// A regra do negócio em forma de teste: dinheiro que já saiu da conta dela pesa mais do que
// qualquer declaração de intenção.
{
  const falou = prontidaoDeFecho(com({ falouEmPrivado: true, interesse: 'ecossistema', temConta: true }))
  const depositou = prontidaoDeFecho(com({ falouEmPrivado: true, uidCorretora: '1', uidConfirmado: true, depositoUsd: 350 }))
  assert.ok(depositou.pontos > falou.pontos, 'quem depositou tem de estar à frente de quem só falou')
}

// ── 4. Escrever um UID não é ter conta na corretora ──
// Foi o que aconteceu em produção: 59 clientes importados da corretora e UM a casar com um perfil.
// Os números que as pessoas escrevem não são os números que a corretora exporta.
{
  const escreveu = prontidaoDeFecho(com({ falouEmPrivado: true, uidCorretora: '18599' }))
  const confirmado = prontidaoDeFecho(com({ falouEmPrivado: true, uidCorretora: '100041585', uidConfirmado: true }))
  assert.ok(confirmado.pontos > escreveu.pontos)
  assert.match(escreveu.proximoPasso, /não bate certo|ainda não bate/i)
}

// ── 5. A escada anda por ordem: cada degrau só aparece quando o anterior está feito ──
{
  const base = { falouEmPrivado: true, interesse: 'ecossistema' as const }

  assert.match(proximoPasso(com({ falouEmPrivado: true })), /caminho/i)
  assert.match(proximoPasso(com(base)), /corretora|UID/i)
  assert.match(proximoPasso(com({ ...base, uidCorretora: '1', uidConfirmado: true })), /depósito|depositar|encalha/i)
  assert.match(
    proximoPasso(com({ ...base, uidCorretora: '1', uidConfirmado: true, depositoUsd: 500 })),
    /conta no site|registo/i,
  )
  assert.match(
    proximoPasso(com({ ...base, uidCorretora: '1', uidConfirmado: true, depositoUsd: 500, temConta: true })),
    /copiar|ligar/i,
  )
}

// ── 6. Os estados do funil que exigem acção DO DONO ganham a tudo o resto ──
// Um pedido pendente é a única coisa em que o lead já fez a parte dele e espera por nós.
{
  assert.match(
    proximoPasso(com({ falouEmPrivado: true, estado: 'pending_review', uidCorretora: '1' })),
    /aprovação|Pendentes/i,
  )
  assert.match(proximoPasso(com({ falouEmPrivado: true, estado: 'awaiting_proof', uidCorretora: '7' })), /print/i)
  assert.match(proximoPasso(com({ falouEmPrivado: true, estado: 'revoked' })), /recuperar|perdeu/i)
}

// ── 7. Quem já paga sai da lista de fecho ──
{
  const r = prontidaoDeFecho(com({ falouEmPrivado: true, pagante: true, temConta: true, depositoUsd: 900 }))
  assert.equal(r.nivel, 'pagante')
  assert.match(r.proximoPasso, /retenção/i)
}

// ── 8. Arrefecer custa pontos, e diz-se porquê ──
{
  const quente = prontidaoDeFecho(com({ falouEmPrivado: true, interesse: 'mtmauto', uidCorretora: '1', uidConfirmado: true, diasSemSinal: 1 }))
  const frio = prontidaoDeFecho(com({ falouEmPrivado: true, interesse: 'mtmauto', uidCorretora: '1', uidConfirmado: true, diasSemSinal: 90, seguimentosSemResposta: 3 }))
  assert.ok(frio.pontos < quente.pontos)
  const penalizacoes = frio.criterios.filter((c) => c.pontos < 0)
  assert.equal(penalizacoes.length, 2, 'as penalizações também têm de aparecer na lista, não só no total')
  for (const p of penalizacoes) assert.ok(p.porque.length > 5, 'uma penalização sem motivo é um número mágico')
}

// ── 9. A escala não sai de 0–100 ──
// Um número fora da escala deixa de se comparar com o da semana passada.
{
  const tudo = prontidaoDeFecho(
    com({
      falouEmPrivado: true,
      interesse: 'mtmauto',
      passoMtmAuto: 'validado',
      uidCorretora: '1',
      uidConfirmado: true,
      depositoUsd: 5000,
      temConta: true,
      contaACopiar: true,
      diasSemSinal: 0,
    }),
  )
  assert.ok(tudo.pontos <= 100 && tudo.pontos >= 0)
  const nada = prontidaoDeFecho(com({ diasSemSinal: 400, seguimentosSemResposta: 9 }))
  assert.ok(nada.pontos >= 0, 'nunca negativo — a lista ordena-se, não se envergonha')
}

console.log('✅ pontuacao-fecho: os critérios somam, a escada anda por ordem e o bot não escreve a estranhos')
