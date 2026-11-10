/**
 * O KIT DE CADA PAPEL — as ferramentas que o prospector, o setter, o closer e o afiliado usam.
 *
 * Pedido do Ricardo a 04/11/2026: «insere no backoffice, nos seus respectivos locais, as ajudas
 * dos setter, prospectar, afiliados e closer — ferramentas para eles usarem». Aparece em
 * Materiais, um kit por papel; cada pessoa vê o(s) seu(s), o dono e o team leader vêem todos.
 *
 * É o MTM Master Framework (`lib/framework-mtm.ts`) traduzido para quem fala com pessoas:
 * guiões para copiar, perguntas de triagem, objecções e o que nunca se diz.
 *
 * REGRAS (guardadas em `lib/backoffice-kit-papeis.check.ts`):
 *  · nenhum preço escrito à mão — a escada entra por `escadaNumaLinha()`/`bonusNumaLinha()`;
 *  · nenhum concorrente nem pessoa de outra empresa pelo nome;
 *  · nenhuma promessa de ganhos; quem não tem capital vai para o MTM Funded (conta simulada);
 *  · os guiões são pontos de partida — a pessoa adapta à conversa, não cola às cegas.
 */
import { escadaNumaLinha, bonusNumaLinha, ondeComprarTopoNumaLinha } from '@/lib/escada-precos'
import { LINK_MTM_FUNDED } from '@/lib/framework-mtm'
import type { Papel } from '@/lib/backoffice-papeis'

const SITE = 'https://www.morethanmoney.pt'

export interface Guiao {
  titulo: string
  /** Quando se usa. Sem isto o guião é um texto solto que ninguém sabe onde encaixar. */
  quando: string
  texto: string
}

export interface Objeccao {
  diz: string
  respondes: string
}

export interface KitPapel {
  papel: Papel
  nome: string
  missao: string
  /** O trabalho do papel, por ordem. */
  passos: string[]
  guioes: Guiao[]
  objeccoes: Objeccao[]
}

export interface ContextoKit {
  /** O link de registo com o código da pessoa (`?ref=`). */
  linkRegisto: string
  /** Link da agenda para a chamada de Onboarding. */
  linkAgendar?: string
}

/** O que nenhum papel diz, nunca. Igual para todos — é a casa a falar. */
export const NUNCA_SE_DIZ: string[] = [
  'Prometer ganhos, rendimento fixo, «dinheiro automático» ou lucros certos.',
  'Inventar números. Preço: lê-se no sistema. Prova: só a medida em pips, com origem.',
  'Nomear concorrentes, redes de marketing multinível ou pessoas de outras empresas. Critica-se o modelo, não quem lá está.',
  'Chamar «prop firm» ao MTM Funded ou dizer que se recebe capital para operar: é conta simulada.',
  'Mandar link de pagamento a quem está no iPhone — no iOS a subscrição faz-se dentro da app.',
  'Dizer que se ganha por recrutar. Aqui ganha-se quando um cliente real fica, porque lhe serve.',
]

const ESCADA = () => escadaNumaLinha()

