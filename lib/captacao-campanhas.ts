import {
  PONTOS_DE_CAPTURA,
  type BaseLegal,
  type FinalidadeEmail,
} from '@/lib/captacao-consentimento'

/**
 * AS CAMPANHAS DE CAPTAÇÃO — preparadas, escritas, segmentadas. Nunca enviadas.
 *
 * O QUE ISTO É
 * O pedido foi «prepara auto-tarefas de campanhas de email para engordar a lista de leads». Isto é
 * a metade que se pode automatizar sem risco: decidir quem entra em que lista, escrever o texto na
 * voz da casa, e deixar o rascunho em cima da mesa com a contagem de destinatários à frente. A
 * outra metade — clicar em enviar — é de uma pessoa, e vai continuar a ser.
 *
 * A FRONTEIRA, PELA MESMA RAZÃO QUE ESTÁ NO MOTOR DO DIA
 * Um sistema que manda emails em massa sozinho acaba sempre da mesma maneira: alguém recebe a
 * mensagem errada, chegam as queixas de spam, e o domínio fica queimado durante meses. Queimado
 * para todos — incluindo para os avisos de renovação dos clientes que PAGAM, que passam a cair na
 * caixa de lixo. O custo de um envio automático mal feito não é o envio: é perder o canal.
 *
 * O QUE ESTE FICHEIRO NÃO FAZ
 * Não abre conexões, não lê a base, não manda nada. Recebe contagens e devolve rascunhos. É por
 * isso que se prende com guardas (`captacao-campanhas.check.ts`): o texto que sai daqui vai ser
 * lido por pessoas reais, e um erro de tom ou uma promessa de lucro não se apanha em produção.
 *
 * A REGRA QUE DECIDE TUDO AQUI
 * Nenhum segmento de envio em massa existe sem base legal `consentimento`. Não há atalho, não há
 * «mas são clientes antigos», não há `type: 'transactional'`. Um segmento mal declarado é apanhado
 * pela guarda antes de chegar a existir.
 */

/**
 * Como é que se fala com este segmento.
 *
 * · 'email_massa' — um email igual para muita gente. Só com consentimento.
 * · 'um_a_um'     — uma pessoa escreve a uma pessoa, a partir de uma tarefa com rascunho. É o único
 *                   caminho legítimo para quem nunca pediu nada: não é uma campanha, é uma conversa,
 *                   e quem a começa assume-a.
 */
export type Via = 'email_massa' | 'um_a_um'

/** Onde se vai buscar a gente deste segmento. Resolvido no cron; declarado aqui para ser legível. */
export type FonteSegmento =
  | 'consentidos'
  | 'perfis_inactivos'
  | 'pipeline_corretora'
  | 'pipeline_telegram_sem_contacto'
  | 'pipeline_instagram'

export interface Segmento {
  chave: string
  nome: string
  /** Em português e sem rodeios: quem são estas pessoas e porque estão juntas. */
  quem: string
  fonte: FonteSegmento
  via: Via
  baseLegal: BaseLegal
  finalidade: FinalidadeEmail
  /**
   * Porque é que este segmento pode estar bloqueado.
   *
   * Um segmento bloqueado continua a existir e a ser contado de propósito. Fazê-lo desaparecer da
   * lista escondia o problema: o Ricardo veria uma máquina de campanhas com três segmentos e não
   * saberia que há noventa pessoas à espera de uma decisão que só ele pode tomar.
   */
  bloqueio: string | null
}

/**
 * OS SEGMENTOS, medidos na base a 26/09.
 *
 * As contagens estão nos comentários porque foram medidas, não estimadas — e porque envelhecem: a
 * vista `captacao_por_fonte` (migração 142) responde à mesma pergunta a qualquer momento.
 */
