import assert from 'node:assert/strict'
import {
  CHAMADAS_POR_DIA,
  DIAS_PARA_ESQUECIDO,
  DIGITOS_MINIMOS,
  chamadaDe,
  chamadasDoDia,
  chaveTarefaChamada,
  mesmoNumero,
  motivoDaChamada,
  pontuacaoDaChamada,
  telefoneUtil,
  type FactosDaPessoa,
} from './captacao-hot-calls'

const base: FactosDaPessoa = { nome: 'Alguém', telefone: '+351912345678', fonte: 'pipeline' }

// ── Sem número não há chamada ───────────────────────────────────────────────

// É a regra que impede a lista de chamadas de se encher de linhas que ninguém pode marcar — e é
// isso que faz alguém deixar de a abrir ao terceiro nome sem número.
for (const mau of ['', ' ', '-', 'N/A', 'n/a', '123', '91234567', null, undefined]) {
  assert.equal(telefoneUtil(mau), null, `«${mau}» não é um telefone`)
  assert.equal(chamadaDe({ ...base, telefone: mau as never }), null)
}
assert.equal(telefoneUtil('912345678')?.length, 9)
assert.equal(telefoneUtil('+351 912 345 678'), '+351 912 345 678', 'devolve como está, para se ver como foi dado')
assert.ok(DIGITOS_MINIMOS >= 9, 'menos do que isto aceitava restos de exportação')

// ── Quem já negoceia noutra casa é o mais quente ────────────────────────────

const negoceia = pontuacaoDaChamada({ ...base, lotesNoutraCasa: 154, comissaoNoutraCasa: 348 })
const registado = pontuacaoDaChamada({ ...base, registadoSemActivar: true })
assert.ok(
  negoceia > registado,
  'quem já opera noutra casa vale mais do que quem se registou e parou: a conversa é mais curta',
)

// Ter conta na nossa corretora vale mais do que só estar registado — deu o passo mais difícil.
assert.ok(
  pontuacaoDaChamada({ ...base, temContaNaCorretora: true }) >
    pontuacaoDaChamada({ ...base, registadoSemActivar: true }),
)

// Um gigante não pode engolir a lista: 500 lotes não valem cinquenta vezes mais do que 10.
const dez = pontuacaoDaChamada({ ...base, lotesNoutraCasa: 10 })
const quinhentos = pontuacaoDaChamada({ ...base, lotesNoutraCasa: 500 })
assert.ok(quinhentos > dez)
assert.ok(quinhentos < dez * 3, 'a escala tem de ser achatada, senão a lista é sempre a mesma pessoa')

// Limites sãos, e valores estranhos não rebentam a conta.
assert.ok(pontuacaoDaChamada(base) >= 0)
assert.ok(pontuacaoDaChamada({ ...base, lotesNoutraCasa: 9e9, temContaNaCorretora: true, registadoSemActivar: true, interesse: 'x', diasSemContacto: 900 }) <= 100)
for (const v of [null, undefined, 0, -5, NaN]) {
  assert.ok(Number.isFinite(pontuacaoDaChamada({ ...base, lotesNoutraCasa: v as never })), `lotes=${v} rebentou`)
}

// ── O motivo nunca é vazio, e é feito de factos ────────────────────────────

assert.ok(motivoDaChamada(base).length > 20, 'sem sinais, ainda assim tem de dizer porquê')
const m = motivoDaChamada({ ...base, lotesNoutraCasa: 154.76, comissaoNoutraCasa: 348.21 })
assert.match(m, /154\.76/)
assert.match(m, /348\.21/)
assert.match(motivoDaChamada({ ...base, temContaNaCorretora: true }), /conta aberta/i)
assert.match(motivoDaChamada({ ...base, interesse: 'copytrading' }), /copytrading/)
assert.match(motivoDaChamada({ ...base, diasSemContacto: DIAS_PARA_ESQUECIDO }), /sem contacto/i)
// Quem esteve sem contacto menos do que o limite não é «esquecido» — senão toda a gente era.
assert.doesNotMatch(motivoDaChamada({ ...base, diasSemContacto: DIAS_PARA_ESQUECIDO - 1 }), /sem contacto/i)

// ── O dia tem tecto, e a mesma pessoa conta uma vez ────────────────────────

const muitas: FactosDaPessoa[] = Array.from({ length: 30 }, (_, i) => ({
  nome: `P${i}`,
  telefone: `+35191234${String(i).padStart(4, '0')}`,
  fonte: 'corretora',
  lotesNoutraCasa: i,
}))
assert.equal(chamadasDoDia(muitas).length, CHAMADAS_POR_DIA)
assert.ok(CHAMADAS_POR_DIA <= 10, 'uma chamada prepara-se; vinte numa lista dão zero feitas')
// O mais forte vem primeiro. Com a escala achatada, vários empatam na pontuação — e aí manda o
// VOLUME, não a ordem alfabética. Foi a guarda que apanhou isto: sem o desempate, saía o «P28».
const doDia = chamadasDoDia(muitas)
assert.equal(doDia[0].nome, 'P29', 'quem negoceia mais vem primeiro, mesmo com pontuação igual')
for (let i = 1; i < doDia.length; i++) {
  const antes = doDia[i - 1]
  const agora = doDia[i]
  assert.ok(
    antes.pontuacao > agora.pontuacao || (antes.pontuacao === agora.pontuacao && antes.lotes >= agora.lotes),
    'a lista tem de estar ordenada por pontuação e, em empate, por volume',
  )
}

// A mesma pessoa pela corretora e pelo pipeline é UMA chamada — e fica o motivo mais forte.
const duplicada = chamadasDoDia([
  { nome: 'Nuno', telefone: '+351 912 345 678', fonte: 'pipeline' },
  { nome: 'Nuno Fernandes', telefone: '912345678', fonte: 'corretora', lotesNoutraCasa: 154 },
])
assert.equal(duplicada.length, 1, 'o mesmo número não se liga duas vezes no mesmo dia')

// O indicativo não pode fazer de uma pessoa duas. As exportações de corretora trazem-no, os perfis
// do site não — e foi a guarda que apanhou isto.
assert.ok(mesmoNumero('+351968350028', '968350028'))
assert.ok(mesmoNumero('968350028', '+351 968 350 028'))
assert.ok(mesmoNumero('912345678', '912345678'))
// Mas não se juntam pessoas diferentes só por acabarem nos mesmos algarismos.
assert.ok(!mesmoNumero('912345678', '999345678'))
assert.ok(!mesmoNumero('912345678', '5678'), 'curto demais para ser um número')
assert.ok(!mesmoNumero('', '912345678'))
assert.equal(duplicada[0].fonte, 'corretora')
assert.match(duplicada[0].motivo, /lotes/)

// Sem ninguém, sem chamadas. E um tecto absurdo não rebenta.
assert.equal(chamadasDoDia([]).length, 0)
assert.equal(chamadasDoDia(muitas, 0).length, 0)
assert.equal(chamadasDoDia(muitas, -3).length, 0)

// ── Uma chamada por pessoa e por dia ───────────────────────────────────────

assert.equal(chaveTarefaChamada('+351 912 345 678', '2026-09-26'), chaveTarefaChamada('912345678', '2026-09-26'))
assert.notEqual(chaveTarefaChamada('912345678', '2026-09-26'), chaveTarefaChamada('912345678', '2026-09-27'))

console.log('captacao-hot-calls: OK')
