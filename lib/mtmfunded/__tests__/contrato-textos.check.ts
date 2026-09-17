/**
 * Textos legais do MTM Funded alinhados com a decisão de 17/09: desafio/avaliação e torneio são
 * simulados; a conta Funded é negociação de capital patrocinado MTM (contém negociação real).
 * Os números do contrato não mudam com a redacção.
 *
 *   npx tsx lib/mtmfunded/__tests__/contrato-textos.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAPITAL_REAL_PCT, CONTRATO_VERSAO, CONTRATO_VERSOES_ACEITES, QUOTA_TRADER, textoDoContrato } from '../contrato'

let ok = 0
function t(nome: string, f: () => void) {
  try { f(); ok++ } catch (e) { console.error(`✗ ${nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}
const RAIZ = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

t('contrato v3: Funded = capital patrocinado MTM, desafios/torneios simulados', () => {
  // A versão subiu: quem assinou a v2 fica com o texto que leu (linha própria na base).
  assert.equal(CONTRATO_VERSAO, '2026-09-v3')
  const txt = textoDoContrato({ nome: 'Rui Silva', saldo: 10000 })
  assert.ok(txt.includes('Versão 2026-09-v3'))
  assert.ok(txt.includes('NEGOCIAÇÃO DE CAPITAL PATROCINADO MTM'))
  assert.ok(txt.includes('contém negociação'))
  assert.match(txt, /desafio\/avaliação e de torneio[\s\S]*SIMULADAS/)
  assert.ok(!/do princípio ao fim/i.test(txt), 'a frase antiga saiu')
  assert.ok(!/conta de negociação SIMULADA/.test(txt), 'o objecto já não diz que a conta Funded é simulada')
})

t('contrato: os números são os mesmos de sempre', () => {
  assert.equal(CAPITAL_REAL_PCT, 0.10)
  assert.equal(QUOTA_TRADER, 0.75)
  const txt = textoDoContrato({ nome: 'Rui Silva', saldo: 10000 })
  const pct = [...new Set(txt.match(/\d+%/g))].sort()
  assert.deepEqual(pct, ['10%', '25%', '3%', '75%'].sort())
  for (const n of ['10.000 USD', '1.000 USD', '18 anos', '75/25', 'USDC', 'Solana', 'PU Prime']) assert.ok(txt.includes(n), n)
  // Com as 11 cláusulas de sempre (nada acrescentado).
  assert.deepEqual(txt.match(/^\d+\. /gm), ['1. ', '2. ', '3. ', '4. ', '5. ', '6. ', '7. ', '8. ', '9. ', '10. ', '11. '])
})

t('Aviso de Risco e Termos sem «simulada do princípio ao fim»', () => {
  const risco = ler('app/mtmfunded/legal/risco/page.tsx')
  const termos = ler('app/mtmfunded/legal/termos/page.tsx')
  for (const s of [risco, termos, ler('lib/i18n/messages/mtmfunded.ts')]) {
    assert.ok(!/simulada do princípio ao fim|simulated from start to finish/i.test(s))
  }
  assert.ok(risco.includes('negociação de capital patrocinado MTM'))
  assert.ok(risco.includes('contém negociação real'))
  assert.ok(risco.includes('As contas de torneio e de avaliação são simuladas'))
  assert.ok(termos.includes('capital patrocinado MTM'))
})

console.log(`contrato-textos: ${ok} verificações ${process.exitCode ? 'com FALHAS' : 'ok'}`)

// Decisão do dono (17/09): assinaturas v2 valem como contrato em vigor, sem nova assinatura.
{
  assert.deepEqual([...CONTRATO_VERSOES_ACEITES], ['2026-09-v2', '2026-09-v3'])
  for (const f of ['app/api/mtmfunded/contrato/route.ts', 'app/api/mtmfunded/levantamentos/route.ts']) {
    const src = readFileSync(f, 'utf8')
    assert.ok(!src.includes(".eq('versao', CONTRATO_VERSAO)"), `${f} não pode exigir só a versão actual`)
    assert.ok(src.includes('CONTRATO_VERSOES_ACEITES'), `${f} aceita as versões em vigor`)
  }
  console.log('ok  assinaturas v2 continuam válidas')
}
