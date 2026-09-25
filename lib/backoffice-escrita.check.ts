/**
 * GUARDA DA ESCRITA no backoffice da equipa. Duas provas mandam neste ficheiro:
 *
 *  1. QUEM NÃO PARTICIPA NÃO MOVE. Um setter não mexe no negócio de outro setter — nem para o
 *     ajudar. É a condição de haver equipa, e é uma lista de ids que a garante, não um `if`.
 *  2. MARCAR «GANHO» NÃO GERA COMISSÃO. Os campos que se escrevem num negócio ganho são
 *     exactamente os mesmos de um negócio contactado. A venda nasce do pagamento confirmado
 *     (migração 128, regra 3) e o backoffice não tem caminho nenhum para `vendas_vendas` ou
 *     `vendas_comissoes` — o que se prova lendo o código das rotas, e não confiando na memória.
 *
 *   npx tsx lib/backoffice-escrita.check.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  COLUNA_DO_PAPEL,
  TABELAS_PROIBIDAS_NO_BACKOFFICE,
  camposDaMudancaDeEstado,
  eventoDeAtribuicao,
  eventoDeEstado,
  participaNoNegocio,
  podeMexerNoNegocio,
  validarAtribuicao,
  validarMudancaDeEstado,
  validarMudancaDeTarefa,
  validarNegocioNovo,
  validarPrazo,
  validarTarefaNova,
} from './backoffice-escrita'
import { ambitoDeLeitura, capacidadesDe } from './backoffice-papeis'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const EU = '11111111-1111-4111-8111-111111111111'
const COLEGA = '22222222-2222-4222-8222-222222222222'
const LIDERADO = '33333333-3333-4333-8333-333333333333'
const ESTRANHO = '44444444-4444-4444-8444-444444444444'

const ambitoDe = (papel: 'setter' | 'closer' | 'team_leader', liderados: string[] = []) =>
  ambitoDeLeitura(capacidadesDe([papel]), EU, 'pipeline', liderados)

// ══════════ 1. Quem não participa não mexe ══════════
{
  const meu = { setter_id: EU, closer_id: null, prospector_id: null, team_leader_id: null, afiliado_id: null }
  const alheio = { setter_id: COLEGA, closer_id: COLEGA, prospector_id: null, team_leader_id: null, afiliado_id: null }
  const orfao = { setter_id: null, closer_id: null, prospector_id: null, team_leader_id: null, afiliado_id: null }

  const ambitoSetter = ambitoDe('setter', [LIDERADO])
  teste('o setter mexe no negócio dele', podeMexerNoNegocio(meu, ambitoSetter))
  teste('⭐ quem não participa NÃO mexe no negócio de outro', !podeMexerNoNegocio(alheio, ambitoSetter))
  teste('um setter não herda a equipa nem dando-lhe liderados', ambitoSetter.ids.join(',') === EU)
  teste('um negócio sem atribuições não é de ninguém', !podeMexerNoNegocio(orfao, ambitoSetter))

  // O responsável mexe nos dos liderados — e só porque o id do liderado está na LISTA.
  const ambitoLider = ambitoDe('team_leader', [LIDERADO])
  const doLiderado = { setter_id: LIDERADO, closer_id: null, prospector_id: null, team_leader_id: null, afiliado_id: null }
  const deOutraEquipa = { setter_id: ESTRANHO, closer_id: null, prospector_id: null, team_leader_id: null, afiliado_id: null }
  teste('o responsável mexe no negócio do liderado', podeMexerNoNegocio(doLiderado, ambitoLider))
  teste('⭐ mas não no de quem não lidera', !podeMexerNoNegocio(deOutraEquipa, ambitoLider))
  teste('responsável sem equipa carregada fecha no próprio', !podeMexerNoNegocio(doLiderado, ambitoDe('team_leader', [])))

  // Âmbito vazio (pessoa sem a capacidade) não mexe em nada, nem no que tem o id dela.
  teste('âmbito vazio não mexe em nada', !podeMexerNoNegocio(meu, { proprioId: EU, ids: [], todos: false }))
  teste('participar é estar em alguma das cinco colunas', participaNoNegocio(meu, EU) && !participaNoNegocio(meu, COLEGA))
  teste('as cinco colunas têm os cinco papéis', Object.keys(COLUNA_DO_PAPEL).length === 5)
}

// ══════════ 2. Ganho não inventa venda ══════════
{
  const ganho = camposDaMudancaDeEstado('ganho', null, new Date('2026-09-25T10:00:00Z'))
  const contactado = camposDaMudancaDeEstado('contactado', null, new Date('2026-09-25T10:00:00Z'))

  const proibidos = ['valor', 'valor_cents', 'comissao', 'venda', 'venda_id', 'pct', 'pago', 'pack']
  teste(
    '⭐ marcar ganho escreve só campos do negócio',
    Object.keys(ganho).every((k) => !proibidos.some((p) => k.includes(p))),
  )
  teste(
    '⭐ ganho escreve exactamente os mesmos campos que contactado',
    Object.keys(ganho).sort().join(',') === Object.keys(contactado).sort().join(','),
  )
  teste('ganho fecha o negócio', typeof ganho.fechado_em === 'string')
  teste('reabrir limpa a data de fecho', contactado.fechado_em === null)
  teste('reabrir limpa o motivo de perda', contactado.motivo_perda === null)
}

// ══════════ 3. Mover: o que se exige e o que não se exige ══════════
{
  teste('mover para o mesmo estado não é movimento', !validarMudancaDeEstado({ de: 'lead', para: 'lead' }).ok)
  teste('um estado inventado recusa-se', !validarMudancaDeEstado({ de: 'lead', para: 'fechadinho' }).ok)
  teste('perdido sem motivo recusa-se', !validarMudancaDeEstado({ de: 'marcado', para: 'perdido' }).ok)
  teste('perdido com motivo passa', validarMudancaDeEstado({ de: 'marcado', para: 'perdido', motivoPerda: 'preço' }).ok)
  // Saltos existem no funil real: uma indicação chega qualificada.
  teste('saltar passos é permitido', validarMudancaDeEstado({ de: 'lead', para: 'marcado' }).ok)
  teste('reabrir um perdido é permitido', validarMudancaDeEstado({ de: 'perdido', para: 'contactado' }).ok)

  const ev = eventoDeEstado({ negocioId: EU, de: 'lead', para: 'marcado', por: EU, nota: '  ' })
  teste('o evento guarda quem, de onde e para onde', ev.por === EU && ev.de === 'lead' && ev.para === 'marcado')
  teste('uma nota em branco não se guarda como nota', ev.nota === null)

  const evA = eventoDeAtribuicao({ negocioId: EU, estadoActual: 'marcado', papel: 'closer', paraNome: 'Ana', por: EU })
  teste('o evento de atribuição não inventa estados', evA.de === 'marcado' && evA.para === 'marcado')
  teste('e diz o que mudou', String(evA.nota).includes('closer') && String(evA.nota).includes('Ana'))
}

// ══════════ 4. Atribuir papéis ══════════
{
  const ambitoSetter = ambitoDe('setter')
  const ambitoLider = ambitoDe('team_leader', [LIDERADO])

  teste(
    'ponho-me a mim num lugar vago',
    validarAtribuicao({ papel: 'setter', ocupanteActual: null, novoId: EU, autorId: EU, ambito: ambitoSetter, temAmbitoEquipa: false }).ok,
  )
  teste(
    '⭐ não ponho outra pessoa sem responder pela equipa',
    !validarAtribuicao({ papel: 'closer', ocupanteActual: null, novoId: COLEGA, autorId: EU, ambito: ambitoSetter, temAmbitoEquipa: false }).ok,
  )
  teste(
    '⭐ não escrevo por cima de quem já lá está',
    !validarAtribuicao({ papel: 'closer', ocupanteActual: COLEGA, novoId: EU, autorId: EU, ambito: ambitoSetter, temAmbitoEquipa: false }).ok,
  )
  teste(
    'largo o meu próprio lugar sem pedir a ninguém',
    validarAtribuicao({ papel: 'setter', ocupanteActual: EU, novoId: null, autorId: EU, ambito: ambitoSetter, temAmbitoEquipa: false }).ok,
  )
  teste(
    'o responsável põe um liderado',
    validarAtribuicao({ papel: 'closer', ocupanteActual: null, novoId: LIDERADO, autorId: EU, ambito: ambitoLider, temAmbitoEquipa: true }).ok,
  )
  teste(
    '⭐ mas não põe quem não é da equipa dele',
    !validarAtribuicao({ papel: 'closer', ocupanteActual: null, novoId: ESTRANHO, autorId: EU, ambito: ambitoLider, temAmbitoEquipa: true }).ok,
  )
  teste(
    '⭐ nem tira quem não é da equipa dele',
    !validarAtribuicao({ papel: 'closer', ocupanteActual: ESTRANHO, novoId: LIDERADO, autorId: EU, ambito: ambitoLider, temAmbitoEquipa: true }).ok,
  )
  teste(
    'um papel inventado recusa-se',
    !validarAtribuicao({ papel: 'chefe', ocupanteActual: null, novoId: EU, autorId: EU, ambito: ambitoLider, temAmbitoEquipa: true }).ok,
  )
  teste(
    'um id que não é id recusa-se',
    !validarAtribuicao({ papel: 'closer', ocupanteActual: null, novoId: "' or true --", autorId: EU, ambito: ambitoLider, temAmbitoEquipa: true }).ok,
  )
}

// ══════════ 5. Criar um negócio ══════════
{
  const base = { corpo: { nome: 'João', papel: 'setter' }, autorId: EU, papeisDoAutor: ['setter'] as const, ehDono: false }
  const r = validarNegocioNovo(base)
  teste('o negócio novo nasce com o criador dentro', r.ok && r.valor.linha.setter_id === EU)
  teste('e nasce em lead', r.ok && r.valor.linha.estado === 'lead')
  teste('sem nome não há negócio', !validarNegocioNovo({ ...base, corpo: { nome: '   ', papel: 'setter' } }).ok)
  teste(
    '⭐ não se entra com um papel que não se tem',
    !validarNegocioNovo({ ...base, corpo: { nome: 'João', papel: 'closer' } }).ok,
  )
  teste(
    'o dono escolhe qualquer papel (não tem papéis atribuídos)',
    validarNegocioNovo({ ...base, papeisDoAutor: [], ehDono: true, corpo: { nome: 'João', papel: 'closer' } }).ok,
  )
  teste(
    '⭐ um negócio não nasce ganho',
    !validarNegocioNovo({ ...base, corpo: { nome: 'João', papel: 'setter', estado: 'ganho' } }).ok,
  )
  teste('sem papel não há negócio (nascia órfão)', !validarNegocioNovo({ ...base, corpo: { nome: 'João' } }).ok)
}

// ══════════ 6. Tarefas ══════════
{
  const ambitoProprio = ambitoDeLeitura(capacidadesDe(['setter']), EU, 'tarefas', [])
  const ambitoLider = ambitoDeLeitura(capacidadesDe(['team_leader']), EU, 'tarefas', [LIDERADO])

  const minha = validarTarefaNova({ corpo: { titulo: 'Ligar ao João' }, autorId: EU, ambitoTarefas: ambitoProprio, temAmbitoEquipa: false })
  teste('a tarefa nova é minha por defeito', minha.ok && minha.valor.responsavel_id === EU)
  teste('sem título não há tarefa', !validarTarefaNova({ corpo: { titulo: ' ' }, autorId: EU, ambitoTarefas: ambitoProprio, temAmbitoEquipa: false }).ok)
  teste(
    '⭐ não dou trabalho a um colega sem responder pela equipa',
    !validarTarefaNova({ corpo: { titulo: 'x', responsavel_id: COLEGA }, autorId: EU, ambitoTarefas: ambitoProprio, temAmbitoEquipa: false }).ok,
  )
  teste(
    'o responsável dá trabalho ao liderado',
    validarTarefaNova({ corpo: { titulo: 'x', responsavel_id: LIDERADO }, autorId: EU, ambitoTarefas: ambitoLider, temAmbitoEquipa: true }).ok,
  )
  teste(
    '⭐ mas não a quem não é da equipa dele',
    !validarTarefaNova({ corpo: { titulo: 'x', responsavel_id: ESTRANHO }, autorId: EU, ambitoTarefas: ambitoLider, temAmbitoEquipa: true }).ok,
  )

  teste('um prazo é um dia', validarPrazo('2026-10-01').ok && !validarPrazo('01/10/2026').ok)
  teste('uma data impossível recusa-se', !validarPrazo('2026-13-45').ok)

  const feita = validarMudancaDeTarefa({ corpo: { feita: true }, estadoActual: 'aberta' })
  teste('riscar guarda a data', feita.ok && feita.valor.estado === 'feita' && typeof feita.valor.feita_em === 'string')
  const reaberta = validarMudancaDeTarefa({ corpo: { feita: false }, estadoActual: 'feita' })
  teste('reabrir limpa a data', reaberta.ok && reaberta.valor.feita_em === null)
  teste(
    'uma cancelada não se reabre daqui',
    !validarMudancaDeTarefa({ corpo: { feita: false }, estadoActual: 'cancelada' }).ok,
  )
  teste('cancelar é uma mudança válida', validarMudancaDeTarefa({ corpo: { estado: 'cancelada' }, estadoActual: 'aberta' }).ok)
  teste('mudar só o prazo é uma mudança válida', validarMudancaDeTarefa({ corpo: { prazo: '2026-10-01' }, estadoActual: 'aberta' }).ok)
  teste('um pedido vazio recusa-se', !validarMudancaDeTarefa({ corpo: {}, estadoActual: 'aberta' }).ok)
}

// ══════════ 7. O código das rotas: nenhum caminho para o dinheiro ══════════
{
  const ficheiros: string[] = []
  const varrer = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) varrer(p)
      else if (e === 'route.ts') ficheiros.push(p)
    }
  }
  varrer('app/api/backoffice')
  teste('há rotas de backoffice para inspeccionar', ficheiros.length > 0)

  for (const f of ficheiros) {
    const src = readFileSync(f, 'utf8')
    const nome = f.replace('app/api/backoffice/', '')

    // ⭐ A prova que importa: nenhuma rota do backoffice CONSULTA o livro do dinheiro. Procura-se
    // o `.from('…')` e não o nome solto: os comentários destas rotas falam de `vendas_vendas` de
    // propósito (é lá que a venda nasce), e uma guarda que proibisse a palavra ensinava a apagar a
    // explicação em vez de a ler.
    for (const tabela of TABELAS_PROIBIDAS_NO_BACKOFFICE) {
      teste(`⭐ ${nome}: não toca em ${tabela}`, !new RegExp(`from\\(\\s*['"\`]${tabela}['"\`]`).test(src))
    }
    // O autor vem SEMPRE da sessão. Um `por` vindo do corpo faz o histórico mentir sobre quem
    // mexeu — que é exactamente a pergunta a que ele existe para responder.
    teste(`${nome}: não aceita o autor vindo do cliente`, !/body\.(por|criado_por|autor|user_id|userId)/.test(src))
    // Cada verbo exportado passa pelo portão. Contar é mais honesto do que procurar uma vez.
    const verbos = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].length
    const portoes = [...src.matchAll(/exigirCapacidade\(/g)].length
    teste(`${nome}: cada verbo passa pelo portão (${verbos} verbos, ${portoes} portões)`, portoes >= verbos)
    teste(`${nome}: e a recusa devolve-se`, !verbos || /instanceof NextResponse\) return/.test(src))
  }

  // A rota dos negócios em particular: o filtro de quem pode mexer tem de estar lá, e ser o do
  // âmbito. Uma rota que autorize («pode mexer em negócios?») e não filtre («neste?») responde 200
  // e muda o negócio de outra pessoa.
  const negocios = ficheiros.filter((f) => f.includes('negocios')).map((f) => readFileSync(f, 'utf8')).join('\n')
  teste('negócios: o filtro vem do âmbito', /ambitoDaEquipa\(/.test(negocios))
  teste('⭐ negócios: quem não participa não move', /podeMexerNoNegocio\(/.test(negocios))
  teste('negócios: toda a mudança de estado grava evento', /vendas_negocio_eventos/.test(negocios))
  // Pôr-se a si próprio num papel manda a palavra `'eu'`, não um id: quem decide quem é «eu» é a
  // sessão. Assim não existe caminho nenhum em que o id de quem entra na atribuição venha do browser.
  teste('⭐ negócios: «eu» resolve-se na sessão, não no cliente', /=== 'eu' \? ctx\.userId/.test(negocios))
}

if (falhas.length) {
  console.error(`backoffice/escrita: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice/escrita: quem não participa não move, e marcar ganho não gera comissão nenhuma ✓')
