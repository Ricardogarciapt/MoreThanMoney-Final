import { ESTADOS_PIPELINE, type EstadoPipeline } from '@/lib/backoffice-vista'
import type { Papel } from '@/lib/backoffice-papeis'

/**
 * AS REGRAS DO DIA — o que cada pessoa da equipa devia estar a fazer, e porquê.
 *
 * PORQUE É QUE ISTO EXISTE
 * O backoffice tinha pipeline, tarefas, equipa e comissões — e zero negócios lá dentro. Uma casa
 * bonita onde não entrava ninguém. Ao lado, leads a chegar pelo Telegram e pelo Instagram sem
 * ninguém a trabalhá-los, e o `equipa-vigia` a avisar o dono de negócios parados que nunca
 * existiram. O que faltava não era mais um ecrã: era alguém a dizer, todas as manhãs, a cada
 * pessoa, o que fazer primeiro.
 *
 * Este ficheiro é esse alguém. É PURO de propósito — não toca na base de dados, não fala com o
 * Telegram, não chama a IA. Recebe números e devolve decisões. É isso que permite prendê-lo com
 * guardas (`backoffice-dia-regras.check.ts`) em vez de o testar em produção, com pessoas reais do
 * outro lado.
 *
 * O QUE ESTE FICHEIRO NÃO DECIDE
 * Não decide falar com ninguém. Prepara trabalho para pessoas; quem fala com o cliente é a pessoa.
 * Essa fronteira é deliberada e está explicada em `motorDoDia`.
 */

// ── Quem é o dono de cada momento do funil ────────────────────────────────────

/**
 * O papel responsável por cada estado.
 *
 * Não é organograma — é quem tem a competência para o passo seguinte. Um lead cru precisa de
 * alguém que abra conversa (prospector). Uma conversa aberta precisa de quem qualifique e marque
 * (setter). Uma reunião marcada precisa de quem feche (closer).
 *
 * O `no_show` volta ao setter e não ao closer de propósito: quem não apareceu não precisa de outra
 * apresentação, precisa de outra marcação — e é o setter que sabe remarcar sem queimar a pessoa.
 */
export const PAPEL_DO_ESTADO: Record<EstadoPipeline, Papel | null> = {
  lead: 'prospector',
  contactado: 'setter',
  qualificado: 'setter',
  marcado: 'closer',
  no_show: 'setter',
  apresentado: 'closer',
  ganho: null,
  perdido: null,
}

/** Os estados em que ainda há trabalho a fazer. Ganho e perdido não geram tarefas. */
export const ESTADOS_VIVOS = ESTADOS_PIPELINE.filter(
  (e) => PAPEL_DO_ESTADO[e] !== null,
) as readonly EstadoPipeline[]

export function estadoEstaVivo(estado: string): estado is EstadoPipeline {
  return (ESTADOS_VIVOS as readonly string[]).includes(estado)
}

// ── Cadência: ao fim de quantos dias é que um negócio precisa de atenção ──────

/**
 * A cadência de arranque, por estado, em dias.
 *
 * São números de partida, não verdades. Valem enquanto não houver histórico que chegue para medir
 * — e assim que houver, é a medição que manda (ver `cadenciaDoEstado`). Estão espaçados pela
 * temperatura do momento: quem acabou de ser contactado esfria em horas; quem já viu a
 * apresentação aguenta dois dias sem que o seguimento pareça perseguição.
 */
export const CADENCIA_DE_ARRANQUE: Record<EstadoPipeline, number> = {
  lead: 1,
  contactado: 2,
  qualificado: 2,
  marcado: 1,
  no_show: 1,
  apresentado: 2,
  ganho: 0,
  perdido: 0,
}

/** Quantos negócios ganhos são precisos num estado antes de acreditarmos na medição. */
export const AMOSTRA_MINIMA = 5

/** Limites de segurança: a medição nunca produz cadências absurdas. */
export const CADENCIA_MINIMA_DIAS = 1
export const CADENCIA_MAXIMA_DIAS = 14