export const SEGMENTOS: readonly Segmento[] = [
  {
    chave: 'nutrir-consentidos',
    nome: 'Quem pediu para receber',
    quem:
      'Pessoas que se inscreveram por vontade própria (ímane de leads, formulário, bot) e deixaram ' +
      'registo disso no livro do consentimento. Hoje: ZERO. É a lista que ainda não existe e que ' +
      'todo o resto deste trabalho serve para construir.',
    fonte: 'consentidos',
    via: 'email_massa',
    baseLegal: 'consentimento',
    finalidade: 'campanha',
    bloqueio: null,
  },
  {
    chave: 'base-adormecida',
    nome: 'Registaram-se e nunca activaram',
    quem:
      '90 perfis que criaram conta no site e ficaram por ali. Têm email. NÃO têm registo de terem ' +
      'pedido campanhas — porque esse registo não existe para ninguém nesta base.',
    fonte: 'perfis_inactivos',
    via: 'email_massa',
    baseLegal: 'sem_base',
    finalidade: 'campanha',
    /**
     * A decisão que não é minha nem do código.
     *
     * Estas 90 pessoas deram o email para criar uma conta. Isso não é o mesmo que ter pedido
     * campanhas, e não há registo do que o formulário de registo dizia na altura. Mandar-lhes uma
     * campanha às escuras é a jogada que engorda a métrica hoje e queima o domínio no mês seguinte.
     *
     * O caminho limpo, e é barato: pedir a permissão DENTRO da app, a quem faz login. Quem entra já
     * escolheu estar cá; uma pergunta no sítio onde a pessoa já está converte melhor do que um
     * email a frio e deixa prova.
     */
    bloqueio:
      'Sem consentimento registado. Antes de qualquer envio: capturar a permissão no login da app/site. ' +
      'Um email a pedir permissão a 90 pessoas que não a deram é, ele próprio, um email de marketing — ' +
      'se for esse o caminho, é uma decisão do Ricardo, tomada com o texto do registo à frente.',
  },
  {
    chave: 'rede-ib',
    nome: 'Rede de IBs — trazer para a PU Prime',
    quem:
      '27 pessoas com email ou telefone, marcadas `a_transitar` nas exportações de IB (de 91 no total ' +
      '— as outras 64 não têm forma nenhuma de contacto). Já negoceiam, já depositaram: não é preciso ' +
      'explicar-lhes o produto, é preciso mudar uma conta de sítio.',
    fonte: 'pipeline_corretora',
    via: 'um_a_um',
    baseLegal: 'sem_base',
    finalidade: 'campanha',
    /**
     * Estes vieram de exportações de corretora. Nunca pediram nada a ninguém, e um email em massa a
     * uma lista de clientes de outra casa é exactamente o género de coisa que dá queixa. Um a um,
     * por quem tem uma razão concreta para falar com aquela pessoa, é conversa e é legítimo.
     */
    bloqueio: 'Nunca em massa: veio de exportação. Um a um, pela equipa, a partir da tarefa.',
  },
  {
    chave: 'telegram-pedir-contacto',
    nome: 'Telegram — pedir o contacto a quem só é um chat_id',
    quem:
      '4 dos 6 leads do bot não têm nome, email nem telefone: existem como um número de conversa. ' +
      'Enquanto isso não mudar, não se lhes chega fora do Telegram.',
    fonte: 'pipeline_telegram_sem_contacto',
    via: 'um_a_um',
    baseLegal: 'sem_base',
    finalidade: 'campanha',
    bloqueio: 'Só no Telegram, a pedir o email com o texto de consentimento à frente.',
  },
  {
    chave: 'instagram-comentou',
    nome: 'Instagram — comentaram com intenção',
    quem:
      'Quem comentou uma palavra-chave. À data da medição: 6 comentários, UMA pessoa — contar ' +
      'comentários em vez de pessoas fazia esta fonte parecer seis vezes maior do que é. Há handle e ' +
      'mais nada: zero emails, zero telefones. É por aqui que entra gente nova, e é aqui que o email se pede.',
    fonte: 'pipeline_instagram',
    via: 'um_a_um',
    baseLegal: 'sem_base',
    finalidade: 'campanha',
    bloqueio: 'Por mensagem, uma a uma. Um comentário não é uma subscrição.',
  },
] as const

// ── O texto ──────────────────────────────────────────────────────────────────

export interface Rascunho {
  /** Ordem dentro da sequência. 1 é o primeiro a sair. */
  ordem: number
  assunto: string
  corpo: string
  /** Quantos dias depois do anterior. O primeiro é 0. */
  diasDepois: number
}

/**
 * O rodapé, em todos os emails sem excepção.
 *
 * Não é formalidade: um email de marketing sem saída visível é uma infracção, e — pior para o
 * negócio — é o que faz alguém carregar em «isto é spam» em vez de carregar em «cancelar». As duas
 * coisas parecem iguais para a pessoa e são muito diferentes para o domínio.
 */
