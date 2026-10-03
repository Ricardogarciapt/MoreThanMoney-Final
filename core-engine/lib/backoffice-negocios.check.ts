/**
 * GUARDA de «quem vê que negócios e que tarefas».
 *
 * Esta é a guarda que protege a condição de haver equipa: um setter não pode ver o trabalho (nem,
 * por arrasto, o dinheiro) de outro setter. O que se prova:
 *
 *  · o filtro cobre as CINCO atribuições — filtrar só por `closer_id` escondia do setter os
 *    negócios que ele marcou, e foi o erro que esteve à mão de se fazer;
 *  · um âmbito sem ids NÃO LÊ NADA. Nunca «lê tudo»: é a diferença entre uma falha que fecha a
 *    porta e uma que a abre;
 *  · só o âmbito «todos» (o dono) consulta sem filtro, e por um caminho explícito;
 *  · o que não é um uuid não entra no filtro montado por texto.
 *
 *   npx tsx lib/backoffice-negocios.check.ts
 */
import {
  COLUNAS_DE_PARTICIPACAO,
  ehUuid,
  filtroDeParticipacao,
  negociosDoAmbito,
  tarefasDoAmbito,
  papeisNoNegocio,
  type NegocioLinha,
} from './backoffice-negocios'
import { ambitoDeLeitura, capacidadesDe } from './backoffice-papeis'
import { lerPagina } from './backoffice-paginacao'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

// ── uuid ou nada ────────────────────────────────────────────────────────────
teste('um uuid é um uuid', ehUuid(A))
teste('uma frase não é um id', !ehUuid("' or true --"))
teste('vazio não é um id', !ehUuid('') && !ehUuid(null))

// ── O filtro cobre os cinco papéis ──────────────────────────────────────────
{
  const f = filtroDeParticipacao([A])
  teste('há filtro para um id válido', !!f)
  for (const c of COLUNAS_DE_PARTICIPACAO) {
    teste(`o filtro inclui ${c}`, (f ?? '').includes(`${c}.in.(${A})`))
  }
  teste('são cinco colunas, não uma', COLUNAS_DE_PARTICIPACAO.length === 5)
}
teste('sem ids não há filtro (e não ler é o resultado certo)', filtroDeParticipacao([]) === null)
teste('ids inválidos são descartados, não interpolados', filtroDeParticipacao(["' or true --"]) === null)
teste('ids repetidos não repetem o filtro', (filtroDeParticipacao([A, A]) ?? '').split(A).length - 1 === COLUNAS_DE_PARTICIPACAO.length)

// ── Papéis dentro do negócio ────────────────────────────────────────────────
{
  const n = { setter_id: A, closer_id: B, prospector_id: null, team_leader_id: null, afiliado_id: null } as NegocioLinha
  teste('quem marcou vê-se como setter', papeisNoNegocio(n, A).join(',') === 'Setter')
  teste('quem fechou vê-se como closer', papeisNoNegocio(n, B).join(',') === 'Closer')
  teste('quem não participou não tem papel nenhum', papeisNoNegocio(n, '33333333-3333-4333-8333-333333333333').length === 0)
}

