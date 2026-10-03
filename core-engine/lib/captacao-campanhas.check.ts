import assert from 'node:assert/strict'
import {
  ESTADO_RASCUNHO,
  RODAPE,
  SEGMENTOS,
  TIPO_CAMPANHA,
  prepararCampanhas,
  rascunhoUmAUm,
  sequenciaConsentidos,
} from './captacao-campanhas'
import { podeReceber } from './captacao-consentimento'

/**
 * As guardas das campanhas.
 *
 * Duas coisas se prendem aqui, e são as duas que custam caro:
 *   1. Nenhum segmento de ENVIO EM MASSA pode existir sem consentimento.
 *   2. Nada do que sai daqui pode ser gravado num estado que o caminho de envio dispare.
 *
 * E ainda o texto: a voz da casa tem regras duras (nunca prometer lucro, nunca inventar números,
 * prova em pips e não em euros). Um erro de tom num email que vai a centenas de pessoas não se
 * apanha a reler no fim — apanha-se aqui.
 */

// ── 1. Envio em massa só com consentimento ─────────────────────────────────

for (const s of SEGMENTOS) {
  if (s.via !== 'email_massa') continue

  // Se um segmento em massa chegar aqui com outra base legal, está a caminho de mandar emails a
  // gente que nunca pediu nada — e é exactamente assim que um domínio se queima.
  assert.equal(
    s.baseLegal === 'consentimento' || s.bloqueio !== null,
    true,
    `«${s.chave}»: envio em massa sem consentimento tem de estar bloqueado`,
  )

  // Coerência com a decisão real: um segmento em massa desbloqueado tem de passar a mesma porta por
  // onde passa cada pessoa. Se não passasse, teríamos duas regras diferentes para a mesma coisa.
  if (!s.bloqueio) {
    const d = podeReceber({ email: 'a@b.pt', baseLegal: s.baseLegal, retirou: false, ehCliente: false }, s.finalidade)
    assert.ok(d.pode, `«${s.chave}» está aberto mas a regra de consentimento recusa: ${d.porque}`)
  }
}

// Quem não tem consentimento e não está bloqueado não pode existir, em nenhuma via. Um segmento
// aberto é um segmento que alguém vai disparar.
for (const s of SEGMENTOS) {
  if (s.baseLegal !== 'consentimento') {
    assert.ok(s.bloqueio, `«${s.chave}»: sem consentimento tem de trazer o bloqueio escrito`)
    assert.ok(s.bloqueio.trim().length > 20, `«${s.chave}»: o bloqueio tem de dizer o que fazer em vez de enviar`)
  }
}

// Chaves únicas: duas iguais fazem uma campanha sobrepor-se à outra na gravação.
assert.equal(new Set(SEGMENTOS.map((s) => s.chave)).size, SEGMENTOS.length, 'chaves de segmento repetidas')

// Cada segmento tem de dizer QUEM são estas pessoas. Um segmento que ninguém consegue explicar é um
// segmento a que ninguém devia mandar nada.
for (const s of SEGMENTOS) {
  assert.ok(s.quem.trim().length > 40, `«${s.chave}»: falta explicar quem são estas pessoas`)
}

// ── 2. O estado gravado nunca dispara um envio ─────────────────────────────

// O caminho antigo (`app/api/email-marketing/campaigns`) recusa enviar quando o estado é 'sent' ou
// 'sending' e escreve 'draft' quando não há data. 'draft' é o único valor que não sai. Se isto mudar
// para 'scheduled', passa a haver um caminho automático para o envio — e essa é a fronteira toda.
assert.equal(ESTADO_RASCUNHO, 'draft', 'qualquer outro estado abre um caminho para o envio automático')

// E o tipo nunca é 'transactional': esse salta a verificação de preferências no caminho antigo
// (`campaign.type === 'transactional' || allowedUserIds.includes(...)`).
assert.equal(TIPO_CAMPANHA, 'marketing')
assert.notEqual(TIPO_CAMPANHA as string, 'transactional')

// ── 3. O texto ─────────────────────────────────────────────────────────────

const sequencia = sequenciaConsentidos()

// Uma sequência tem de ser uma sequência: ordens seguidas, e nunca dois emails no mesmo dia.
assert.deepEqual(sequencia.map((e) => e.ordem), [1, 2, 3])
assert.equal(sequencia[0].diasDepois, 0, 'o primeiro sai quando a pessoa se inscreve')
for (const e of sequencia.slice(1)) {
  assert.ok(e.diasDepois >= 2, 'menos de dois dias entre emails lê-se como perseguição')
}

/**
 * O que NUNCA pode aparecer num email nosso.
 *
 * As promessas de lucro e os números inventados são as regras duras de `lib/funis-ia.ts`, e o
 * «+7.060€» saiu de toda a comunicação a 26/08 — a prova é em pips e com exemplos por lote, nunca
 * em euros, porque um euro prometido é um euro que alguém vai reclamar.
 */
