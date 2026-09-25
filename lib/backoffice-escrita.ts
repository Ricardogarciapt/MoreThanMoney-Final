/**
 * AS REGRAS DE QUEM ESCREVE no backoffice da equipa — puras, sem base de dados e sem `next/*`.
 *
 * PORQUÊ UM FICHEIRO SÓ PARA ISTO
 * Até agora o backoffice só lia, e a única pergunta era «de quem são estas linhas?»
 * (`lib/backoffice-papeis.ts`). A partir do momento em que a equipa MEXE — cria leads, move
 * estados, risca tarefas — aparece uma segunda pergunta, diferente e mais perigosa: «esta pessoa
 * é dona daquilo em que está a mexer?». Ler a linha de outro mostra o que não devia; escrever na
 * linha de outro muda o percurso de um negócio alheio e, mais tarde, o dinheiro de alguém.
 *
 * A REGRA DA CASA, outra vez: o âmbito é uma LISTA DE IDS e o filtro faz-se por ela. Aqui não há
 * nenhum `if (é responsável de equipa)` — há `podeMexerNoNegocio(negocio, ambito)`, que pergunta
 * se alguma das cinco atribuições do negócio está dentro da lista. Um `if` esquece-se numa
 * refactorização e nada no ecrã muda; uma lista que não contém o id devolve `false` sempre.
 *
 * O QUE ESTE FICHEIRO NÃO FAZ, e é a parte que protege o negócio:
 *  · não toca em `vendas_vendas` nem em `vendas_comissoes`. Marcar um negócio como GANHO é o
 *    closer a dizer que fechou; a venda nasce do PAGAMENTO confirmado (migração 128, regra 3), e
 *    é o webhook que a escreve. Se as duas coisas se pudessem separar, alguém acabava por marcar
 *    ganhos que não existiram — e o livro de comissões pagava sobre eles.
 *  · não aprova nem paga nada. Isso é do dono, no admin.
 *
 * Ser PURO é o que permite provar as duas coisas em dois segundos, sem sessão e sem base:
 * `npx tsx lib/backoffice-escrita.check.ts`.
 */
import type { AmbitoLeitura } from '@/lib/backoffice-papeis'
import type { Papel } from '@/lib/backoffice-papeis'
import { ESTADOS_PIPELINE, ehEstadoPipeline, type EstadoPipeline } from '@/lib/backoffice-vista'
import { COLUNAS_DE_PARTICIPACAO, ehUuid } from '@/lib/backoffice-negocios'

/**
 * AS TABELAS QUE O BACKOFFICE NÃO ESCREVE. Está escrito como lista e não como comentário para a
 * guarda poder varrer as rotas e falhar o dia em que uma delas aparecer num `.from(...)`.
 */
export const TABELAS_PROIBIDAS_NO_BACKOFFICE = [
  'vendas_vendas',
  'vendas_comissoes',
  'vendas_comissoes_historico',
  'vendas_regras_comissao',
  'mlm_commissions',
] as const

/** O papel de cada pessoa no negócio e a coluna onde ele vive. Uma pessoa, um papel, uma coluna. */
export const COLUNA_DO_PAPEL: Record<Papel, (typeof COLUNAS_DE_PARTICIPACAO)[number]> = {
  prospector: 'prospector_id',
  setter: 'setter_id',
  closer: 'closer_id',
  team_leader: 'team_leader_id',
  afiliado: 'afiliado_id',
}

export function ehColunaDeParticipacao(v: unknown): v is (typeof COLUNAS_DE_PARTICIPACAO)[number] {
  return typeof v === 'string' && (COLUNAS_DE_PARTICIPACAO as readonly string[]).includes(v)
}

/** O mínimo de um negócio para se decidir quem lhe pode mexer. */
export type AtribuicoesDoNegocio = {
  [K in (typeof COLUNAS_DE_PARTICIPACAO)[number]]?: string | null
}

/** Esta pessoa participa neste negócio? É a pergunta de leitura, feita linha a linha. */
export function participaNoNegocio(negocio: AtribuicoesDoNegocio, pessoaId: string): boolean {
  if (!ehUuid(pessoaId)) return false
  return COLUNAS_DE_PARTICIPACAO.some((c) => negocio[c] === pessoaId)
}