export interface MedidaDeEstado {
  estado: EstadoPipeline
  /** Mediana de dias que os negócios GANHOS passaram neste estado. */
  diasMedianos: number
  /** Quantos negócios ganhos entraram nesta medição. */
  amostra: number
}

export interface Cadencia {
  dias: number
  /** `medida` = veio do histórico real. `arranque` = ainda não há amostra que chegue. */
  fonte: 'medida' | 'arranque'
}

/**
 * QUANTOS DIAS ESPERAR NESTE ESTADO — e é aqui que o sistema evolui.
 *
 * A parte adaptativa não é um enfeite: a cadência sai do tempo que os negócios GANHOS levaram
 * naquele estado. Se os que fecham costumam sair de «qualificado» em 1 dia, esperar 2 é perder
 * metade deles; se levam 4, empurrar ao segundo dia é queimar pessoas que iam fechar na mesma.
 *
 * Mede-se pelos ganhos e não por todos de propósito. A média de todos inclui os que apodreceram no
 * estado — e aprender com eles ensinaria o sistema a ser lento. Aprende-se com quem ganhou.
 *
 * Sem amostra que chegue, devolve-se o valor de arranque e DIZ-SE que é de arranque. Um número
 * inventado com ar de medição é pior do que um número assumido.
 */
export function cadenciaDoEstado(
  estado: EstadoPipeline,
  medidas: readonly MedidaDeEstado[],
  amostraMinima: number = AMOSTRA_MINIMA,
): Cadencia {
  const m = medidas.find((x) => x.estado === estado)
  if (!m || m.amostra < amostraMinima || !Number.isFinite(m.diasMedianos)) {
    return { dias: CADENCIA_DE_ARRANQUE[estado], fonte: 'arranque' }
  }
  const dias = Math.min(CADENCIA_MAXIMA_DIAS, Math.max(CADENCIA_MINIMA_DIAS, Math.round(m.diasMedianos)))
  return { dias, fonte: 'medida' }
}

// ── Prioridade: por onde começar quando há mais trabalho do que tempo ─────────

export interface NegocioParaOrdenar {
  estado: EstadoPipeline
  /** Dias desde a última mexida no negócio. */
  diasParado: number
  /** A cadência que vale para este estado, já resolvida. */
  cadenciaDias: number
  /** O pack esperado, quando se sabe. Serve para desempatar, nunca para atropelar o tempo. */
  packPrevisto?: string | null
  /** De onde veio. Uma pessoa que veio pedir informação vale mais do que uma raspada de hashtag. */
  origem?: string | null
}

/** Quanto vale cada pack ao desempatar. Não é o preço — é a ordem de grandeza do esforço. */
export const PESO_DO_PACK: Record<string, number> = {
  fundador: 10,
  elite: 8,
  premium: 6,
  membro: 4,
  scanners: 3,
}

/** Origens que já mostraram intenção valem mais do que origens de rede varrida. */
export const PESO_DA_ORIGEM: Record<string, number> = {
  telegram: 8,
  site: 8,
  indicacao: 10,
  instagram: 5,
  radar: 2,
}

/**
 * A PRIORIDADE, de 0 a 100.
 *
 * O peso maior é o do ATRASO, e é de propósito: o que mata um pipeline não é falta de leads bons,
 * é gente boa esquecida. Um negócio que passou o dobro da cadência salta à frente de um negócio
 * melhor que ainda está dentro do prazo — porque aquele está a evaporar-se e este não.
 *
 * O pack e a origem entram só como desempate (até 20 pontos somados). Deixá-los pesar mais fazia o
 * sistema perseguir o negócio grande e deixar morrer dez pequenos — que é exactamente o erro que
 * um humano cansado já comete sozinho, sem precisar de ajuda.
 */
