/**
 * O caminho REST da MetaApi (o rápido, para o Tap to Trade).
 * Correr: npx tsx lib/mtmcopy/__tests__/metaapi-rest.check.ts
 */
import assert from 'node:assert/strict'
import { accaoDaOrdem, lerRespostaOrdem } from '../metaapi-rest'

let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

function main() {
  caso('actionType: mercado, limite e stop, nos dois lados', () => {
    assert.equal(accaoDaOrdem('buy', 'market'), 'ORDER_TYPE_BUY')
    assert.equal(accaoDaOrdem('sell', 'market'), 'ORDER_TYPE_SELL')
    assert.equal(accaoDaOrdem('buy', 'limit'), 'ORDER_TYPE_BUY_LIMIT')
    assert.equal(accaoDaOrdem('sell', 'limit'), 'ORDER_TYPE_SELL_LIMIT')
    assert.equal(accaoDaOrdem('buy', 'stop'), 'ORDER_TYPE_BUY_STOP')
    assert.equal(accaoDaOrdem('sell', 'stop'), 'ORDER_TYPE_SELL_STOP')
  })

  caso('10009 (DONE) é sucesso e traz os ids', () => {
    const r = lerRespostaOrdem({ numericCode: 10009, stringCode: 'TRADE_RETCODE_DONE', orderId: '123', positionId: '456' }, 200)
    assert.deepEqual(r, { ok: true, orderId: '123', positionId: '456' })
  })
  caso('10008 (PLACED) também — é o que uma pendente devolve', () => {
    assert.equal(lerRespostaOrdem({ numericCode: 10008, orderId: '9' }, 200).ok, true)
  })
  caso('sucesso sem positionId fica com null, não undefined', () => {
    const r = lerRespostaOrdem({ numericCode: 10009, orderId: '1' }, 200)
    assert.equal(r.positionId, null)
  })

  caso('recusa da corretora NÃO manda tentar o SDK (o problema não é o cano)', () => {
    const r = lerRespostaOrdem({ numericCode: 10019, stringCode: 'TRADE_RETCODE_NO_MONEY' }, 200)
    assert.equal(r.ok, false)
    assert.equal(r.tentarSdk, undefined)
    assert.match(r.erro!, /NO_MONEY/)
  })
  caso('mercado fechado: a mensagem da corretora chega inteira', () => {
    const r = lerRespostaOrdem({ numericCode: 10018, message: 'Market is closed' }, 200)
    assert.equal(r.erro, 'Market is closed')
  })

  caso('401/403/404 e 5xx mandam tentar o caminho de sempre', () => {
    for (const s of [401, 403, 404, 500, 502, 503]) {
      const r = lerRespostaOrdem({ message: 'x' }, s)
      assert.equal(r.ok, false, `status ${s}`)
      assert.equal(r.tentarSdk, true, `status ${s} devia deixar o SDK tentar`)
    }
  })
  caso('400 da corretora é recusa, não avaria do cano', () => {
    const r = lerRespostaOrdem({ message: 'Invalid stops' }, 400)
    assert.equal(r.tentarSdk, undefined)
  })
  caso('corpo vazio ou lixo não rebenta', () => {
    assert.equal(lerRespostaOrdem(null, 200).ok, false)
    assert.equal(lerRespostaOrdem('nada', 200).ok, false)
    assert.equal(lerRespostaOrdem({ numericCode: 'dez mil' }, 200).ok, false)
  })
  caso('200 sem código nenhum NÃO passa por sucesso', () => {
    assert.equal(lerRespostaOrdem({ ok: true }, 200).ok, false)
  })

  console.log(`\nmetaapi-rest: ${n} verificações certas`)
}

main()
