/**
 * PRONTIDÃO PARA FECHO — quanto falta a esta pessoa para pagar, e o que é esse «falta».
 *
 * Um número sozinho não serve para nada. «Lead: 72» não diz a ninguém o que fazer a seguir, e ao
 * fim de uma semana ninguém confia nele porque ninguém sabe de onde veio. Por isso esta função
 * devolve SEMPRE três coisas juntas:
 *
 *   • os pontos — para ordenar a lista;
 *   • os critérios, um a um, com o que cada um valeu e se está cumprido — para se poder discordar;
 *   • o próximo passo concreto — que é a única parte que se executa.
 *
 * ── A ESCADA MANDA NA ORDEM ────────────────────────────────────────────────────────────────────
 * Os pesos não são gosto pessoal: seguem a ordem por que uma pessoa se torna cliente nesta casa.
 * Falar connosco vale pouco (é barato); dizer o que quer vale mais; abrir a conta na corretora
 * vale muito porque é o passo que toda a gente adia; ter depósito vale mais ainda porque é
 * dinheiro que já saiu da conta dela. Pagar-nos é o fim da escada e por isso não pontua — quem já
 * paga saiu da lista de fecho e entra na de retenção.
 *
 * ── O QUE NÃO ENTRA AQUI ───────────────────────────────────────────────────────────────────────
 * Não há pontos por «parecer interessado», por emojis, nem por nada que se leia numa mensagem. É
 * de propósito: a única coisa que distingue um lead quente de um lead simpático são passos DADOS,
 * e passos dados ficam gravados. Tudo o que é interpretação fica de fora para o número não mentir.
 *
 * Lógica pura — sem base de dados, sem rede. Quem lê o Supabase é o `perfil-lead.ts`.
 *
 *   npx tsx lib/__tests__/pontuacao-fecho.check.ts
 */

/** Os factos que decidem a pontuação. Tudo o que não sabemos vem a `null` e conta como não feito. */
export interface DadosDeFecho {
  /**
   * Falou com o bot em privado.
   *
   * É o primeiro degrau e o mais importante de todos por uma razão técnica: um bot do Telegram
   * NÃO pode iniciar conversa com quem nunca lhe escreveu. Enquanto isto for `false`, não há
   * nada que o sistema possa fazer sozinho — a abordagem tem de ser do dono ou de um post.
   */
  falouEmPrivado: boolean
  /** O caminho que escolheu: 'ecossistema', 'mtmauto', 'indeciso' ou nada. */
  interesse: string | null
  /** Onde está no funil da corretora (`telegram_leads.stage`). */
  estado: string | null
  /** O passo do MTM Auto, quando é esse o caminho ('corretora' → 'app_instalada' → 'a_operar' → 'validado'). */
  passoMtmAuto: string | null
  /** O número que a pessoa escreveu. Escrever não é ter. */
  uidCorretora: string | null
  /** O UID bate certo com a lista que veio da corretora. Isto sim, é ter. */
  uidConfirmado: boolean
  /** Depósito medido na corretora, em USD. `null` = não sabemos (não é zero). */
  depositoUsd: number | null
  /** Tem conta criada no site. */
  temConta: boolean
  /** Tem uma conta ligada e a copiar (MTM Auto / MTM Copy). */
  contaACopiar: boolean
  /** Já paga — subscrição ativa. */
  pagante: boolean
  /** Dias desde o último sinal de vida. `null` = nunca deu nenhum. */
  diasSemSinal: number | null
  /** Seguimentos automáticos enviados sem que respondesse. */
  seguimentosSemResposta: number
}

export interface Criterio {
  nome: string
  pontos: number
  cumprido: boolean
  /** Porque é que este critério vale o que vale — a frase que se lê ao lado do número. */
  porque: string
}

export type NivelDeFecho = 'pagante' | 'a fechar' | 'quente' | 'morno' | 'frio'