export function prioridade(n: NegocioParaOrdenar): number {
  const cadencia = Math.max(CADENCIA_MINIMA_DIAS, n.cadenciaDias)
  // 1.0 = mesmo em cima do prazo. 2.0 = o dobro do prazo. Corta-se em 3 para o atraso não engolir tudo.
  const atraso = Math.min(3, Math.max(0, n.diasParado) / cadencia)
  const pontosAtraso = (atraso / 3) * 80

  const pack = n.packPrevisto ? (PESO_DO_PACK[n.packPrevisto.toLowerCase()] ?? 0) : 0
  const origem = n.origem ? (PESO_DA_ORIGEM[n.origem.toLowerCase()] ?? 0) : 0
  const pontosDesempate = Math.min(20, pack + origem)

  return Math.round(Math.min(100, pontosAtraso + pontosDesempate))
}

/**
 * Está na hora de mexer neste negócio?
 *
 * O PRIMEIRO TOQUE NÃO ESPERA. Um lead em que ainda ninguém tocou trabalha-se no próprio dia,
 * qualquer que seja a cadência — é a única altura em que a pessoa do outro lado ainda se lembra do
 * que a trouxe cá. Sem esta excepção, os 21 negócios que a ingestão criou esta manhã ficavam todos
 * a marinar até amanhã, e a cadência (pensada para ESPAÇAR insistências) passava a atrasar o
 * primeiro contacto — exactamente o contrário do que ela existe para fazer.
 */
export function precisaAccao(diasParado: number, cadenciaDias: number, jaTocado = true): boolean {
  if (!jaTocado) return true
  return diasParado >= Math.max(CADENCIA_MINIMA_DIAS, cadenciaDias)
}

/**
 * Passou do ponto de alguém insistir sozinho — o team leader tem de saber.
 *
 * Três vezes a cadência. Antes disso é trabalho normal e avisar o chefe só faz barulho; a partir
 * daí já não é esquecimento, é um negócio encravado, e encravado costuma querer dizer que a pessoa
 * responsável precisa de ajuda e não de outro lembrete.
 */
export const FACTOR_ESCALADA = 3

export function precisaEscalar(diasParado: number, cadenciaDias: number): boolean {
  return diasParado >= Math.max(CADENCIA_MINIMA_DIAS, cadenciaDias) * FACTOR_ESCALADA
}

// ── O que fazer a seguir, em palavras que a pessoa entende ────────────────────

export interface Accao {
  /** O que fazer. Entra como título da tarefa, por isso é uma ordem, não uma descrição. */
  titulo: string
  /** Porque é agora. É isto que faz a pessoa não adiar. */
  porque: string
  /** O que se pede à IA para redigir. Vazio = este passo não tem mensagem para escrever. */
  pedidoIA: string
}

/**
 * A PRÓXIMA ACÇÃO de um negócio, pelo estado em que está.
 *
 * Cada passo diz o que fazer e PORQUÊ AGORA. O porquê não é enfeite: é a diferença entre uma lista
 * de tarefas que se cumpre e uma que se adia. «Contactar João» adia-se; «o João perguntou pelo
 * Premium há 4 dias e ainda não teve resposta» não se adia com a mesma facilidade.
 *
 * A partir do segundo toque o texto muda: insistir com as mesmas palavras é o que transforma
 * seguimento em chatice, e é a razão número um para uma pessoa bloquear quem lhe escreve.
 */
