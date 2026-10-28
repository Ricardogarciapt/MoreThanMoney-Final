import assert from 'node:assert/strict'
import { blocoDescricao, juntarBloco, DESTINOS_CURTOS } from './descricao'

// O bloco entra no fim, uma vez só, mesmo que se corra por cima duas vezes.
const uma = juntarBloco('Vídeo 1 da Golden Zone.', 'pt')
assert.ok(uma.startsWith('Vídeo 1 da Golden Zone.\n\n▬▬▬▬ Começa aqui'))
assert.equal(juntarBloco(uma, 'pt'), uma)

// Trocar de língua substitui o bloco em vez de empilhar.
const en = juntarBloco(uma, 'en')
assert.ok(en.includes('Start here') && !en.includes('Começa aqui'))
assert.equal((en.match(/▬{16}/g) ?? []).length, 1)

// Os quatro caminhos estão em cada língua, com o disclaimer.
for (const l of ['pt', 'en'] as const) {
  const b = blocoDescricao(l)
  for (const s of [l === 'pt' ? 'registo' : 'start', l === 'pt' ? 'ebook' : 'ebook-en', 'telegram', 'corretora']) {
    assert.ok(b.includes(`morethanmoney.pt/l/${s}`), `${l}: falta /l/${s}`)
    assert.ok(DESTINOS_CURTOS[s], `sem destino para ${s}`)
  }
  assert.ok(/consultoria financeira|financial advice/.test(b))
}

// Limite de 5000 e sem < > (o YouTube recusa).
const longa = juntarBloco('<b>' + 'x'.repeat(6000), 'pt')
assert.ok(longa.length <= 5000 && !/[<>]/.test(longa) && longa.endsWith('▬'.repeat(16)))

console.log('descricao.check ok')