const PROIBIDO: Array<[RegExp, string]> = [
  [/garantid[oa]/i, 'não se garante nada'],
  [/lucro garantido|ganhos garantidos/i, 'promessa de lucro'],
  [/\d[\d.\s]*€/, 'números em euros — a prova é em pips'],
  [/muda a tua vida|fica rico|dinheiro fácil/i, 'linguagem de guru'],
  [/últim[ao]s?\s+(horas?|minutos?)|termina em \d+ minutos/i, 'urgência inventada'],
  [/sem risco|risco zero/i, 'não existe'],
]

for (const email of sequencia) {
  for (const [padrao, razao] of PROIBIDO) {
    assert.ok(!padrao.test(email.assunto), `assunto ${email.ordem}: ${razao}`)
    assert.ok(!padrao.test(email.corpo), `email ${email.ordem}: ${razao}`)
  }

  // Um assunto longo corta-se no telefone, que é onde isto é lido.
  assert.ok(email.assunto.length <= 60, `assunto ${email.ordem} demasiado longo (${email.assunto.length})`)
  assert.ok(email.assunto.length >= 10)
  // Zero emojis nos assuntos: a marca é premium, e um emoji no assunto é o sinal que os filtros de
  // spam aprenderam a reconhecer.
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(email.assunto), `assunto ${email.ordem} tem emoji`)

  // A saída, em TODOS. Um email de marketing sem forma visível de cancelar faz a pessoa carregar em
  // «isto é spam» — que para a pessoa é igual e para o domínio é muito pior.
  assert.ok(email.corpo.includes(RODAPE), `email ${email.ordem} sem rodapé de cancelamento`)
  assert.ok(email.corpo.includes('{{link_cancelar}}'), `email ${email.ordem} sem link de cancelamento`)
}

// O rodapé diz porque é que a pessoa está a receber isto. Sem essa frase, o email parece comprado.
assert.match(RODAPE, /pediste para receber/)
assert.match(RODAPE, /\{\{link_cancelar\}\}/)

// O terceiro é o único que convida a pagar, e não lidera com o grátis (funil-escada).
assert.ok(sequencia[2].corpo.includes('{{link_membro}}'), 'o convite a Membro é no terceiro email')
assert.ok(!sequencia[0].corpo.includes('{{link_membro}}'), 'não se vende no email de entrega')

// ── 4. Os rascunhos de um a um ─────────────────────────────────────────────

for (const s of SEGMENTOS.filter((x) => x.via === 'um_a_um')) {
  const texto = rascunhoUmAUm(s, 'Nuno')
  assert.ok(texto.includes('Nuno'), `«${s.chave}»: o rascunho tem de tratar a pessoa pelo nome`)
  for (const [padrao, razao] of PROIBIDO) {
    assert.ok(!padrao.test(texto), `rascunho «${s.chave}»: ${razao}`)
  }
  // Curto: uma primeira mensagem com seis linhas lê-se como um panfleto e não se responde.
  assert.ok(texto.length < 700, `rascunho «${s.chave}» demasiado longo (${texto.length})`)

  /**
   * NÃO REVELAR O QUE SABEMOS DA PESSOA.
   *
   * Temos na base o volume em lotes e a comissão que cada conta de IB paga à casa antiga. Escrever
   * isso numa primeira mensagem assusta muito mais do que aproxima — e não é preciso para nada.
   */
  assert.ok(!/lotes|comiss/i.test(texto), `rascunho «${s.chave}»: não se diz à pessoa o que sabemos dela`)
}

// Um segmento que perca o rascunho tem de dizer que não tem, em vez de mandar uma frase genérica
// assinada por nós — que vale menos do que o silêncio.
assert.match(
  rascunhoUmAUm({ ...SEGMENTOS[0], chave: 'inexistente', via: 'um_a_um' }, 'Ana'),
  /sem rascunho automático/,
)

// ── 5. A preparação ────────────────────────────────────────────────────────

// Sem ninguém, nada fica pronto a rever — e diz-se porquê, em vez de o segmento desaparecer.
const vazias = prepararCampanhas([])
assert.equal(vazias.length, SEGMENTOS.length, 'um segmento bloqueado não desaparece da lista')
for (const c of vazias) {
  assert.equal(c.prontaParaRever, false)
  assert.ok(c.porque.trim().length > 10, `«${c.segmento.chave}»: falta dizer porque não está pronta`)
}

// Um segmento bloqueado continua bloqueado por muita gente que tenha lá dentro. É o ponto todo:
// noventa pessoas contactáveis não são noventa pessoas a quem se pode escrever.
const comGente = prepararCampanhas(SEGMENTOS.map((s) => ({ chave: s.chave, pessoas: 90, contactaveis: 90 })))
for (const c of comGente) {
  if (c.segmento.bloqueio) {
    assert.equal(c.prontaParaRever, false, `«${c.segmento.chave}» está bloqueado e apareceu pronto a rever`)
    assert.equal(c.porque, c.segmento.bloqueio)
  } else {
    assert.equal(c.prontaParaRever, true)
  }
}

// Só os segmentos de massa trazem emails. Um segmento de um a um com sequência de email anexada era
// um convite a alguém disparar a sequência para uma lista que veio de uma exportação.
for (const c of comGente) {
  if (c.segmento.via === 'um_a_um') assert.equal(c.emails.length, 0, `«${c.segmento.chave}» não leva emails em massa`)
}

console.log('captacao-campanhas.check: ok')