export function proximaAccao(estado: EstadoPipeline, toquesJaDados: number): Accao {
  const insiste = toquesJaDados >= 1
  const jaInsistiuMuito = toquesJaDados >= 3

  switch (estado) {
    case 'lead':
      return {
        titulo: insiste ? 'Segunda tentativa de contacto' : 'Abrir conversa',
        porque: insiste
          ? 'Já houve um toque sem resposta. Muda-se o ângulo, não se repete a mensagem.'
          : 'Chegou e ainda ninguém falou com esta pessoa. Quanto mais fresco, maior a resposta.',
        pedidoIA: insiste
          ? 'Escreve uma segunda abordagem, com ângulo diferente da primeira, sem cobrar resposta.'
          : 'Escreve uma primeira abordagem curta, referindo o que a pessoa procurava.',
      }

    case 'contactado':
      return {
        titulo: jaInsistiuMuito ? 'Fechar ou arquivar' : 'Qualificar',
        porque: jaInsistiuMuito
          ? 'Vários toques sem avanço. Pergunta-se de frente e aceita-se o não — vale mais do que um talvez eterno.'
          : 'Respondeu. Falta perceber se há encaixe antes de se gastar tempo dos dois.',
        pedidoIA: jaInsistiuMuito
          ? 'Escreve uma saída elegante que deixa a porta aberta e pede uma resposta clara.'
          : 'Escreve duas ou três perguntas curtas para perceber objectivo, obstáculo e timing.',
      }

    case 'qualificado':
      return {
        titulo: 'Marcar a conversa',
        porque: 'Já se sabe que há encaixe. O que falta é data — e é aqui que a maioria se perde.',
        pedidoIA: 'Propõe dois horários concretos para uma conversa curta, sem pedir autorização para marcar.',
      }

    case 'marcado':
      return {
        titulo: 'Confirmar presença',
        porque: 'Uma confirmação no dia anterior é o que separa uma reunião de um no-show.',
        pedidoIA: 'Escreve uma confirmação curta que lembra a hora e o que a pessoa vai levar da conversa.',
      }

    case 'no_show':
      return {
        titulo: 'Recuperar a marcação',
        porque: 'Não apareceu — na maioria das vezes é agenda, não desinteresse. Remarca-se sem cobrar.',
        pedidoIA: 'Escreve uma remarcação sem culpa nem queixa, a propor nova data.',
      }

    case 'apresentado':
      return {
        titulo: jaInsistiuMuito ? 'Pedir decisão' : 'Seguir a proposta',
        porque: jaInsistiuMuito
          ? 'Viu a proposta e já foi seguida. Sem decisão, isto ocupa lugar a quem decide.'
          : 'Viu a proposta. A dúvida que não se responde nos primeiros dias vira um não silencioso.',
        pedidoIA: jaInsistiuMuito
          ? 'Pede uma decisão — sim ou não — sem pressão artificial e sem prazos inventados.'
          : 'Pergunta que dúvida ficou da apresentação, sem repetir a proposta inteira.',
      }

    default:
      return { titulo: 'Rever', porque: 'Estado sem passo definido.', pedidoIA: '' }
  }
}

// ── Idempotência: o motor corre todos os dias e não pode empilhar tarefas ─────

/**
 * A chave que impede a mesma tarefa de nascer duas vezes.
 *
 * O motor corre de manhã, mas pode ser corrido à mão, pode falhar a meio e ser repetido, e a
 * Vercel pode disparar o mesmo cron duas vezes. Sem chave, a pessoa abria o backoffice e via a
 * mesma tarefa três vezes — e uma lista em que não se confia é uma lista que não se usa.
 *
 * `dia` é a data em Lisboa e não UTC: quem trabalha é que define o que é «hoje».
 */
export function chaveTarefaDoDia(negocioId: string, dia: string): string {
  return `dia:${dia}:${negocioId}`
}

/** A data de hoje em Lisboa, no formato AAAA-MM-DD. */
export function diaEmLisboa(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)
}

/**
 * Hoje é dia de trabalho?
 *
 * O motor não prepara o dia ao sábado nem ao domingo. Encher a lista de alguém ao fim-de-semana
 * não faz vender mais: faz com que na segunda-feira a pessoa abra o backoffice, veja três dias de
 * tarefas acumuladas e feche o separador.
 */
export function ehDiaUtil(dia: string): boolean {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay()
  return d >= 1 && d <= 5
}

// ── Quanto cabe num dia ───────────────────────────────────────────────────────