function kitProspector(c: ContextoKit): KitPapel {
  return {
    papel: 'prospector',
    nome: 'Prospector',
    missao:
      'Abrir conversas com pessoas certas e passá-las ao setter qualificadas. Não vendes: descobres quem tem a dor e quer falar.',
    passos: [
      'Onde procurar: quem comenta nos nossos posts e Reels, grupos de trading e finanças pessoais, quem fala de mensalidades que paga sem retorno.',
      'Primeiro contacto curto, pessoal, com UMA pergunta. Sem links, sem escada.',
      'Se responde com interesse, regista o lead no pipeline com a dor que disse.',
      'Passa ao setter (ou marca tu a chamada, se também és setter).',
    ],
    guioes: [
      {
        titulo: 'Resposta a um comentário',
        quando: 'Alguém comentou um post nosso (palavra-chave ou dúvida).',
        texto:
          'Olá {nome}! Vi o teu comentário 🙌 Mandei-te por privado o material — diz-me se chegou. Já fazes trading ou estás a começar?',
      },
      {
        titulo: 'Primeiro contacto (a frio)',
        quando: 'Pessoa que fala de finanças/trading num grupo e nunca falou connosco.',
        texto:
          'Olá {nome}, vi o que escreveste sobre {tema}. Também passei por isso. Posso perguntar-te uma coisa: hoje operas por conta própria ou segues alguém?',
      },
      {
        titulo: 'Quem vem de um modelo de rede',
        quando: 'A pessoa paga uma mensalidade a uma rede e sente que o retorno é recrutar.',
        texto:
          'Faz sentido o que dizes. Uma pergunta honesta: o que pagas por mês, quanto disso volta para ti em formação e ferramentas que usas, e quanto depende de trazeres pessoas? Aqui o foco é outro — aprenderes a operar a tua própria conta, com método.',
      },
      {
        titulo: 'Passar ao setter',
        quando: 'O lead respondeu com uma dor clara.',
        texto:
          'Obrigado por partilhares, {nome}. Vou pedir ao {setter}, que acompanha quem está a começar, para te mandar mensagem — ele percebe o teu caso e diz-te o caminho que faz sentido. Pode ser?',
      },
    ],
    objeccoes: [
      {
        diz: '«Isso é mais um esquema?»',
        respondes:
          'Pergunta justa. Aqui não se ganha a recrutar: é educação, ferramentas próprias e comunidade. Se quiseres, vês primeiro a app e as sessões — e decides com dados.',
      },
    ],
  }
}

function kitSetter(c: ContextoKit): KitPapel {
  const agenda = c.linkAgendar ?? `${SITE}/agendar?t=onboarding`
  return {
    papel: 'setter',
    nome: 'Setter',
    missao:
      'Triagem rápida e chamada de Onboarding marcada. Não fechas venda: qualificas e agendas.',
    passos: [
      'Uma pergunta de cada vez.',
      'Descobre a dor do CUSTO FIXO: quanto paga hoje por mês (subscrições, cursos, mensalidades de rede) e o que recebeu em troca.',
      'Descobre onde está: nunca operou / opera sozinho / vem de uma rede e quer operar por conta própria.',
      'Disponibilidade: quanto tempo por semana tem para isto.',
      'Marca a chamada de Onboarding com duas horas concretas e move o negócio para «marcado».',
      'Sem capital próprio? Não é para chamada de venda: manda para o MTM Funded.',
    ],
    guioes: [
      {
        titulo: 'Abertura',
        quando: 'Primeira mensagem a um lead que veio do prospector ou de um comentário.',
        texto:
          'Olá {nome}, sou o {teu_nome}, da MoreThanMoney. O {quem} disse-me que estás a olhar para o trading com outros olhos. Antes de te mandar o que quer que seja: em que ponto estás hoje?',
      },
      {
        titulo: 'A pergunta do custo fixo',
        quando: 'Depois de saberes onde está.',
        texto:
          'Pergunta rápida: quanto pagas hoje por mês entre subscrições, cursos ou mensalidades ligadas a isto? E disso, o que é que te ficou de concreto — método, ferramentas, resultados que consegues repetir?',
      },
      {
        titulo: 'Propor a chamada de Onboarding',
        quando: 'Já sabes a dor e o tempo que tem.',
        texto:
          `Pelo que me dizes, faz sentido mostrarmos-te o sistema numa chamada curta: vês o WebTrader, como filtramos as entradas e como se gere o risco, e no fim dizemos-te o caminho que te serve (ou que não te serve). Marcas aqui: ${agenda} — ou diz-me se te dá mais jeito {hora1} ou {hora2}.`,
      },
      {
        titulo: 'Lembrete (véspera)',
        quando: 'Na véspera da chamada.',
        texto:
          'Olá {nome}! Só para confirmar a nossa chamada amanhã às {hora}. Se puderes, entra uns minutos antes com o telemóvel ou o computador à mão. Até amanhã 👊',
      },
      {
        titulo: 'Faltou à chamada',
        quando: 'No-show.',
        texto:
          'Olá {nome}, ficámos à tua espera hoje — acontece. Queres remarcar? Tenho {hora1} ou {hora2}.',
      },
      {
        titulo: 'Sem capital para começar',
        quando: 'Diz que não tem dinheiro para pôr numa conta.',
        texto:
          `Percebo, e é por isso que existe o MTM Funded: treinas e provas o teu método em conta simulada, sem arriscar dinheiro teu. Inscreves-te aqui: ${LINK_MTM_FUNDED}`,
      },
    ],
    objeccoes: [
      { diz: '«Não tenho tempo.»', respondes: 'Quanto tempo tens por semana, de verdade? O método foi pensado para pouco tempo por dia, com alertas e sessões gravadas. Na chamada mostramos como fica na tua rotina.' },
      { diz: '«Manda-me só a informação.»', respondes: 'Mando — mas sem saber o teu caso mandava-te tudo e nada te servia. É uma conversa curta para te dizer qual é o caminho certo para ti. Qual destas horas te dá jeito?' },
      { diz: '«Não tenho dinheiro.»', respondes: `Então começa sem arriscar: MTM Funded, conta simulada — ${LINK_MTM_FUNDED}` },
    ],
  }
}

