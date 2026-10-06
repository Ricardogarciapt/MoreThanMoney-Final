import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENTE_DO_PASSO, PALAVRAS_DE_GRATIS, linkDoPasso, proximoPassoPago, textoDoToque, type PassoPago } from './escada-followup'
import { linkTemAg } from '@/lib/agentes/codigos'
import { prepararMensagem } from '@/lib/agentes/mensagem-saida'

/**
 * Guarda do follow-up do Telegram (F4, 06/10): o passo principal é SEMPRE pago e segue a escada.
 * Nenhum follow-up oferece algo grátis como passo principal.
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('MAU: nenhum texto de follow-up oferece grátis/trial/teste', () => {
  for (const p of ['membro', 'corretora'] as PassoPago[]) {
    for (const t of [1, 2, 3]) {
      const tx = textoDoToque(p, t, 'Ana')
      assert.ok(!PALAVRAS_DE_GRATIS.test(tx), `${p}/${t} oferece grátis: ${tx}`)
    }
  }
})
caso('MAU: a palavra proibida é apanhada (a guarda não é decorativa)', () => {
  for (const mau of ['começa grátis', 'trial de 3 dias', 'sem cartão', 'teste da app', 'gratuito', '0€']) {
    assert.ok(PALAVRAS_DE_GRATIS.test(mau), mau)
  }
})
caso('a escada: quem não deu nada → Membro; Membro ou com UID → corretora; depósito validado → nada', () => {
  assert.equal(proximoPassoPago({ ehMembro: false, temContaCorretora: false, depositoValidado: false }), 'membro')
  assert.equal(proximoPassoPago({ ehMembro: true, temContaCorretora: false, depositoValidado: false }), 'corretora')
  assert.equal(proximoPassoPago({ ehMembro: false, temContaCorretora: true, depositoValidado: false }), 'corretora')
  assert.equal(proximoPassoPago({ ehMembro: true, temContaCorretora: true, depositoValidado: true }), null)
})
caso('MAU: um Membro nunca recebe outra vez a oferta de Membro', () => {
  assert.notEqual(proximoPassoPago({ ehMembro: true, temContaCorretora: false, depositoValidado: false }), 'membro')
})
caso('o link é do passo pago, assinado pelo dono da oferta (nunca AG-SAAS)', () => {
  for (const p of ['membro', 'corretora'] as PassoPago[]) {
    const l = linkDoPasso(p)
    assert.ok(linkTemAg(l), l)
    assert.ok(l.includes(`ag=${AGENTE_DO_PASSO[p]}`), l)
    assert.ok(!l.includes('AG-SAAS'), l)
    for (const t of [1, 2, 3]) assert.ok(textoDoToque(p, t).includes(l))
  }
  assert.ok(linkDoPasso('membro').includes('plano=membro'), 'o Membro abre no pack pago, não no teste')
})
caso('o texto marcado pela porta de saída mantém o dono da oferta', () => {
  const tx = textoDoToque('membro', 1, 'Ana')
  const r = prepararMensagem({ canal: 'telegram', texto: tx, funil: 'telegram:followup', codigoExplicito: AGENTE_DO_PASSO.membro })
  assert.ok(!r.texto.includes('AG-SAAS'))
  assert.ok(r.texto.includes('ag=AG-FORMACAO'))
})
caso('o cron do follow-up usa a escada e já não o trial nem o modelo', () => {
  const src = readFileSync(join(__dirname, '..', 'telegram-lead-followup.ts'), 'utf8')
  assert.ok(src.includes('proximoPassoPago') && src.includes('textoDoToque'))
  for (const proibido of ['TRIAL_DAYS', 'api.anthropic.com', "'/register'", 'AG-SAAS']) {
    assert.ok(!src.includes(proibido), `o follow-up ainda usa ${proibido}`)
  }
})
console.log(`escada-followup: ${n} casos — o follow-up empurra sempre o passo pago ✓`)