// ── As leituras: o filtro chega mesmo à consulta ────────────────────────────
function clienteFalso() {
  const pedidos: Array<{ metodo: string; args: unknown[] }> = []
  const q: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['select', 'order', 'limit', 'range', 'in', 'or', 'gte', 'lte', 'eq', 'ilike']) {
    q[m] = (...args: unknown[]) => {
      pedidos.push({ metodo: m, args })
      return q
    }
  }
  ;(q as { then?: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
  return {
    pedidos,
    cliente: {
      from: (t: string) => {
        pedidos.push({ metodo: 'from', args: [t] })
        return q
      },
    } as unknown as Parameters<typeof negociosDoAmbito>[0],
  }
}

async function guardaDasLeituras() {
  // Um setter: o âmbito dele é ele próprio, e é isso que tem de chegar à consulta.
  const capsSetter = capacidadesDe(['setter'])
  const ambitoSetter = ambitoDeLeitura(capsSetter, A, 'pipeline', [B])
  teste('um setter não herda a equipa nem dando-lhe liderados', ambitoSetter.ids.join(',') === A && !ambitoSetter.todos)

  {
    const { pedidos, cliente } = clienteFalso()
    await negociosDoAmbito(cliente, ambitoSetter)
    const or = pedidos.find((p) => p.metodo === 'or')
    teste('os negócios lêem-se com o filtro de participação', !!or && String(or.args[0]).includes(`setter_id.in.(${A})`))
    teste('e o filtro não deixa passar o id de outra pessoa', !String(or?.args[0] ?? '').includes(B))
  }

  // Um team leader SEM equipa carregada fecha no próprio — não abre.
  {
    const capsLider = capacidadesDe(['team_leader'])
    const ambitoLider = ambitoDeLeitura(capsLider, A, 'pipeline', [])
    const { pedidos, cliente } = clienteFalso()
    await negociosDoAmbito(cliente, ambitoLider)
    const or = pedidos.find((p) => p.metodo === 'or')
    teste('team leader sem equipa vê só o dele', !!or && !String(or.args[0]).includes(B))
  }

  // Um âmbito vazio (uma pessoa sem a capacidade) não chega sequer à base.
  {
    const { pedidos, cliente } = clienteFalso()
    const r = await negociosDoAmbito(cliente, { proprioId: A, ids: [], todos: false })
    teste('âmbito vazio não consulta negócios', pedidos.length === 0 && r.linhas.length === 0)
    const { pedidos: p2, cliente: c2 } = clienteFalso()
    const t = await tarefasDoAmbito(c2, { proprioId: A, ids: [], todos: false })
    teste('âmbito vazio não consulta tarefas', p2.length === 0 && t.linhas.length === 0)
  }

  // O dono lê sem filtro, e só ele.
  {
    const { pedidos, cliente } = clienteFalso()
    await negociosDoAmbito(cliente, { proprioId: A, ids: [], todos: true })
    teste('só o dono lê negócios sem filtro', pedidos.some((p) => p.metodo === 'from') && !pedidos.some((p) => p.metodo === 'or'))
  }

  // As tarefas filtram pelo responsável, que é quem as tem de fazer.
  {
    const { pedidos, cliente } = clienteFalso()
    await tarefasDoAmbito(cliente, { proprioId: A, ids: [A], todos: false })
    const filtro = pedidos.find((p) => p.metodo === 'in' && p.args[0] === 'responsavel_id')
    teste('as tarefas filtram por responsavel_id', !!filtro && JSON.stringify(filtro.args[1]) === JSON.stringify([A]))
    // As canceladas ficam de fora: uma lista de trabalho com histórico dentro não se usa.
    teste('as canceladas não entram na lista', pedidos.some((p) => p.metodo === 'in' && p.args[0] === 'estado' && !JSON.stringify(p.args[1]).includes('cancelada')))
  }

  // ── Paginação: a consulta pede um intervalo, e não um limite cego ─────────
  //
  // Um `.limit(500)` sem paginação mostra 500 linhas na linha 501 com o mesmo aspecto de estar
  // completo. Aqui prova-se que o intervalo chega à base e que o filtro de segurança continua lá:
  // paginar e esquecer o `or` da participação dava a segunda página da casa inteira.
  {
    const { pedidos, cliente } = clienteFalso()
    await negociosDoAmbito(cliente, { proprioId: A, ids: [A], todos: false }, { pagina: lerPagina({ pagina: '2', por_pagina: '10' }) })
    const range = pedidos.find((p) => p.metodo === 'range')
    teste('os negócios pedem um intervalo', !!range && range.args[0] === 10)
    teste('e pedem uma linha a mais do que mostram', !!range && range.args[1] === 20)
    teste('nunca um limite cego', !pedidos.some((p) => p.metodo === 'limit'))
    teste('⭐ paginar não perde o filtro de participação', pedidos.some((p) => p.metodo === 'or'))
  }
  {
    const { pedidos, cliente } = clienteFalso()
    await tarefasDoAmbito(cliente, { proprioId: A, ids: [A], todos: false }, { pagina: lerPagina({ pagina: '2', por_pagina: '10' }) })
    const range = pedidos.find((p) => p.metodo === 'range')
    teste('as tarefas pedem um intervalo', !!range && range.args[0] === 10 && range.args[1] === 20)
    teste('⭐ paginar não perde o filtro do responsável', pedidos.some((p) => p.metodo === 'in' && p.args[0] === 'responsavel_id'))
  }

  // ── Filtros: entram na consulta, e o que não é do catálogo não entra ──────
  {
    const { pedidos, cliente } = clienteFalso()
    await negociosDoAmbito(cliente, { proprioId: A, ids: [A], todos: false }, { estado: 'marcado', procura: 'João' })
    teste('o estado filtra na base', pedidos.some((p) => p.metodo === 'eq' && p.args[0] === 'estado' && p.args[1] === 'marcado'))
    teste('a procura filtra pelo nome', pedidos.some((p) => p.metodo === 'ilike' && p.args[0] === 'nome'))
  }
  {
    const { pedidos, cliente } = clienteFalso()
    await negociosDoAmbito(cliente, { proprioId: A, ids: [A], todos: false }, { estado: 'fechadinho' as never })
    teste('um estado fora do catálogo não filtra nada', !pedidos.some((p) => p.metodo === 'eq' && p.args[0] === 'estado'))
  }
  {
    // Uma lista de estados vazia é um pedido impossível, não «todos»: responde-se vazio e não se
    // pergunta nada à base. O contrário devolvia a lista inteira a quem pediu nenhuma.
    const { pedidos, cliente } = clienteFalso()
    const r = await tarefasDoAmbito(cliente, { proprioId: A, ids: [A], todos: false }, { estados: [] })
    teste('⭐ nenhum estado pedido não é «todos»', r.linhas.length === 0 && pedidos.length === 0)
  }
}

void guardaDasLeituras().then(() => {
  if (falhas.length) {
    console.error(`backoffice/negocios: ${falhas.length} falha(s)`)
    for (const f of falhas) console.error('  · ' + f)
    process.exit(1)
  }
  console.log('backoffice/negocios: o filtro cobre os cinco papéis, o âmbito vazio não lê nada, e só o dono lê sem filtro ✓')
})