/**
 * ⭐ A PERGUNTA DE ESCRITA: esta pessoa pode mexer neste negócio?
 *
 * Pode se alguma das cinco atribuições estiver dentro do ÂMBITO dela — o dela própria, ou a de
 * alguém que ela lidera. `todos` (só o dono, e só no extracto) passa sem filtro, por um caminho
 * explícito: não existe combinação de listas vazias que dê no mesmo.
 *
 * Um negócio SEM nenhuma atribuição não é de ninguém e ninguém lhe mexe — nem sequer quem o criou,
 * se se tiver tirado de lá. É deliberado: um negócio órfão é um negócio a que toda a gente com
 * backoffice poderia mexer se a regra fosse «não tem dono, logo é meu».
 */
export function podeMexerNoNegocio(negocio: AtribuicoesDoNegocio, ambito: AmbitoLeitura): boolean {
  if (ambito.todos) return true
  const dentro = new Set(ambito.ids.filter(ehUuid))
  if (dentro.size === 0) return false
  return COLUNAS_DE_PARTICIPACAO.some((c) => {
    const v = negocio[c]
    return typeof v === 'string' && dentro.has(v)
  })
}

// ═══════════════════════ MOVER O NEGÓCIO ═══════════════════════

export type Recusa = { ok: false; erro: string }
export type Aceite<T> = { ok: true; valor: T }
export type Resultado<T> = Aceite<T> | Recusa

const recusa = (erro: string): Recusa => ({ ok: false, erro })

/**
 * PORQUE É QUE NÃO HÁ UM CATÁLOGO DE TRANSIÇÕES PERMITIDAS
 *
 * A tentação era escrever «de `lead` só se vai para `contactado`». O funil real não é assim: chega
 * gente já qualificada por indicação, há reuniões marcadas no primeiro contacto, e quem disse «não
 * é agora» volta meses depois. Um catálogo apertado não impede nada disso de acontecer — só
 * obriga a pessoa a clicar três vezes para chegar onde já está, e o que se ganha é um histórico
 * com três eventos que nunca aconteceram.
 *
 * O que se exige é o que tem consequência:
 *  · mover para o MESMO estado não é um movimento (e escrevia um evento a dizer que foi);
 *  · `perdido` sem motivo não se aceita — um pipeline sem motivos de perda não ensina nada a quem
 *    vende, e é a única informação que sobra de um negócio que se foi.
 */
export function validarMudancaDeEstado(entrada: {
  de: string
  para: unknown
  motivoPerda?: unknown
}): Resultado<{ para: EstadoPipeline; motivoPerda: string | null }> {
  if (!ehEstadoPipeline(entrada.para)) {
    return recusa(`Estado desconhecido. Os estados são: ${ESTADOS_PIPELINE.join(', ')}.`)
  }
  if (entrada.de === entrada.para) {
    return recusa('O negócio já está nesse estado — isso não é um movimento.')
  }
  const motivo = typeof entrada.motivoPerda === 'string' ? entrada.motivoPerda.trim() : ''
  if (entrada.para === 'perdido' && motivo.length === 0) {
    return recusa('Para dar um negócio por perdido tem de ficar escrito porquê.')
  }
  return { ok: true, valor: { para: entrada.para, motivoPerda: motivo.length > 0 ? motivo : null } }
}

/**
 * Os campos a gravar no NEGÓCIO quando ele muda de estado — e mais nenhuns.
 *
 * Repara no que NÃO está aqui: nada de venda, nada de comissão, nada de valor. `ganho` escreve
 * exactamente os mesmos três campos que `contactado`. É esta função que a guarda lê para provar
 * que marcar «ganho» não faz nascer dinheiro nenhum.
 *
 * `fechado_em` acompanha o fecho e LIMPA-SE ao reabrir: um negócio que volta a `contactado` com
 * uma data de fecho antiga é um negócio que qualquer relatório conta como fechado.
 */
export function camposDaMudancaDeEstado(
  para: EstadoPipeline,
  motivoPerda: string | null,
  agora: Date = new Date(),
): Record<string, string | null> {
  const fechado = para === 'ganho' || para === 'perdido'
  return {
    estado: para,
    // O motivo é da perda. Num negócio que deixa de estar perdido, apagar é a verdade.
    motivo_perda: para === 'perdido' ? motivoPerda : null,
    fechado_em: fechado ? agora.toISOString() : null,
    atualizado_em: agora.toISOString(),
  }
}

/**
 * O EVENTO. Um estado é um facto com autor: quem, quando, de onde para onde.
 *
 * `por` vem sempre da sessão verificada pelo servidor, nunca do corpo do pedido — é isso que
 * permite responder «eu marquei essa reunião» com a base em vez de com a memória de alguém.
 */