export const RODAPE =
  'Recebes este email porque pediste para receber as novidades da MoreThanMoney.\n' +
  'Não queres receber mais? Cancela aqui e não voltas a ouvir falar disto: {{link_cancelar}}'

/**
 * A voz.
 *
 * Directo e respeitoso, premium sem ser vistoso, prova em pips e nunca em euros (regra de 26/08 —
 * o «+7.060€» saiu de toda a comunicação), zero urgência inventada, zero promessa de lucro. O que
 * não se pode dizer está preso por guardas, e não por boa memória minha.
 */
function assinatura(): string {
  return 'Ricardo Garcia\nMoreThanMoney'
}

function comRodape(corpo: string): string {
  return `${corpo}\n\n${assinatura()}\n\n—\n${RODAPE}`
}

/**
 * A SEQUÊNCIA PARA QUEM PEDIU.
 *
 * Três emails em nove dias, e o terceiro é o único que vende. A proporção é deliberada: quem acabou
 * de deixar o email deu um passo pequeno, e responder a esse passo pequeno com uma oferta é o que
 * faz a pessoa cancelar ao segundo dia. Primeiro entrega-se o que se prometeu, depois mostra-se
 * como funciona, e só depois se convida.
 *
 * E não se lidera com o grátis (regra do funil-escada): o convite é para Membro, que é onde a
 * escada começa a pagar.
 */
export function sequenciaConsentidos(): Rascunho[] {
  return [
    {
      ordem: 1,
      diasDepois: 0,
      assunto: 'Está aqui o que pediste',
      corpo: comRodape(
        'Obrigado por deixares o email — está tudo no link abaixo, sem voltas.\n\n' +
          '{{link_material}}\n\n' +
          'Uma nota antes de começares: isto não é um atalho. É a forma como olho para o mercado ' +
          'depois de anos a fazê-lo mal primeiro. Lê com tempo.\n\n' +
          'Nos próximos dias mando-te mais duas mensagens: uma sobre o que separa quem aguenta de ' +
          'quem desiste ao terceiro mês, e outra sobre como trabalhamos aqui. Depois disso, só ' +
          'quando houver algo que valha o teu tempo.',
      ),
    },
    {
      ordem: 2,
      diasDepois: 4,
      assunto: 'O erro que me custou mais do que qualquer trade',
      corpo: comRodape(
        'A maioria das pessoas que desiste dos mercados não desiste por ter perdido dinheiro.\n\n' +
          'Desiste porque nunca teve um sistema — teve palpites, uns dias bons, e a sensação de que ' +
          'estava sempre a começar de novo. Eu estive nesse sítio durante bastante tempo, e a parte ' +
          'que mais custa não é a perda: é não saber dizer porque é que entraste.\n\n' +
          'O que mudou para mim foi ter regras escritas antes de abrir o gráfico. Não é sedutor. É ' +
          'o que faz a diferença entre um mês bom e três anos.\n\n' +
          'Se quiseres ver como é que isso se parece na prática, as sessões da comunidade são ao ' +
          'vivo e podes assistir: {{link_sessoes}}',
      ),
    },
    {
      ordem: 3,
      diasDepois: 5,
      assunto: 'Como é que isto funciona aqui dentro',
      corpo: comRodape(
        'Explico em quatro linhas, sem discurso de vendas.\n\n' +
          'A MoreThanMoney é formação, sinais, cópia automática e ferramentas — e a ordem importa. ' +
          'Primeiro aprende-se a ler o que se está a fazer; a automatização vem depois, porque ' +
          'automatizar uma coisa que não se entende é só perder mais depressa.\n\n' +
          'Quem entra como Membro tem acesso às sessões ao vivo, à formação e à comunidade. É por ' +
          'aí que se começa: {{link_membro}}\n\n' +
          'Se não é o momento, não há problema nenhum — fica pelos emails e vai ao teu ritmo. E se ' +
          'tiveres uma pergunta concreta, responde a este email que sou eu a ler.',
      ),
    },
  ]
}

/**
 * O rascunho de um a um, para a tarefa da equipa.
 *
 * Curto de propósito: uma mensagem de primeiro contacto com seis linhas lê-se como um panfleto. E
 * nunca revela mais do que é preciso — dizer a alguém «vi que negoceias 40 lotes na Hantec» assusta
 * mais do que aproxima, mesmo sendo verdade e estando na nossa base.
 */