export interface ProntidaoDeFecho {
  pontos: number
  nivel: NivelDeFecho
  criterios: Criterio[]
  /** A única linha que se executa. Nunca vazia. */
  proximoPasso: string
  /**
   * O dono consegue agir sozinho a partir do sistema?
   *
   * `false` quando a pessoa nunca escreveu ao bot: aí não há automatismo possível e a abordagem
   * tem de ser dele, à mão. Dizê-lo aqui evita que alguém construa por cima um «enviar a todos».
   */
  acionavelPeloSistema: boolean
}

const PAGA_O_MTM_AUTO = new Set(['validado'])

/** Um passo do MTM Auto vale mais quanto mais perto do fim estiver. */
function pontosDoPasso(passo: string | null): number {
  switch (passo) {
    case 'validado':
      return 15
    case 'a_operar':
      return 12
    case 'app_instalada':
      return 8
    case 'corretora':
      return 4
    default:
      return 0
  }
}

/**
 * A pontuação, com os critérios à vista.
 *
 * O teto é 100 e o chão é 0 — não por estética, mas porque um número fora da escala deixa de se
 * comparar com o da semana passada.
 */
export function prontidaoDeFecho(d: DadosDeFecho): ProntidaoDeFecho {
  const criterios: Criterio[] = []
  const soma = (nome: string, pontos: number, cumprido: boolean, porque: string) => {
    criterios.push({ nome, pontos: cumprido ? pontos : 0, cumprido, porque })
  }

  soma(
    'Falou connosco em privado',
    10,
    d.falouEmPrivado,
    'sem isto o bot não lhe pode escrever — a abordagem tem de ser tua',
  )
  soma(
    'Disse o que quer',
    12,
    !!d.interesse && d.interesse !== 'indeciso',
    'quem escolheu caminho já se imaginou lá dentro',
  )
  soma('Tem conta no site', 8, d.temConta, 'já deu email e nome — deixou de ser anónimo')
  soma('Deu o UID da corretora', 15, !!d.uidCorretora, 'é o passo que toda a gente adia')
  soma(
    'UID confirmado na corretora',
    18,
    d.uidConfirmado,
    'escrever um número é fácil; bater certo com a lista da corretora é que conta',
  )
  soma(
    'Depositou',
    20,
    (d.depositoUsd ?? 0) > 0,
    'dinheiro que já saiu da conta dela — o melhor indicador que temos',
  )
  soma('Conta ligada a copiar', 12, d.contaACopiar, 'está a receber valor agora; o fecho é só formalizar')

  // O passo do MTM Auto entra como critério próprio e não como bónus escondido.
  const pp = pontosDoPasso(d.passoMtmAuto)
  criterios.push({
    nome: 'Progresso no MTM Auto',
    pontos: pp,
    cumprido: pp > 0,
    porque: d.passoMtmAuto ? `está em «${d.passoMtmAuto}»` : 'ainda não entrou neste caminho',
  })

  /**
   * As penalizações também aparecem na lista.
   *
   * Um lead que esfriou continua a ter os passos que deu — e sem isto ficava eternamente no topo
   * da lista por causa de um UID que entregou há dois meses e de que já nem se lembra.
   */
  if ((d.diasSemSinal ?? 0) > 14) {
    criterios.push({
      nome: 'Esfriou',
      pontos: -15,
      cumprido: true,
      porque: `${d.diasSemSinal} dias sem dar sinal — o que ficou combinado já caiu`,
    })
  }
  if (d.seguimentosSemResposta >= 3) {
    criterios.push({
      nome: 'Não responde aos seguimentos',
      pontos: -12,
      cumprido: true,
      porque: `${d.seguimentosSemResposta} mensagens automáticas sem resposta — insistir pelo mesmo canal não vai mudar nada`,
    })
  }

  const bruto = criterios.reduce((s, c) => s + c.pontos, 0)
  const pontos = Math.max(0, Math.min(100, bruto))

  const nivel: NivelDeFecho = d.pagante
    ? 'pagante'
    : pontos >= 70
      ? 'a fechar'
      : pontos >= 45
        ? 'quente'
        : pontos >= 20
          ? 'morno'
          : 'frio'

  return {
    pontos,
    nivel,
    criterios,
    proximoPasso: proximoPasso(d),
    acionavelPeloSistema: d.falouEmPrivado,
  }
}

