/**
 * GUARDA do vocabulário das páginas do backoffice.
 *
 * O que se prova aqui é pequeno e é o que mais vezes se faz mal:
 *  · «atrasada» é uma CONTA, não um estado guardado — e uma tarefa para hoje não está atrasada;
 *  · uma comissão devolvida DEPOIS de paga aparece a negativo. Mostrá-la a positivo é contar como
 *    ganho dinheiro que voltou para o cliente, e a conversa seguinte é sobre confiança;
 *  · o MLM fala inglês e o livro da equipa português: um vocabulário só, senão a mesma linha
 *    aparece «paid» num ecrã e «paga» no outro.
 *
 *   npx tsx lib/backoffice-vista.check.ts
 */
import {
  ESTADOS_PIPELINE,
  ESTADO_PIPELINE_NOME,
  ehEstadoFechado,
  ehEstadoPipeline,
  estadoComissao,
  ESTADO_COMISSAO_NOME,
  valorComSinal,
  situacaoDoPrazo,
  diaLocal,
  PESO_PRAZO,
  dataCurta,
  situacaoDaEquipa,
  avisoDeEquipa,
} from './backoffice-vista'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

// ── Pipeline ────────────────────────────────────────────────────────────────
// A ordem é a do avanço real e é ela que desenha as colunas. Trocá-la sem dar por isso põe
// «perdido» no meio do funil.
teste('a ordem do pipeline começa em lead e acaba em perdido', ESTADOS_PIPELINE[0] === 'lead' && ESTADOS_PIPELINE[ESTADOS_PIPELINE.length - 1] === 'perdido')
teste('no_show fica entre marcado e apresentado', ESTADOS_PIPELINE.indexOf('marcado') < ESTADOS_PIPELINE.indexOf('no_show') && ESTADOS_PIPELINE.indexOf('no_show') < ESTADOS_PIPELINE.indexOf('apresentado'))
teste('todos os estados têm nome em português', ESTADOS_PIPELINE.every((e) => !!ESTADO_PIPELINE_NOME[e] && ESTADO_PIPELINE_NOME[e] !== e))
teste('só ganho e perdido são fechados', ESTADOS_PIPELINE.filter(ehEstadoFechado).join(',') === 'ganho,perdido')
teste('um estado inventado não é do pipeline', !ehEstadoPipeline('reaberto') && ehEstadoPipeline('marcado'))

// ── Estados de comissão: um vocabulário só ──────────────────────────────────
teste("'pending' do MLM e 'pendente' do livro são a mesma coisa", estadoComissao('pending') === estadoComissao('pendente'))
teste("'paid' e 'paga' também", estadoComissao('paid') === 'paga' && estadoComissao('paga') === 'paga')
teste('um estado desconhecido não passa por pendente', estadoComissao('a_validar') === 'outro')
teste('estornada diz «Devolvida» a quem lê', ESTADO_COMISSAO_NOME.estornada === 'Devolvida')

// ── A regra do dinheiro devolvido ───────────────────────────────────────────
teste('uma comissão normal mostra-se a positivo', valorComSinal({ valor_cents: 1300, sinal: 1 }) === 1300)
teste('paga e devolvida mostra-se a NEGATIVO', valorComSinal({ valor_cents: 1300, sinal: -1 }) === -1300)
teste(
  'sem a coluna sinal deduz-se do mesmo facto (paga E estornada)',
  valorComSinal({ valor_cents: 1300, paga_em: '2026-09-05', estornada_em: '2026-09-20' }) === -1300,
)
teste(
  'estornada antes de ser paga não fica negativa (nunca saiu dinheiro)',
  valorComSinal({ valor_cents: 1300, paga_em: null, estornada_em: '2026-09-20' }) === 1300,
)
teste('valor zero não muda de sinal', valorComSinal({ valor_cents: 0, sinal: -1 }) === 0)