export function rascunhoUmAUm(segmento: Segmento, primeiroNome: string): string {
  const nome = primeiroNome.trim() || 'Olá'
  switch (segmento.chave) {
    case 'rede-ib':
      return (
        `${nome}, bom dia.\n\n` +
        'Falo da MoreThanMoney. Trabalhamos com traders que já operam por conta própria e estamos a ' +
        'passar contas para a PU Prime, com as nossas ferramentas e sessões incluídas.\n\n' +
        'Faz sentido explicar-te em dez minutos o que muda para ti? Se não for o caso, diz e não ' +
        'volto a incomodar.'
      )
    case 'telegram-pedir-contacto':
      return (
        `${nome}, tudo bem?\n\n` +
        'Para te conseguir mandar o material e avisar das próximas sessões, deixas-me o teu email?\n\n' +
        `«${PONTOS_DE_CAPTURA.find((p) => p.canal === 'bot_telegram')?.pedido ?? ''}»\n\n` +
        'Se preferires ficar só por aqui pelo Telegram, também está bem.'
      )
    case 'instagram-comentou':
      return (
        `${nome}, vi o teu comentário.\n\n` +
        'Mando-te o acesso por aqui. Se quiseres também receber por email — e o aviso das sessões ao ' +
        'vivo — diz-me o teu endereço e eu ponho-te na lista. Sais quando quiseres.'
      )
    default:
      return `(sem rascunho automático para «${segmento.chave}» — escreve tu, em duas ou três frases, para ${nome})`
  }
}

// ── O que o cron precisa de saber ────────────────────────────────────────────

export interface ContagemSegmento {
  chave: string
  pessoas: number
  /** Destas, quantas se consegue de facto contactar. É este o número que conta. */
  contactaveis: number
}

export interface CampanhaPreparada {
  segmento: Segmento
  pessoas: number
  contactaveis: number
  /** Só para os segmentos de email em massa. Um a um leva rascunhos por pessoa, na tarefa. */
  emails: Rascunho[]
  /** Sai da decisão, não da vontade: false se o segmento está bloqueado ou não há ninguém. */
  prontaParaRever: boolean
  porque: string
}

/**
 * Junta os segmentos às contagens e diz, de cada um, se há trabalho para rever.
 *
 * Nada aqui envia, agenda ou marca nada para sair. O resultado é uma lista para uma pessoa ler.
 */
export function prepararCampanhas(contagens: readonly ContagemSegmento[]): CampanhaPreparada[] {
  const porChave = new Map(contagens.map((c) => [c.chave, c]))

  return SEGMENTOS.map((segmento) => {
    const c = porChave.get(segmento.chave) ?? { chave: segmento.chave, pessoas: 0, contactaveis: 0 }
    const emails = segmento.via === 'email_massa' ? sequenciaConsentidos() : []

    let prontaParaRever = true
    let porque = `${c.contactaveis} pessoa(s) contactável(is) — rascunho pronto a rever`

    if (segmento.bloqueio) {
      prontaParaRever = false
      porque = segmento.bloqueio
    } else if (c.contactaveis === 0) {
      // Não é um erro: é o estado real de uma lista que ainda não foi construída. Dizê-lo é mais
      // útil do que esconder o segmento e dar a impressão de que não existe.
      prontaParaRever = false
      porque = 'ninguém contactável neste segmento ainda — a lista constrói-se pelos pontos de captura'
    }

    return { segmento, pessoas: c.pessoas, contactaveis: c.contactaveis, emails, prontaParaRever, porque }
  })
}

/**
 * O estado em que uma campanha preparada é gravada.
 *
 * É uma constante e não um literal espalhado pelo código porque o caminho de envio que já existe
 * (`app/api/email-marketing/campaigns`) decide o que fazer a partir deste campo. 'draft' é o único
 * valor que esse caminho NÃO envia — e é o único que sai daqui. Mudar isto é passar a mandar emails
 * sozinho, e é por isso que há uma guarda a prendê-lo.
 */
export const ESTADO_RASCUNHO = 'draft' as const

/**
 * O tipo com que se grava. NUNCA 'transactional'.
 *
 * O caminho de envio antigo salta a verificação de preferências quando o tipo é 'transactional'
 * (`campaign.type === 'transactional' || allowedUserIds.includes(r.id)`). Uma campanha de vendas
 * gravada com esse tipo passava por ali sem travão. Daqui sai sempre 'marketing'.
 */
export const TIPO_CAMPANHA = 'marketing' as const
