/** Onde o T2T abre. Correr: npx tsx lib/mtmcopy/__tests__/escolha-contas-t2t.check.ts */
import {
  aplicarEscolha,
  escolhaGuardada,
  normalizarEscolha,
  refSimulada,
  separarEscolha,
} from '../escolha-contas-t2t'

let ok = 0, mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++
  else { mau++; console.error(`✗ ${nome}\n   obtido: ${JSON.stringify(a)}\n   esperado: ${JSON.stringify(b)}`) }
}

// ── limpeza do que vem de fora ────────────────────────────────────────────────
eq('não-array = sem escolha', normalizarEscolha('a'), [])
eq('tira vazios, espaços e repetidos', normalizarEscolha([' a ', 'a', '', 42, 'b']), ['a', 'b'])
eq('tecto de contas', normalizarEscolha(Array.from({ length: 80 }, (_, i) => `c${i}`)).length, 50)

// ── as duas famílias numa lista só ────────────────────────────────────────────
eq('separa reais de simuladas', separarEscolha(['a', refSimulada('s1'), 'b']), { reais: ['a', 'b'], simuladas: ['s1'] })

// ── a preferência guardada ────────────────────────────────────────────────────
eq('perfil vazio', escolhaGuardada(null), [])
eq('perfil com escolha', escolhaGuardada({ t2t: { contas: ['a', 'a', 'b'] }, webtrader: {} }), ['a', 'b'])

// ── a regra que decide onde abre ──────────────────────────────────────────────
const contas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const ref = (c: { id: string }) => c.id

// SEM escolha nada muda: é isto que faz com que a app iOS antiga, a MTM Auto e qualquer cliente
// por actualizar continuem a abrir em todas as contas elegíveis, como sempre fizeram.
eq('sem escolha = leque de sempre', aplicarEscolha(contas, ref, []), { contas, escolhida: false, desatualizada: false })

// COM escolha abre só onde ela diz — e o leque continua possível, agora escolhido.
eq('uma conta', aplicarEscolha(contas, ref, ['b']).contas, [{ id: 'b' }])
eq('duas das três', aplicarEscolha(contas, ref, ['a', 'c']).contas, [{ id: 'a' }, { id: 'c' }])

// A escolha é um FILTRO, nunca uma porta: uma conta que não era elegível não entra por ser pedida.
eq('não acrescenta contas', aplicarEscolha(contas, ref, ['a', 'zzz']).contas, [{ id: 'a' }])

// Escolha envelhecida (conta apagada/desligada): lista VAZIA, não o leque. Quem escreveu «só
// nesta» não pode acabar com doze posições porque a conta que escolheu deixou de servir.
eq('escolha morta não volta ao leque', aplicarEscolha(contas, ref, ['zzz']), { contas: [], escolhida: true, desatualizada: true })

console.log(mau ? `✗ ${mau} falhas, ${ok} ok` : `✓ ${ok} verificações`)
process.exit(mau ? 1 : 0)
