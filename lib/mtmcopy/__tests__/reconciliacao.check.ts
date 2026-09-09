/**
 * A regra que impede a reconciliação de fazer estragos.
 *
 * NÃO CONSEGUIR LER NÃO É PROVA DE QUE FECHOU. A MetaApi desliga contas ociosas sozinha, e uma
 * conta desligada responde «nenhuma posição» com a mesma cara com que responderia se estivesse
 * mesmo vazia. Fechar por causa disso era apagar do nosso lado posições abertas com dinheiro lá
 * dentro — e depois ninguém as gere, porque para nós já não existem.
 *
 * O erro que isto veio resolver (83 posições fantasma) é o oposto: deixar aberto o que fechou.
 * Ao corrigi-lo é fácil cair no lado contrário, que é muito pior. Estes testes trancam isso.
 */
import { deveFechar } from '../reconciliacao'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

// ── Fecha-se ────────────────────────────────────────────────────────────────────────────
eq('conta apagada da MetaApi → fecha',
  deveFechar({ estado: 'apagada', posicoesIguais: null }), true)
eq('conta apagada, mesmo com contagem antiga → fecha',
  deveFechar({ estado: 'apagada', posicoesIguais: 3 }), true)
eq('conta ligada e sem a posição → fecha',
  deveFechar({ estado: 'ligada', posicoesIguais: 0 }), true)

// ── NÃO se fecha ────────────────────────────────────────────────────────────────────────
eq('conta ligada e a posição lá está → não fecha',
  deveFechar({ estado: 'ligada', posicoesIguais: 1 }), false)
eq('conta ligada com várias iguais → não fecha',
  deveFechar({ estado: 'ligada', posicoesIguais: 4 }), false)

// O caso perigoso: ligada mas a leitura falhou. Vazio e ilegível NÃO são a mesma coisa.
eq('LIGADA mas leitura falhada (null) → NÃO fecha',
  deveFechar({ estado: 'ligada', posicoesIguais: null }), false)

// Conta desligada/indisponível: nunca se decide nada por ela.
eq('conta indisponível → não fecha',
  deveFechar({ estado: 'indisponivel', posicoesIguais: null }), false)
eq('indisponível que devolveu 0 → continua a NÃO fechar',
  deveFechar({ estado: 'indisponivel', posicoesIguais: 0 }), false)

console.log(`\n${ok} passaram, ${mau} falharam`)
if (mau) process.exit(1)