/**
 * O próximo passo — um só, o primeiro degrau que falta.
 *
 * Por ordem da escada, e não por ordem de importância: dizer a alguém que ainda não abriu conta
 * na corretora que «falta ligar a conta ao copiador» é falar-lhe de um degrau que ela não vê.
 */
export function proximoPasso(d: DadosDeFecho): string {
  if (d.pagante) return 'Já paga. Sai da lista de fecho — o trabalho aqui é retenção.'

  if (!d.falouEmPrivado) {
    return 'Nunca escreveu ao bot: o bot não lhe pode escrever primeiro. Abordagem tua, ou um post com chamada à ação no grupo onde apareceu.'
  }

  if (d.estado === 'pending_review') {
    return 'Tem o pedido de acesso à espera da tua aprovação. Abre «Pendentes» e decide — cada dia parado é um lead a arrefecer.'
  }

  if (d.estado === 'awaiting_proof') {
    return `Deu o UID ${d.uidCorretora ?? '(?)'} e falta o print do depósito. Se o UID já aparecer na lista da corretora, aprova sem esperar pelo print.`
  }

  if (d.estado === 'revoked') {
    return 'Teve acesso e perdeu-o por saldo abaixo do mínimo. Não é um lead novo — é um cliente a recuperar, e a conversa começa por perguntar o que aconteceu.'
  }

  if (d.estado === 'rejected') {
    return 'Foi recusado uma vez. Só volta à lista se houver dados novos da corretora — não insistas pelo mesmo caminho.'
  }

  /**
   * A pergunta do caminho só se faz a quem ainda não deu o UID.
   *
   * Quem já entregou o número da corretora respondeu à pergunta com um passo, mesmo que nunca
   * tenha carregado no botão. Voltar a perguntar-lhe «o que queres?» é fazê-lo descer um degrau
   * que já subiu — e é assim que se perde alguém que estava quase lá.
   */
  if ((!d.interesse || d.interesse === 'indeciso') && !d.uidCorretora) {
    return 'Ainda não escolheu caminho. Pergunta-lhe se quer o ecossistema todo ou só a app a operar por ele.'
  }

  if (!d.uidCorretora) {
    return 'Falta a conta na corretora. Manda-lhe o link de abertura e pede o UID quando estiver feita.'
  }

  if (!d.uidConfirmado) {
    return `Deu o UID ${d.uidCorretora} mas ainda não bate certo com a lista da corretora. Confirma no importador antes de prometer acesso.`
  }

  if ((d.depositoUsd ?? 0) <= 0) {
    return 'Conta aberta e confirmada, sem depósito. É aqui que o funil encalha — vale um telefonema, não uma mensagem.'
  }

  if (!d.temConta) {
    return 'Depositou e ainda não tem conta no site. Manda o registo — é o passo mais fácil que lhe resta.'
  }

  if (!d.contaACopiar) {
    return 'Tem tudo menos a conta ligada a copiar. Liga-a tu e mostra-lhe a primeira ordem a abrir.'
  }

  if (d.interesse === 'mtmauto' && !PAGA_O_MTM_AUTO.has(d.passoMtmAuto ?? '')) {
    return 'Falta validar o acesso ao MTM Auto — emite o cupão e fecha o passo.'
  }

  return 'Deu todos os passos e ainda não paga. Pergunta-lhe directamente qual é o plano — não há nada técnico a bloquear.'
}
