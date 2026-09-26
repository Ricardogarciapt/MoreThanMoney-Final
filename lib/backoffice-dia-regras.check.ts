import assert from 'node:assert/strict'
import {
  AMOSTRA_MINIMA,
  CADENCIA_DE_ARRANQUE,
  CADENCIA_MAXIMA_DIAS,
  ESTADOS_VIVOS,
  FACTOR_ESCALADA,
  PAPEL_DO_ESTADO,
  cadenciaDoEstado,
  chaveTarefaDoDia,
  diaEmLisboa,
  ehDiaUtil,
  TECTO_SOCIAL_DIARIO,
  chaveTarefaSocial,
  encherODia,
  escolherDoDia,
  estadoEstaVivo,
  precisaAccao,
  precisaEscalar,
  prioridade,
  proximaAccao,
  tectoDoPapel,
  type MedidaDeEstado,
} from './backoffice-dia-regras'
import { ESTADOS_PIPELINE } from './backoffice-vista'
import { PAPEIS } from './backoffice-papeis'

// ── Cobertura: nenhum estado e nenhum papel pode ficar sem resposta ──────────

for (const e of ESTADOS_PIPELINE) {
  assert.ok(e in PAPEL_DO_ESTADO, `estado sem dono definido: ${e}`)
  assert.ok(e in CADENCIA_DE_ARRANQUE, `estado sem cadência de arranque: ${e}`)
}
for (const p of PAPEIS) {
  assert.ok(tectoDoPapel(p) > 0, `papel sem tecto diário: ${p}`)
}

// Ganho e perdido NÃO geram trabalho. Se alguém os puser a gerar, o motor põe-se a perseguir
// clientes já fechados — e isso é a forma mais rápida de perder um cliente acabado de ganhar.
assert.equal(PAPEL_DO_ESTADO.ganho, null)
assert.equal(PAPEL_DO_ESTADO.perdido, null)
assert.ok(!estadoEstaVivo('ganho'))
assert.ok(!estadoEstaVivo('perdido'))
assert.ok(estadoEstaVivo('lead'))
assert.equal(ESTADOS_VIVOS.length, ESTADOS_PIPELINE.length - 2)

// O no_show volta ao setter, não ao closer. Quem não apareceu precisa de nova marcação.
assert.equal(PAPEL_DO_ESTADO.no_show, 'setter')

// ── Cadência: só se acredita na medição quando há amostra ────────────────────

const semAmostra: MedidaDeEstado[] = [{ estado: 'qualificado', diasMedianos: 1, amostra: AMOSTRA_MINIMA - 1 }]
const c1 = cadenciaDoEstado('qualificado', semAmostra)
assert.equal(c1.fonte, 'arranque', 'com amostra a menos tem de admitir que é palpite')
assert.equal(c1.dias, CADENCIA_DE_ARRANQUE.qualificado)

const comAmostra: MedidaDeEstado[] = [{ estado: 'qualificado', diasMedianos: 4, amostra: AMOSTRA_MINIMA }]
const c2 = cadenciaDoEstado('qualificado', comAmostra)
assert.equal(c2.fonte, 'medida')
assert.equal(c2.dias, 4, 'com amostra, manda a medição e não o arranque')

// Uma medição doente não pode produzir uma cadência absurda.
assert.equal(cadenciaDoEstado('lead', [{ estado: 'lead', diasMedianos: 900, amostra: 50 }]).dias, CADENCIA_MAXIMA_DIAS)
assert.equal(cadenciaDoEstado('lead', [{ estado: 'lead', diasMedianos: 0, amostra: 50 }]).dias, 1)
assert.equal(cadenciaDoEstado('lead', [{ estado: 'lead', diasMedianos: NaN, amostra: 50 }]).fonte, 'arranque')

// ── Prioridade: o atraso manda, o pack só desempata ─────────────────────────

const atrasadoPequeno = prioridade({ estado: 'lead', diasParado: 6, cadenciaDias: 2, packPrevisto: 'membro' })
const recenteGrande = prioridade({ estado: 'lead', diasParado: 0, cadenciaDias: 2, packPrevisto: 'fundador', origem: 'indicacao' })
assert.ok(
  atrasadoPequeno > recenteGrande,
  'um negócio pequeno a apodrecer tem de passar à frente de um grande ainda dentro do prazo',
)

// Entre iguais no tempo, o pack e a origem desempatam — mas sem virar o jogo.
const a = prioridade({ estado: 'lead', diasParado: 2, cadenciaDias: 2, packPrevisto: 'fundador', origem: 'indicacao' })
const b = prioridade({ estado: 'lead', diasParado: 2, cadenciaDias: 2 })
assert.ok(a > b, 'com o mesmo atraso, o pack maior vem primeiro')
assert.ok(a - b <= 20, 'o desempate nunca pode valer mais do que 20 pontos')