export function eventoDeEstado(entrada: {
  negocioId: string
  de: string | null
  para: EstadoPipeline
  por: string
  nota?: string | null
}): Record<string, unknown> {
  return {
    negocio_id: entrada.negocioId,
    de: entrada.de,
    para: entrada.para,
    por: entrada.por,
    nota: entrada.nota && entrada.nota.trim() ? entrada.nota.trim() : null,
  }
}

/**
 * O evento de uma ATRIBUIÇÃO (quem prospectou, quem marcou, quem fecha).
 *
 * `de` e `para` ficam AMBOS com o estado actual — que não mudou — e a mudança real vai na nota.
 * Parece estranho até se ver a alternativa: escrever `de='closer:—', para='closer:Ana'` numa coluna
 * que todos os leitores do histórico traduzem por nome de estado (`ESTADO_PIPELINE_NOME`) dava um
 * histórico com estados inventados. `de === para` lê-se, sem ambiguidade, como «não mudou de
 * estado, mudou outra coisa», e a linha continua a responder quem e quando.
 */
export function eventoDeAtribuicao(entrada: {
  negocioId: string
  estadoActual: string
  papel: Papel
  paraNome: string | null
  por: string
}): Record<string, unknown> {
  const quem = entrada.paraNome && entrada.paraNome.trim() ? entrada.paraNome.trim() : 'ninguém'
  return {
    negocio_id: entrada.negocioId,
    de: entrada.estadoActual,
    para: entrada.estadoActual,
    por: entrada.por,
    nota: `Atribuição: ${entrada.papel} passa a ser ${quem}.`,
  }
}

// ═══════════════════════ ATRIBUIR PAPÉIS ═══════════════════════

/**
 * QUEM PODE PÔR QUEM NUM NEGÓCIO.
 *
 * Atribuir um papel não é arrumação: é dar acesso ao negócio e, quando ele fechar, à comissão que
 * nasce desse papel. Por isso há duas regras e não uma:
 *
 *  1. A SI PRÓPRIO, num lugar VAGO: qualquer participante pode. É o caso normal — o setter marcou
 *     a reunião e põe-se como setter. Não tira nada a ninguém.
 *  2. A OUTRA PESSOA, ou por cima de quem já lá está: só quem tem âmbito de equipa, e só para
 *     alguém DENTRO do âmbito dele. Aqui a lista faz o trabalho todo: `ambito.ids` é exactamente
 *     a gente por quem esta pessoa responde. Sem a lista, isto seria «é team leader? então pode» —
 *     e um team leader podia pôr no seu negócio um closer de outra equipa.
 *
 * Tirar alguém (novoId `null`) é uma escrita por cima de quem lá está, logo cai na regra 2 —
 * excepto tirar-se a si próprio, que é a regra 1 ao contrário e qualquer um pode fazer.
 */
export function validarAtribuicao(entrada: {
  papel: unknown
  ocupanteActual: string | null | undefined
  novoId: unknown
  autorId: string
  ambito: AmbitoLeitura
  temAmbitoEquipa: boolean
}): Resultado<{ coluna: (typeof COLUNAS_DE_PARTICIPACAO)[number]; papel: Papel; novoId: string | null }> {
  const papel = entrada.papel
  if (typeof papel !== 'string' || !(papel in COLUNA_DO_PAPEL)) {
    return recusa('Papel desconhecido. São cinco: prospector, setter, closer, team_leader, afiliado.')
  }
  const p = papel as Papel

  const novoId = entrada.novoId === null || entrada.novoId === '' ? null : entrada.novoId
  if (novoId !== null && !ehUuid(novoId)) return recusa('A pessoa indicada não é um id válido.')

  const actual = entrada.ocupanteActual ?? null
  if (actual === novoId) return recusa('Essa atribuição já está assim.')

  const souEu = novoId === entrada.autorId
  const lugarVago = actual === null
  const estouALibertarOMeu = novoId === null && actual === entrada.autorId

  if (!(souEu && lugarVago) && !estouALibertarOMeu) {
    // Regra 2. Primeiro o direito, depois o alcance — e o alcance é a lista, sempre.
    if (!entrada.temAmbitoEquipa) {
      return recusa('Só podes pôr-te a ti próprio num lugar vago. Mudar a atribuição de outra pessoa é de quem responde pela equipa.')
    }
    const dentro = entrada.ambito.todos ? null : new Set(entrada.ambito.ids.filter(ehUuid))
    // Quem sai e quem entra têm os dois de estar dentro do âmbito: pôr lá alguém de fora dava-lhe
    // acesso a um negócio que não é da equipa dele, e tirar alguém de fora mexia no trabalho de
    // uma equipa que não é esta.
    for (const id of [actual, typeof novoId === 'string' ? novoId : null]) {
      if (id && dentro && !dentro.has(id)) {
        return recusa('Essa pessoa não é da tua equipa.')
      }
    }
  }

  return { ok: true, valor: { coluna: COLUNA_DO_PAPEL[p], papel: p, novoId: typeof novoId === 'string' ? novoId : null } }
}