/**
 * O TECTO DE TAREFAS POR PESSOA, por dia.
 *
 * Existe para o sistema não fazer o que um sistema destes faz sempre que ninguém o trava: despejar
 * o pipeline inteiro em cima de uma pessoa. Trinta tarefas e zero feitas é pior do que oito e oito
 * feitas — e destrói a confiança na lista, que é o único activo que este motor tem.
 *
 * O prospector leva mais porque o trabalho dele é de volume e cada toque é curto. O closer leva
 * menos porque cada conversa dele é longa e prepara-se.
 */
export const TECTO_DIARIO: Record<Papel, number> = {
  prospector: 15,
  setter: 12,
  closer: 8,
  team_leader: 10,
  afiliado: 5,
}

export function tectoDoPapel(papel: Papel): number {
  return TECTO_DIARIO[papel] ?? 8
}

/**
 * Escolhe o que cabe no dia: os mais prioritários primeiro, até ao tecto.
 *
 * Empate resolve-se pelo mais parado. Dois negócios com a mesma pontuação não são iguais — o que
 * está parado há mais tempo é o que está mais perto de se perder.
 */
export function escolherDoDia<T extends { prioridade: number; diasParado: number }>(
  candidatos: readonly T[],
  tecto: number,
): T[] {
  return [...candidatos]
    .sort((a, b) => b.prioridade - a.prioridade || b.diasParado - a.diasParado)
    .slice(0, Math.max(0, tecto))
}

/**
 * ENCHER O DIA DE UMA PESSOA QUE COBRE VÁRIOS PAPÉIS.
 *
 * `escolherDoDia` chega quando a pessoa faz um papel só. Não chega quando faz vários — e hoje faz:
 * sem setters nem closers nomeados, o team leader apanha trabalho de prospector, de setter e de
 * closer no mesmo dia. Cortar pelo tecto de um papel qualquer dava uma conta errada nos dois
 * sentidos: 15 conversas de fecho se calhasse o tecto do prospector, ou 8 toques curtos se
 * calhasse o do closer.
 *
 * Aqui cada tarefa CUSTA uma fracção do dia — 1/8 para o closer, 1/15 para o prospector — e
 * enche-se até o dia estar cheio. É a mesma ideia dos tectos, dita de uma forma que sobrevive a
 * alguém fazer três funções ao mesmo tempo.
 *
 * Garante-se sempre pelo menos uma tarefa: um dia que devolve lista vazia por causa de
 * arredondamentos é pior do que um dia com uma linha a mais.
 */
export function encherODia<T extends { prioridade: number; diasParado: number; papel: Papel }>(
  candidatos: readonly T[],
): T[] {
  const ordenados = [...candidatos].sort(
    (a, b) => b.prioridade - a.prioridade || b.diasParado - a.diasParado,
  )
  const escolhidos: T[] = []
  let ocupado = 0
  for (const c of ordenados) {
    const custo = 1 / Math.max(1, tectoDoPapel(c.papel))
    if (escolhidos.length && ocupado + custo > 1) break
    escolhidos.push(c)
    ocupado += custo
  }
  return escolhidos
}

/**
 * QUANTAS INTERACÇÕES SOCIAIS POR DIA, por pessoa.
 *
 * O radar do Instagram tem 477 publicações pendentes e continua a encher. A tentação é despejá-las;
 * o resultado seria o de sempre — ninguém faz 477, e a lista passa a ser ignorada.
 *
 * Cinco por dia é uma coisa que se faz. Vinte e cinco por semana, cento e poucas por mês, e a
 * conta ao fim do ano já não é pequena. A expansão social ganha-se por hábito, não por assalto.
 */
export const TECTO_SOCIAL_DIARIO = 5

/** A chave de uma interacção social. Sem data: cada publicação só se trabalha UMA vez, nunca mais. */
export function chaveTarefaSocial(prospetoId: string): string {
  return `radar:${prospetoId}`
}
