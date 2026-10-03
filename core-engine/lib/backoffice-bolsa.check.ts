import assert from 'node:assert/strict'
import {
  COLUNAS_DE_DONO,
  COLUNA_DO_PAPEL_BOLSA,
  FILTRO_SEM_DONO,
  estaSemDono,
  papelParaPegar,
  razaoParaNaoPegar,
} from './backoffice-bolsa'
import { COLUNAS_DE_PARTICIPACAO } from './backoffice-negocios'
import { ESTADOS_PIPELINE } from './backoffice-vista'
import { PAPEIS } from './backoffice-papeis'

/**
 * As guardas da bolsa de leads.
 *
 * Isto decide QUEM VÊ O QUÊ e QUEM FICA INSCRITO NUMA COLUNA DE COMISSÃO. São as duas coisas do
 * backoffice que não se podem enganar em silêncio.
 */

// ── A bolsa e o pipeline têm de falar da mesma coisa ────────────────────────

// Se alguém acrescentar uma sexta coluna de participação e esquecer esta lista, a bolsa passa a
// mostrar como «sem dono» negócios que TÊM dono nessa coluna nova. Daí este espelho.
assert.deepEqual(
  [...COLUNAS_DE_DONO].sort(),
  [...COLUNAS_DE_PARTICIPACAO].sort(),
  'a bolsa e o filtro de participação têm de conhecer exactamente as mesmas colunas',
)

// ── Sem dono é sem dono NENHUM ─────────────────────────────────────────────

assert.ok(estaSemDono({}))
assert.ok(estaSemDono({ prospector_id: null, setter_id: null, closer_id: null, team_leader_id: null, afiliado_id: null }))
// Uma coluna preenchida chega para o negócio deixar de estar na bolsa — senão a bolsa mostrava a
// quem não participa um negócio que já é de alguém.
for (const c of COLUNAS_DE_DONO) {
  assert.ok(!estaSemDono({ [c]: 'alguem' } as never), `${c} preenchida tem de tirar da bolsa`)
}

// ── O filtro tem de ser UM `and` aninhado, para caber dentro do `or` ───────

// A razão está em `negociosDoAmbito`: dois `or` no mesmo pedido perdem o parêntesis um do outro e
// o filtro de segurança deixa de ser garantido. Se isto deixar de ser um `and(...)` aninhado,
// alguém está a caminho de abrir a casa toda sem dar por isso.
assert.ok(FILTRO_SEM_DONO.startsWith('and('), 'tem de ser um and aninhado')
assert.ok(FILTRO_SEM_DONO.endsWith(')'))
for (const c of COLUNAS_DE_DONO) {
  assert.ok(FILTRO_SEM_DONO.includes(`${c}.is.null`), `falta ${c} no filtro`)
}
assert.ok(!FILTRO_SEM_DONO.includes('or('), 'um or aqui dentro rebentava o filtro de fora')

// ── Quem pega, pega no papel que o MOMENTO pede ────────────────────────────

assert.equal(papelParaPegar('lead', ['prospector']), 'prospector')
assert.equal(papelParaPegar('qualificado', ['setter']), 'setter')
assert.equal(papelParaPegar('marcado', ['closer']), 'closer')
assert.equal(papelParaPegar('no_show', ['setter']), 'setter', 'quem não apareceu precisa de nova marcação')

// Um closer NÃO pega num lead cru como closer: enchia a coluna errada, e depois o motor — que
// decide por estado — atribuía a tarefa a outra pessoa. Ficavam dois donos para o mesmo trabalho.
assert.equal(papelParaPegar('lead', ['closer']), null)
assert.equal(papelParaPegar('marcado', ['prospector']), null)

// O team leader tapa buracos, como já faz no motor do dia.
assert.equal(papelParaPegar('lead', ['team_leader']), 'team_leader')
assert.equal(papelParaPegar('marcado', ['team_leader']), 'team_leader')
// Mas quando tem o papel certo, é esse que vale — não se marca tudo como team leader.
assert.equal(papelParaPegar('lead', ['team_leader', 'prospector']), 'prospector')

// Negócios fechados não se pegam. Perseguir um cliente já ganho é a forma mais rápida de o perder.
assert.equal(papelParaPegar('ganho', ['team_leader']), null)
assert.equal(papelParaPegar('perdido', ['team_leader']), null)

// Sem papéis não se pega nada. Um afiliado não trabalha o pipeline.
assert.equal(papelParaPegar('lead', []), null)
assert.equal(papelParaPegar('lead', ['afiliado']), null)

// Um estado inventado nunca pode dar um papel — é por aqui que se passaria um valor à mão.
for (const lixo of ['', 'admin', 'ganho ', 'LEAD', '../lead', 'setter']) {
  assert.equal(papelParaPegar(lixo, ['team_leader', 'setter', 'closer', 'prospector']), null, `estado inválido aceite: «${lixo}»`)
}

// ── Cobertura: nenhum papel e nenhum estado sem resposta ───────────────────

for (const p of PAPEIS) {
  assert.ok(p in COLUNA_DO_PAPEL_BOLSA, `papel sem coluna definida: ${p}`)
}
// O afiliado não tem coluna de trabalho: a participação dele é outra coisa e não se ganha pegando.
assert.equal(COLUNA_DO_PAPEL_BOLSA.afiliado, null)
// Todos os papéis que PODEM pegar têm de ter coluna — senão pegava-se e não se escrevia nada.
for (const estado of ESTADOS_PIPELINE) {
  const papel = papelParaPegar(estado, ['prospector', 'setter', 'closer', 'team_leader'])
  if (papel) assert.ok(COLUNA_DO_PAPEL_BOLSA[papel], `${estado} → ${papel} não tem coluna`)
}

// ── A recusa tem de explicar-se ────────────────────────────────────────────

assert.equal(razaoParaNaoPegar('lead', ['prospector']), null, 'quem pode não recebe razão nenhuma')
assert.match(String(razaoParaNaoPegar('lead', [])), /papel/i)
assert.match(String(razaoParaNaoPegar('ganho', ['team_leader'])), /fechado/i)
assert.match(String(razaoParaNaoPegar('marcado', ['prospector'])), /closer/i, 'diz QUE papel falta')
// Toda a recusa tem de dizer alguma coisa. Um «não podes» mudo faz a pessoa deixar de tentar.
for (const estado of ESTADOS_PIPELINE) {
  for (const papeis of [[], ['afiliado'], ['prospector'], ['closer']] as const) {
    const r = razaoParaNaoPegar(estado, papeis as never)
    if (r !== null) assert.ok(r.length > 15, `recusa curta demais em ${estado}: «${r}»`)
  }
}

console.log('backoffice-bolsa: OK')