// ═══════════════════════ CRIAR UM NEGÓCIO ═══════════════════════

/** Texto de formulário: corta espaços, transforma vazio em `null`, e corta o que é demasiado. */
export function texto(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t.length === 0) return null
  return t.slice(0, max)
}

/**
 * O negócio novo, validado.
 *
 * QUEM CRIA FICA DENTRO. O `papel` escolhido põe o criador numa das cinco colunas, e não é
 * opcional: um negócio criado sem nenhuma atribuição nasce órfão — não aparece no pipeline de
 * ninguém (o filtro é por participação) e ninguém lhe consegue mexer depois. A pessoa criava um
 * lead e via-o desaparecer.
 *
 * O papel tem de ser um dos papéis ACTIVOS de quem cria. Sem isto, um setter criava negócios já
 * com o lugar de closer ocupado por ele, e a comissão de fecho seguia-lhe atrás.
 */
export function validarNegocioNovo(entrada: {
  corpo: Record<string, unknown>
  autorId: string
  papeisDoAutor: readonly Papel[]
  ehDono: boolean
}): Resultado<{ linha: Record<string, unknown>; papel: Papel }> {
  const nome = texto(entrada.corpo.nome, 120)
  if (!nome) return recusa('Um negócio precisa de um nome — é por ele que se reconhece a pessoa.')

  const papel = entrada.corpo.papel
  if (typeof papel !== 'string' || !(papel in COLUNA_DO_PAPEL)) {
    return recusa('Diz com que papel entras neste negócio (prospector, setter, closer, team_leader ou afiliado).')
  }
  const p = papel as Papel
  // O dono não tem papéis atribuídos (tem tudo por ser dono) e continua a ter de escolher um: é o
  // papel que fica gravado no negócio, e um negócio sem papel de quem o trabalha não paga a ninguém.
  if (!entrada.ehDono && !entrada.papeisDoAutor.includes(p)) {
    return recusa('Esse não é um papel teu. Entras no negócio com um papel que tens.')
  }

  const estado = entrada.corpo.estado === undefined ? 'lead' : entrada.corpo.estado
  if (!ehEstadoPipeline(estado)) return recusa('Estado desconhecido para um negócio novo.')
  // Um negócio NASCE aberto. Criar já em `ganho` saltava o histórico todo — e o histórico é a
  // única coisa que responde mais tarde a «quem trabalhou isto».
  if (estado === 'ganho' || estado === 'perdido') {
    return recusa('Um negócio não nasce fechado. Cria-o e move-o — é o percurso que fica gravado.')
  }

  const linha: Record<string, unknown> = {
    nome,
    email: texto(entrada.corpo.email, 200),
    telefone: texto(entrada.corpo.telefone, 40),
    telegram_id: texto(entrada.corpo.telegram_id, 80),
    pack_previsto: texto(entrada.corpo.pack_previsto, 60),
    origem: texto(entrada.corpo.origem, 60),
    nota: texto(entrada.corpo.nota, 2000),
    estado,
    criado_por: entrada.autorId,
    [COLUNA_DO_PAPEL[p]]: entrada.autorId,
  }
  return { ok: true, valor: { linha, papel: p } }
}

// ═══════════════════════ TAREFAS ═══════════════════════

export const ESTADOS_TAREFA = ['aberta', 'feita', 'cancelada'] as const
export type EstadoTarefa = (typeof ESTADOS_TAREFA)[number]

export function ehEstadoTarefa(v: unknown): v is EstadoTarefa {
  return typeof v === 'string' && (ESTADOS_TAREFA as readonly string[]).includes(v)
}

/** Um prazo é um dia (a coluna é `date`), ou não é um prazo. Uma data impossível recusa-se. */
export function validarPrazo(v: unknown): Resultado<string | null> {
  if (v === null || v === undefined || v === '') return { ok: true, valor: null }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return recusa('O prazo é um dia, no formato AAAA-MM-DD.')
  }
  const t = Date.parse(`${v}T00:00:00Z`)
  if (!Number.isFinite(t)) return recusa('Essa data não existe.')
  return { ok: true, valor: v }
}