// Limites sãos.
assert.ok(prioridade({ estado: 'lead', diasParado: 0, cadenciaDias: 2 }) >= 0)
assert.ok(prioridade({ estado: 'lead', diasParado: 9999, cadenciaDias: 1, packPrevisto: 'fundador', origem: 'indicacao' }) <= 100)
// Um pack ou origem desconhecidos não podem rebentar a conta.
assert.ok(Number.isFinite(prioridade({ estado: 'lead', diasParado: 1, cadenciaDias: 2, packPrevisto: 'inventado', origem: 'seja-o-que-for' })))

// ── Quando agir e quando chamar o chefe ─────────────────────────────────────

assert.ok(!precisaAccao(1, 2))
assert.ok(precisaAccao(2, 2))
// O PRIMEIRO toque nunca espera: quem chegou hoje trabalha-se hoje. Sem isto, a cadência — que
// existe para ESPAÇAR insistências — passava a atrasar o primeiro contacto.
assert.ok(precisaAccao(0, 5, false), 'lead por tocar tem de entrar no dia em que chega')
assert.ok(!precisaAccao(0, 5, true), 'já tocado e dentro do prazo não se repete')
assert.ok(!precisaEscalar(2, 2), 'no dia da cadência ainda é trabalho normal')
assert.ok(precisaEscalar(2 * FACTOR_ESCALADA, 2), 'ao triplo da cadência já é encravamento')
// Escalar implica sempre que já havia acção pendente — nunca o contrário.
for (const d of [0, 1, 2, 3, 5, 8, 13, 21]) {
  if (precisaEscalar(d, 2)) assert.ok(precisaAccao(d, 2), `escalou sem sequer precisar de acção (dias=${d})`)
}

// Cadência zero ou negativa não pode fazer isto dividir por zero nem disparar sempre.
assert.ok(!precisaAccao(0, 0))
assert.ok(Number.isFinite(prioridade({ estado: 'lead', diasParado: 3, cadenciaDias: 0 })))

// ── A mensagem muda quando se insiste ───────────────────────────────────────

const primeiro = proximaAccao('lead', 0)
const segundo = proximaAccao('lead', 1)
assert.notEqual(primeiro.titulo, segundo.titulo, 'insistir com o mesmo texto é o que faz bloquearem-nos')
assert.notEqual(primeiro.pedidoIA, segundo.pedidoIA)

// Ao fim de vários toques sem avanço, pede-se decisão em vez de continuar a empurrar.
assert.match(proximaAccao('apresentado', 3).titulo, /decis/i)
assert.match(proximaAccao('contactado', 3).titulo, /arquivar|fechar/i)

// Todo o estado vivo tem de ter acção com porquê — é o porquê que faz a tarefa não ser adiada.
for (const e of ESTADOS_VIVOS) {
  const acc = proximaAccao(e, 0)
  assert.ok(acc.titulo.length > 3, `estado sem título de acção: ${e}`)
  assert.ok(acc.porque.length > 10, `estado sem razão para agir hoje: ${e}`)
  assert.ok(acc.pedidoIA.length > 10, `estado sem pedido para a IA redigir: ${e}`)
}

// ── Idempotência e calendário ───────────────────────────────────────────────

assert.equal(chaveTarefaDoDia('abc', '2026-09-25'), chaveTarefaDoDia('abc', '2026-09-25'))
assert.notEqual(chaveTarefaDoDia('abc', '2026-09-25'), chaveTarefaDoDia('abc', '2026-09-26'))
assert.notEqual(chaveTarefaDoDia('abc', '2026-09-25'), chaveTarefaDoDia('abd', '2026-09-25'))

assert.match(diaEmLisboa(new Date('2026-09-25T23:30:00Z')), /^\d{4}-\d{2}-\d{2}$/)
// Lisboa está à frente de UTC no verão: à meia-noite e meia UTC ainda pode ser o dia anterior lá,
// mas à 01:30 UTC de 26 já é dia 26 em Lisboa. O que se prende aqui é que o dia vem de Lisboa.
assert.equal(diaEmLisboa(new Date('2026-09-26T12:00:00Z')), '2026-09-26')

assert.ok(ehDiaUtil('2026-09-25'), 'sexta-feira é dia de trabalho')
assert.ok(!ehDiaUtil('2026-09-26'), 'sábado não')
assert.ok(!ehDiaUtil('2026-09-27'), 'domingo não')
assert.ok(ehDiaUtil('2026-09-28'), 'segunda sim')