function kitCloser(c: ContextoKit): KitPapel {
  return {
    papel: 'closer',
    nome: 'Closer',
    missao:
      'Apresentação técnica e fecho assistido. Os dois destinos principais são o Premium e a Rota Corretora (conta própria PU Prime financiada).',
    passos: [
      'Agenda da chamada: o que vais mostrar e que no fim ele decide.',
      'Diagnóstico: confirma o que o setter apurou — dor, custo fixo, tempo, experiência.',
      'Demonstração: WebTrader / MTM System — análise, filtros, gestão de risco, o que o cliente controla. Não é copiador cego.',
      `Escada (por esta ordem, degraus pagos primeiro): ${ESCADA()}`,
      `Bónus, numa linha à parte: ${bonusNumaLinha()}`,
      'Fecho: pergunta qual dos caminhos faz sentido para ele — e cala-te. Sem capital próprio → MTM Funded.',
      'Depois da chamada: follow-up no mesmo dia e o negócio movido no pipeline.',
    ],
    guioes: [
      {
        titulo: 'Abrir a chamada',
        quando: 'Primeiro minuto.',
        texto:
          'Obrigado por apareceres, {nome}. A ideia é esta: percebo onde estás, mostro-te o sistema a funcionar e no fim dizes-me se faz sentido. Se não fizer, digo-to eu. Combinado?',
      },
      {
        titulo: 'Passar à proposta',
        quando: 'Depois da demonstração.',
        texto:
          'Pelo que me disseste — {dor} e {tempo} por semana — há dois caminhos que fazem sentido: o Premium, se queres tudo já com mensalidade, ou a rota da corretora, se preferes pôr esse dinheiro numa conta tua e ter o Premium enquanto ela estiver financiada. Qual te parece mais certo?',
      },
      {
        titulo: 'Onde se compra o degrau de topo',
        quando: 'Quer o plano anual.',
        texto: ondeComprarTopoNumaLinha(),
      },
      {
        titulo: 'Follow-up (mesmo dia)',
        quando: 'Não fechou na chamada.',
        texto:
          'Olá {nome}, obrigado pela conversa de hoje. Como combinámos, aqui fica o resumo: {caminho}. Fica a pergunta: o que precisas de ver para decidir?',
      },
      {
        titulo: 'Fechou — próximo passo',
        quando: 'Disse que sim.',
        texto:
          'Bem-vindo, {nome} 👊 Próximo passo: no iPhone descarregas a app e subscreves lá dentro; em Android ou web é em ' +
          `${SITE}/upgrade. Se for a rota da corretora, abres conta em ${SITE}/abrir-conta e mandas-me o UID para validarmos.`,
      },
    ],
    objeccoes: [
      { diz: '«É caro.»', respondes: 'Comparado com quê? Põe ao lado do que pagas hoje por mês e do que isso te dá. Se a mensalidade pesa, a rota da corretora põe esse dinheiro numa conta tua.' },
      { diz: '«Já perdi dinheiro.»', respondes: 'Quase sempre foi falta de método e de gestão de risco. É por aí que se começa aqui: proteger capital primeiro.' },
      { diz: '«Funciona mesmo?»', respondes: 'Não prometemos lucro — mostramos processo real e a prova medida em pips, com a ressalva. Decides com isso.' },
      { diz: '«Vou pensar.»', respondes: 'Claro. O que é que precisas de ver para decidir? (Urgência só se for verdadeira: campanha em vigor. Nunca prazos inventados.)' },
      { diz: '«Não tenho capital.»', respondes: `MTM Funded, conta simulada: ${LINK_MTM_FUNDED}` },
    ],
  }
}