/**
 * A tarefa nova.
 *
 * O RESPONSÁVEL por defeito é quem cria. Pôr outra pessoa é dar-lhe trabalho, e isso é de quem
 * responde pela equipa — outra vez pela LISTA: o responsável tem de estar dentro do âmbito de
 * tarefas de quem cria. Fora disso, qualquer um atribuía tarefas a qualquer colega.
 *
 * O `negocio_id` não se valida aqui: saber se aquele negócio é do âmbito da pessoa obriga a ler a
 * base, e isso faz-se na rota. O que este ficheiro garante é que só passa um uuid ou nada.
 */
export function validarTarefaNova(entrada: {
  corpo: Record<string, unknown>
  autorId: string
  ambitoTarefas: AmbitoLeitura
  temAmbitoEquipa: boolean
}): Resultado<Record<string, unknown>> {
  const titulo = texto(entrada.corpo.titulo, 160)
  if (!titulo) return recusa('Uma tarefa precisa de um título — sem ele, a lista não se lê.')

  const prazo = validarPrazo(entrada.corpo.prazo)
  if (!prazo.ok) return prazo

  const pedido = entrada.corpo.responsavel_id
  let responsavel = entrada.autorId
  if (typeof pedido === 'string' && pedido.length > 0 && pedido !== entrada.autorId) {
    if (!ehUuid(pedido)) return recusa('O responsável indicado não é um id válido.')
    if (!entrada.temAmbitoEquipa) return recusa('Só podes criar tarefas para ti. Dar trabalho a outra pessoa é de quem responde pela equipa.')
    const dentro = entrada.ambitoTarefas.todos ? null : new Set(entrada.ambitoTarefas.ids.filter(ehUuid))
    if (dentro && !dentro.has(pedido)) return recusa('Essa pessoa não é da tua equipa.')
    responsavel = pedido
  }

  const papel = entrada.corpo.papel
  const negocioId = entrada.corpo.negocio_id

  return {
    ok: true,
    valor: {
      titulo,
      descricao: texto(entrada.corpo.descricao, 2000),
      responsavel_id: responsavel,
      negocio_id: ehUuid(negocioId) ? negocioId : null,
      papel: typeof papel === 'string' && papel in COLUNA_DO_PAPEL ? papel : null,
      prazo: prazo.valor,
      estado: 'aberta',
      criado_por: entrada.autorId,
    },
  }
}

/**
 * A mudança numa tarefa que já existe: riscar, reabrir, cancelar ou mudar o prazo.
 *
 * CANCELAR NÃO É APAGAR e não se desfaz daqui: uma tarefa cancelada sai da lista de trabalho mas
 * fica na base. Reabrir uma cancelada obrigaria a distinguir «cancelei por engano» de «mudei de
 * ideias», e a segunda faz-se criando outra — que é o que deixa rasto de que houve uma decisão.
 *
 * `feita_em` acompanha SEMPRE o estado: uma data de conclusão numa tarefa aberta é o género de
 * inconsistência que só se descobre quando alguém conta tarefas feitas por mês.
 */
export function validarMudancaDeTarefa(entrada: {
  corpo: Record<string, unknown>
  estadoActual: string
  agora?: Date
}): Resultado<Record<string, unknown>> {
  const agora = entrada.agora ?? new Date()
  const campos: Record<string, unknown> = {}

  if ('feita' in entrada.corpo || 'estado' in entrada.corpo) {
    const alvo = ehEstadoTarefa(entrada.corpo.estado)
      ? entrada.corpo.estado
      : entrada.corpo.feita === true
        ? 'feita'
        : entrada.corpo.feita === false
          ? 'aberta'
          : null
    if (!alvo) return recusa('Estado de tarefa desconhecido.')
    if (entrada.estadoActual === 'cancelada') {
      return recusa('Esta tarefa foi cancelada. Se voltou a ser precisa, cria outra — assim fica claro que houve uma decisão.')
    }
    campos.estado = alvo
    campos.feita_em = alvo === 'feita' ? agora.toISOString() : null
  }

  if ('prazo' in entrada.corpo) {
    const prazo = validarPrazo(entrada.corpo.prazo)
    if (!prazo.ok) return prazo
    campos.prazo = prazo.valor
  }

  if (Object.keys(campos).length === 0) return recusa('Não pediste nenhuma mudança.')
  campos.atualizado_em = agora.toISOString()
  return { ok: true, valor: campos }
}
