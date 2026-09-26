import assert from 'node:assert/strict'
import {
  ESTADO_BOM,
  GuardaDeploy,
  JANELA_DEPLOYADA_MS,
  JANELA_UNDEPLOYED_MS,
  aindaVale,
  estadoPermiteLigar,
} from './conta-deployada'

// ── Só DEPLOYED deixa ligar ────────────────────────────────────────────────

assert.equal(estadoPermiteLigar('DEPLOYED'), true)
assert.equal(estadoPermiteLigar('deployed'), true, 'a caixa não pode decidir isto')
for (const mau of ['UNDEPLOYED', 'DEPLOYING', 'UNDEPLOYING', 'DRAFT', '', null, undefined, 42]) {
  assert.equal(estadoPermiteLigar(mau), false, `«${String(mau)}» não é ligar`)
}
assert.equal(ESTADO_BOM, 'DEPLOYED')

// ── A memória: quanto tempo vale cada resposta ─────────────────────────────

const T = 1_000_000
assert.equal(aindaVale(undefined, T), false, 'sem saber, pergunta-se')
assert.equal(aindaVale({ deployada: false, em: T }, T + JANELA_UNDEPLOYED_MS - 1), true)
assert.equal(aindaVale({ deployada: false, em: T }, T + JANELA_UNDEPLOYED_MS + 1), false, 'reabre para se auto-reparar')
assert.equal(aindaVale({ deployada: true, em: T }, T + JANELA_DEPLOYADA_MS - 1), true)
// A DÚVIDA nunca se guarda: guardá-la fazia uma falha de rede calar o motor por 10 minutos.
assert.equal(aindaVale({ deployada: null, em: T }, T + 1), false)
assert.ok(JANELA_UNDEPLOYED_MS <= JANELA_DEPLOYADA_MS, 'reabrir o «não» tem de ser mais rápido do que reabrir o «sim»')

// ── O guarda ───────────────────────────────────────────────────────────────

async function correr() {
  // Não deployada: não se liga, e só se pergunta UMA vez dentro da janela.
  let chamadas = 0
  const undeployed = new GuardaDeploy(async () => { chamadas++; return { state: 'UNDEPLOYED' } })
  assert.equal(await undeployed.podeLigar('c1', T), false)
  assert.equal(await undeployed.podeLigar('c1', T + 1_000), false)
  assert.equal(chamadas, 1, 'insistir na pergunta é o que armava o travão global')
  assert.deepEqual(undeployed.resumo(T).undeployed, ['c1'])
  // Passada a janela volta a perguntar — e se entretanto foi deployada, segue.
  assert.equal(await undeployed.podeLigar('c1', T + JANELA_UNDEPLOYED_MS + 1), false)
  assert.equal(chamadas, 2)

  // Deployada: liga.
  const boa = new GuardaDeploy(async () => ({ state: 'DEPLOYED' }))
  assert.equal(await boa.podeLigar('c2', T), true)
  assert.deepEqual(boa.resumo(T).undeployed, [])

  /**
   * FALHAR A PERGUNTA DEIXA PASSAR. É a decisão certa pela razão prática: o comportamento antigo era
   * ligar sempre, e uma falha de rede não pode ser mais restritiva do que não ter guarda nenhuma —
   * isso transformava um problema de rede numa paragem da gestão de contas que estão boas.
   */
  const semRede = new GuardaDeploy(async () => null)
  assert.equal(await semRede.podeLigar('c3', T), true)
  // E a dúvida não se guarda: pergunta-se de novo à próxima.
  assert.equal(await semRede.podeLigar('c3', T + 1), true)
  assert.equal(semRede.perguntas, 2)

  // Uma conta que deixa de estar deployada volta a ser recusada quando a janela do «sim» expira.
  let estado = 'DEPLOYED'
  const g = new GuardaDeploy(async () => ({ state: estado }))
  assert.equal(await g.podeLigar('c4', T), true)
  estado = 'UNDEPLOYED'
  assert.equal(await g.podeLigar('c4', T + 1_000), true, 'dentro da janela acredita no que sabia')
  assert.equal(await g.podeLigar('c4', T + JANELA_DEPLOYADA_MS + 1), false)

  console.log('motor-real/conta-deployada: OK')
}
void correr()
