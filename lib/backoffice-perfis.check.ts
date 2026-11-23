/**
 * GUARDA dos perfis da gestão de utilizadores. Corre com:
 *
 *   npx tsx lib/backoffice-perfis.check.ts
 *
 * O que se quer proteger: um perfil que mostre ao Ricardo uma coisa e dê outra. O atalho tem de
 * dizer exactamente o que o papel dá, por isso as listas vêm do mapa, não de texto escrito à mão.
 */
import { PAPEIS, capacidadesDoPapel, pode, capacidadesDe } from '@/lib/backoffice-papeis'
import { PERFIS, capacidadesDoPerfil, perfilPorId } from '@/lib/backoffice-perfis'

let falhas = 0
function ok(cond: boolean, msg: string) {
  if (cond) console.log('ok  ', msg)
  else { falhas++; console.log('FALHA', msg) }
}

// Cada perfil é um papel real do mapa, e cada papel de venda tem o seu perfil.
for (const p of PERFIS) ok((PAPEIS as readonly string[]).includes(p.id), `perfil ${p.id} é um papel do catálogo`)
ok(PERFIS.length === 4, 'quatro perfis de venda (setter, closer, prospector, team_leader)')

// O que se mostra é o que o papel dá: mesma contagem que o mapa.
for (const p of PERFIS) {
  ok(capacidadesDoPerfil(p.id).length === capacidadesDoPapel(p.id).length, `perfil ${p.id} mostra todas as capacidades do papel (com nome)`)
}

// Setter vê o pipeline PRÓPRIO, nunca o da equipa.
const setter = capacidadesDe(['setter'])
ok(pode(setter, 'bo.pipeline_proprio'), 'setter vê o pipeline próprio')
ok(!pode(setter, 'bo.pipeline_equipa'), 'setter NÃO vê o pipeline da equipa')
ok(!pode(setter, 'bo.extracto_todos'), 'setter NÃO vê o extracto de todos')

// Prospector não entra no pipeline (já era assim: não custa nada passar a ver o que outro trabalhou).
const prospector = capacidadesDe(['prospector'])
ok(!pode(prospector, 'bo.pipeline_proprio'), 'prospector NÃO vê o pipeline')

// Team leader vê a equipa; closer não.
ok(pode(capacidadesDe(['team_leader']), 'bo.pipeline_equipa'), 'team_leader vê o pipeline da equipa')
ok(!pode(capacidadesDe(['closer']), 'bo.extracto_equipa'), 'closer NÃO vê o extracto da equipa')

ok(perfilPorId('setter')?.nome === 'Setter', 'perfilPorId acha o setter com o nome certo')
ok(perfilPorId('afiliado') === undefined, 'afiliado não é perfil de venda (fica de fora)')

if (falhas > 0) {
  console.log(`\n${falhas} falha(s)`)
  process.exit(1)
}
console.log('\nTudo certo.')
