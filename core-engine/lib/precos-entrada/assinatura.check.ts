/**
 * GUARDAS DA AUTORIA. Correr: npx tsx lib/precos-entrada/assinatura.check.ts
 */
import assert from 'node:assert/strict'
import { JANELA_MS, aceitarLote, assinar, conferirAssinatura, lerFontes, type Lote } from './assinatura'

const SEGREDO = 'a'.repeat(48)
const OUTRO = 'b'.repeat(48)
const CORPO = '{"fonte":"mac-ricardo","seq":17,"em":1790700000000,"p":[{"s":"XAUUSD","b":1,"a":2,"t":3}]}'

// ── A assinatura ────────────────────────────────────────────────────────────
assert.equal(conferirAssinatura(SEGREDO, CORPO, assinar(SEGREDO, CORPO)), true)
assert.equal(conferirAssinatura(OUTRO, CORPO, assinar(SEGREDO, CORPO)), false, 'outro segredo não serve')
// Um único byte mexido no corpo invalida tudo: é isto que impede trocar o preço de um lote válido.
assert.equal(conferirAssinatura(SEGREDO, CORPO.replace('"b":1', '"b":9'), assinar(SEGREDO, CORPO)), false)
for (const lixo of ['', 'x', 'deadbeef', assinar(SEGREDO, CORPO) + '0']) {
  assert.equal(conferirAssinatura(SEGREDO, CORPO, lixo), false, `assinatura «${lixo.slice(0, 12)}»`)
}
// Maiúsculas/minúsculas e espaços do cabeçalho HTTP não podem ser motivo de recusa.
assert.equal(conferirAssinatura(SEGREDO, CORPO, ` ${assinar(SEGREDO, CORPO).toUpperCase()} `), true)

// ── O lote ──────────────────────────────────────────────────────────────────
const AGORA = 1_790_700_000_000
const l = (o: Partial<Lote> = {}): Lote => ({ fonte: 'mac-ricardo', seq: 10, em: AGORA, p: [], ...o })
const razao = (v: ReturnType<typeof aceitarLote>) => (v.ok ? '' : v.razao)

assert.equal(aceitarLote(l(), AGORA, 9).ok, true)
assert.equal(razao(aceitarLote(l({ fonte: '  ' }), AGORA, 0)), 'fonte')
assert.equal(razao(aceitarLote(l({ seq: 0 }), AGORA, 0)), 'seq')
assert.equal(razao(aceitarLote(l({ p: 'nao-e-lista' as unknown as [] }), AGORA, 0)), 'p')

/**
 * REPETIR UM LOTE VÁLIDO. Quem grave um pedido nosso e o reenvie não consegue nada: a sequência
 * já foi vista, e a hora sai da janela. São as duas travas que fazem de um preço antigo um preço
 * recusado em vez de um preço «novo».
 */
assert.equal(razao(aceitarLote(l({ seq: 10 }), AGORA, 10, undefined, AGORA)), 'seq repetida')
assert.equal(razao(aceitarLote(l({ seq: 9 }), AGORA, 10, undefined, AGORA)), 'seq repetida')
assert.equal(razao(aceitarLote(l(), AGORA + JANELA_MS + 1, 0)), 'fora da janela')
assert.equal(razao(aceitarLote(l({ em: AGORA + JANELA_MS + 1 }), AGORA, 0)), 'fora da janela', 'nem do futuro')
// O reenvio de um lote gravado traz a hora de quando foi gravado, e por aí não volta a entrar.
assert.equal(razao(aceitarLote(l({ em: AGORA - 5_000 }), AGORA, 0, undefined, AGORA)), 'em recuado')

// Um receptor que reinicia começa em 0 e volta a aceitar o lote seguinte, seja qual for o número:
// o agente não tem de saber que o outro lado reiniciou.
assert.equal(aceitarLote(l({ seq: 1_790_700_000_123 }), AGORA, 0).ok, true)

/**
 * O LOTE COM UM `seq` ABSURDO NÃO PODE TRANCAR O AGENTE. Um relógio que salta com o NTP — ou alguém
 * com o segredo a fazê-lo de propósito — punha o `seq` tão alto que nada do agente legítimo voltava
 * a ser «maior», e a reserva ficava morta até alguém reiniciar o receptor. Numa peça que existe para
 * ser redundância, isso é a pior falha possível. Quem manda é a HORA, e ela é limitada pelo relógio
 * de quem recebe.
 */
assert.equal(aceitarLote(l({ seq: 999_999_999_999_999 }), AGORA, 0, undefined, 0).ok, true)
assert.equal(
  aceitarLote(l({ seq: 5, em: AGORA + 1 }), AGORA + 1, 999_999_999_999_999, undefined, AGORA).ok,
  true,
  'no milissegundo seguinte um seq mais baixo volta a entrar — nada fica trancado para sempre',
)
// Dentro do MESMO milissegundo continua a decidir a sequência (é aí que o reenvio imediato mora).
assert.equal(razao(aceitarLote(l({ seq: 5 }), AGORA, 999_999_999_999_999, undefined, AGORA)), 'seq repetida')

// ── As fontes ───────────────────────────────────────────────────────────────
const fontes = lerFontes(`mac-ricardo:${SEGREDO}, vps:${OUTRO}`)
assert.equal(fontes.get('mac-ricardo'), SEGREDO)
assert.equal(fontes.get('vps'), OUTRO)
// Segredos curtos são recusados na leitura: melhor a fonte não existir do que existir adivinhável.
assert.equal(lerFontes('mac:curto').size, 0)
assert.equal(lerFontes(undefined).size, 0)
assert.equal(lerFontes('semdoispontos').size, 0)

console.log('assinatura: ok')