function kitAfiliado(c: ContextoKit): KitPapel {
  return {
    papel: 'afiliado',
    nome: 'Afiliado',
    missao:
      'Recomendar a casa a quem lhe serve, com o teu link. Ganhas quando um cliente real subscreve e fica — nunca por recrutar.',
    passos: [
      `O teu link de registo: ${c.linkRegisto}`,
      'Partilha a tua experiência real (o que aprendeste, como usas a app), não resultados nem promessas.',
      'Quem mostrar interesse a sério: passa-o a um setter ou manda o link da agenda.',
      'Usa o gerador abaixo para escrever publicações e legendas com o tom da casa.',
    ],
    guioes: [
      {
        titulo: 'Para um amigo',
        quando: 'Mensagem pessoal a alguém que já te perguntou.',
        texto:
          `Olá {nome}! Perguntaste-me como estou a aprender trading. Estou na MoreThanMoney: formação, scanners e uma comunidade que trabalha com gestão de risco. Se quiseres ver, regista-te por aqui e experimentas: ${c.linkRegisto} — e se tiveres dúvidas, pergunta-me.`,
      },
      {
        titulo: 'Story / publicação',
        quando: 'Nas tuas redes.',
        texto:
          `O que mais mudou desde que entrei na MoreThanMoney não foi o saldo — foi saber proteger capital e ter um método. Se te interessa aprender a sério, o link está aqui: ${c.linkRegisto} (Conteúdo educativo, não é aconselhamento financeiro.)`,
      },
      {
        titulo: 'Gancho do custo de oportunidade',
        quando: 'Para quem paga mensalidades a uma rede.',
        texto:
          'Quanto pagas por mês a uma rede que te pede para recrutar? Esse dinheiro, numa conta tua, é capital teu — e as ferramentas vêm com ele.',
      },
    ],
    objeccoes: [
      { diz: '«Quanto é que ganhas com isto?»', respondes: 'Recebo uma parte se subscreveres pelo meu link — é transparente. Mas só faz sentido se te servir.' },
    ],
  }
}

const FABRICAS: Record<Papel, ((c: ContextoKit) => KitPapel) | null> = {
  prospector: kitProspector,
  setter: kitSetter,
  closer: kitCloser,
  afiliado: kitAfiliado,
  team_leader: null,
}

/** Ordem do funil: quem abre conversas, quem agenda, quem fecha, quem recomenda. */
export const ORDEM_KITS: Papel[] = ['prospector', 'setter', 'closer', 'afiliado']

/**
 * Os kits que esta pessoa vê. O dono e o team leader vêem todos (acompanham a equipa); os outros
 * vêem os dos seus papéis. Sem papel nenhum → nenhum kit.
 */
export function kitsPara(papeis: Papel[], admin: boolean, c: ContextoKit): KitPapel[] {
  const todos = admin || papeis.includes('team_leader')
  return ORDEM_KITS.filter((p) => todos || papeis.includes(p))
    .map((p) => FABRICAS[p]?.(c))
    .filter((k): k is KitPapel => Boolean(k))
}