// ── O tecto do dia protege a pessoa ─────────────────────────────────────────

const muitos = Array.from({ length: 40 }, (_, i) => ({ prioridade: i, diasParado: i }))
const escolhidos = escolherDoDia(muitos, tectoDoPapel('closer'))
assert.equal(escolhidos.length, tectoDoPapel('closer'))
assert.equal(escolhidos[0].prioridade, 39, 'o mais prioritário vem primeiro')
// Empate resolve-se pelo mais parado: está mais perto de se perder.
const empatados = [
  { prioridade: 50, diasParado: 2 },
  { prioridade: 50, diasParado: 9 },
]
assert.equal(escolherDoDia(empatados, 2)[0].diasParado, 9)
// Não inventa trabalho que não existe, e um tecto absurdo não rebenta.
assert.equal(escolherDoDia([], 10).length, 0)
assert.equal(escolherDoDia(muitos, 0).length, 0)
assert.equal(escolherDoDia(muitos, -5).length, 0)

// ── Um dia com vários papéis mistura-se sem dar contas erradas ─────────────

// Só de closer: o dia dá para o tecto do closer e nem mais um.
const soCloser = Array.from({ length: 30 }, (_, i) => ({ prioridade: 100 - i, diasParado: 1, papel: 'closer' as const }))
assert.equal(encherODia(soCloser).length, tectoDoPapel('closer'))

// Só de prospector: cabem mais, porque cada toque é curto.
const soProspector = Array.from({ length: 40 }, (_, i) => ({ prioridade: 100 - i, diasParado: 1, papel: 'prospector' as const }))
assert.equal(encherODia(soProspector).length, tectoDoPapel('prospector'))
assert.ok(encherODia(soProspector).length > encherODia(soCloser).length)

// Misturado: fica entre os dois extremos, e nunca dá o tecto do papel mais leve a trabalho pesado.
const misto = [
  ...Array.from({ length: 20 }, (_, i) => ({ prioridade: 90 - i, diasParado: 1, papel: 'closer' as const })),
  ...Array.from({ length: 20 }, (_, i) => ({ prioridade: 50 - i, diasParado: 1, papel: 'prospector' as const })),
]
const dia = encherODia(misto)
assert.ok(dia.length > tectoDoPapel('closer') === false || dia.length <= tectoDoPapel('prospector'))
assert.ok(dia.length >= 1 && dia.length <= tectoDoPapel('prospector'))
// O mais prioritário entra sempre primeiro.
assert.equal(dia[0].prioridade, 90)

// O dia JÁ cheio não recebe mais nada. Sem isto, o tecto contava por execução e não por dia —
// correr o motor duas vezes dava dois dias de trabalho à mesma pessoa (aconteceu: 45 tarefas
// numa pessoa cujo tecto é 15).
assert.equal(encherODia(soCloser, 1).length, 0, 'dia cheio não recebe mais nada')
assert.equal(encherODia(soCloser, 2).length, 0, 'nem quando já passou do cheio')
// Meio dia ocupado recebe cerca de metade.
const metade = encherODia(soCloser, 0.5).length
assert.ok(metade > 0 && metade < tectoDoPapel('closer'), `metade do dia devia dar entre 1 e ${tectoDoPapel('closer')}, deu ${metade}`)
// Um valor negativo não pode dar MAIS do que um dia inteiro.
assert.equal(encherODia(soCloser, -5).length, tectoDoPapel('closer'))

// Nunca devolve um dia vazio por causa de arredondamentos, mesmo com um único item pesadíssimo.
assert.equal(encherODia([{ prioridade: 1, diasParado: 0, papel: 'closer' as const }]).length, 1)
assert.equal(encherODia([]).length, 0)

// ── Expansão social ────────────────────────────────────────────────────────

assert.ok(TECTO_SOCIAL_DIARIO > 0 && TECTO_SOCIAL_DIARIO <= 10, 'um hábito, não um assalto')
// SEM data na chave: cada publicação trabalha-se uma vez e nunca mais. Se levasse o dia, a mesma
// publicação voltava amanhã — e comentar duas vezes no mesmo post é pior do que não comentar.
assert.equal(chaveTarefaSocial('x1'), chaveTarefaSocial('x1'))
assert.notEqual(chaveTarefaSocial('x1'), chaveTarefaSocial('x2'))
assert.ok(!chaveTarefaSocial('x1').includes('2026'), 'a chave social não pode variar com o dia')

console.log('backoffice-dia-regras: OK')