// ── Prazos: «atrasada» é uma conta ──────────────────────────────────────────
const hoje = new Date(2026, 8, 25, 9, 30) // 25/09/2026, 9h30 — hora local de propósito
teste('sem prazo não é atrasada', situacaoDoPrazo(null, hoje) === 'sem_prazo')
teste('ontem é atrasada', situacaoDoPrazo('2026-09-24', hoje) === 'atrasada')
teste('hoje NÃO é atrasada, é para hoje', situacaoDoPrazo('2026-09-25', hoje) === 'hoje')
teste('amanhã está a caminho', situacaoDoPrazo('2026-09-26', hoje) === 'proxima')
teste('um timestamp completo lê-se pelo dia', situacaoDoPrazo('2026-09-25T23:59:00.000Z', hoje) === 'hoje')
teste('lixo no campo do prazo não inventa atraso', situacaoDoPrazo('em breve', hoje) === 'sem_prazo')

// A hora local é o que evita a avaria da meia-noite: em Portugal, no verão, `toISOString()` dizia
// que entre as 00h e a 01h «hoje» ainda era ontem — e as tarefas de hoje apareciam atrasadas.
{
  const meiaNoiteEMeia = new Date(2026, 6, 10, 0, 30)
  teste(
    'à meia-noite e meia de verão, hoje continua a ser hoje',
    diaLocal(meiaNoiteEMeia) === '2026-07-10' && situacaoDoPrazo('2026-07-10', meiaNoiteEMeia) === 'hoje',
  )
}

// A ordem de leitura de uma lista de tarefas: o que já falhou primeiro.
teste('o atraso lê-se primeiro e o sem-prazo no fim', PESO_PRAZO.atrasada < PESO_PRAZO.hoje && PESO_PRAZO.hoje < PESO_PRAZO.proxima && PESO_PRAZO.proxima < PESO_PRAZO.sem_prazo)

// ── Datas ───────────────────────────────────────────────────────────────────
teste('a data sai à portuguesa', dataCurta('2026-09-25T10:00:00.000Z') === '25/09/2026')
teste('sem data não se inventa uma', dataCurta(null) === '—')

// ── De quem é o que estou a ver ─────────────────────────────────────────────
//
// O caso que importa é o do MEIO: ter o papel de equipa e não ter equipa montada. Uma página que
// não distinga isso de «a equipa não vendeu nada» faz um responsável concluir o contrário da
// verdade — e foi para isso que esta frase existe.
teste('sem o papel de equipa não há nada a explicar', situacaoDaEquipa({ veEquipa: false, liderados: 0 }) === 'so_proprio')
teste('sem o papel de equipa não há frase', avisoDeEquipa(situacaoDaEquipa({ veEquipa: false, liderados: 0 }), 'extracto') === null)
teste('papel de equipa sem liderados é equipa_vazia', situacaoDaEquipa({ veEquipa: true, liderados: 0 }) === 'equipa_vazia')
teste('papel de equipa com liderados é com_equipa', situacaoDaEquipa({ veEquipa: true, liderados: 2 }) === 'com_equipa')
teste('o dono vê tudo e sabe-o', situacaoDaEquipa({ veEquipa: true, liderados: 0, todos: true }) === 'todos')
{
  const vazio = avisoDeEquipa('equipa_vazia', 'pipeline') ?? ''
  teste('a equipa vazia não se confunde com falta de resultados', /não tenha resultados/.test(vazio) && /admin/.test(vazio))
  const cheio = avisoDeEquipa('com_equipa', 'extracto', 3) ?? ''
  teste('com equipa, a frase diz QUANTAS pessoas entram na conta', /3 pessoas/.test(cheio))
  teste('uma pessoa só não leva plural', /1 pessoa\b/.test(avisoDeEquipa('com_equipa', 'tarefas', 1) ?? ''))
}

if (falhas.length) {
  console.error(`backoffice/vista: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice/vista: o atraso é uma conta, o devolvido aparece a negativo, e o vocabulário é um ✓')
