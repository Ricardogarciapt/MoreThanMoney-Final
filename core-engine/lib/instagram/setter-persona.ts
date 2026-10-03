/**
 * O SETTER DO INSTAGRAM — a persona que responde ao comentário e abre a conversa por privado.
 *
 * ═══ PORQUE É QUE ISTO EXISTE ═══════════════════════════════════════════════════════════════
 *
 * Medido a 2026-09-26, na base: `ig_leads` tem 6 comentários — de UMA pessoa. O funil por palavra
 * -chave (`funnel.ts`) está a funcionar e não é ele o problema: em 30 dias o `ig-engage` respondeu
 * a 19 comentários genuínos de 5 pessoas, e nenhuma delas entrou no funil, porque nenhuma escreveu
 * uma das palavras da campanha. O gargalo é a ENTRADA, não a conversão.
 *
 * Este ficheiro abre essa entrada pelo único caminho que a Meta permite: quem comenta é alguém que
 * interagiu, e a um comentário pode-se responder em público e, UMA vez, em privado. Não há aqui
 * nenhuma tentativa de ir buscar gente que não nos escreveu — ver «O QUE ISTO NÃO FAZ» no fim.
 *
 * ═══ AS DUAS FASES, QUE SÃO DUAS PORTAS DIFERENTES DA API ═══════════════════════════════════
 *
 * FASE 1 — resposta PÚBLICA ao comentário (`POST /{comment-id}/replies`). Curta, valida o que a
 *   pessoa disse, avisa que foi material por privado. Nunca vende nem qualifica em público.
 * FASE 2 — a DM (`POST /{comment-id}/private_replies`). Entrega o que foi prometido, e faz UMA
 *   pergunta. Uma só.
 *
 * As duas fases não competem por orçamento nenhum: são endpoints distintos. O que é escasso é a
 * FASE 2 — ver {@link LIMITES}.
 *
 * ═══ A CORRECÇÃO QUE A PERSONA ENTREGUE PRECISAVA ═══════════════════════════════════════════
 *
 * A persona que o dono entregou vinha escrita em português do BRASIL — «que massa», «no celular»,
 * «dá uma olhada lá». Os leads são portugueses e a marca fala português de Portugal: a primeira
 * linha de uma DM em brasileiro diz à pessoa que quem escreve não é de cá, e a conversa morre ali
 * sem dar erro nenhum. Foi reescrita na voz da casa (a mesma de `lib/funis-ia.ts`), e os termos que
 * não se dizem cá ficaram numa lista que a guarda corre contra cada texto —
 * {@link termosBrasileiros}. Assim a próxima edição não os pode trazer de volta sem alguém saber.
 *
 * Vinha também com quatro campos por preencher. Nenhum foi inventado; cada um veio de onde o
 * sistema já o sabia, e está anotado em {@link FONTES_DOS_CAMPOS}.
 *
 * ═══ PURO DE PROPÓSITO ══════════════════════════════════════════════════════════════════════
 *
 * Nada aqui toca na rede nem na base de dados. Recebe factos, devolve decisões e textos — que é o
 * que permite às guardas (`setter-persona.check.ts`) correrem a escolha inteira sem mandar uma
 * única mensagem a ninguém. A parte que escreve está no `funnel.ts`, e nasce desligada.
 */

import {
  escadaNumaLinha,
  ondeComprarTopoNumaLinha,
  PRECO_MEMBRO,
  PRECO_PREMIUM,
  NOME_DEGRAU_TOPO,
  MIN_DEPOSIT,
} from '@/lib/escada-precos'

// ═════════════════════════ 1. OS LIMITES DA META, EM CÓDIGO ═════════════════════════

/**
 * As regras REAIS da plataforma, verificadas na documentação da Meta a 2026-09-26.
 *
 * Estão aqui em constantes e não num comentário porque um fluxo que assume que se pode escrever a
 * qualquer pessoa a qualquer hora não dá erro: dá uma conta limitada. E a conta da marca é um
 * activo que não se recupera — não há recurso que devolva @morethanmoney.pt se a Meta a fechar.
 *
 * Fontes (developers.facebook.com):
 *  · Messaging API, Instagram: «Only after an Instagram user has sent your app user's Instagram
 *    professional account a message can your app send a message to the Instagram user» — não há
 *    forma legítima de iniciar uma DM a quem nunca nos escreveu. Um comentário NÃO é uma mensagem;
 *    o que ele abre é a porta estreita do `private_replies`, e só essa.
 *  · Private replies: dentro de 7 DIAS do comentário, e **UMA SÓ** mensagem por comentário. Depois
 *    dessa, só se fala com a pessoa outra vez se ELA responder.
 *  · Janela de mensagens: 24 HORAS a contar da última mensagem DELA. A etiqueta `HUMAN_AGENT`
 *    estica para 7 dias, mas é para um humano responder a um pedido da própria pessoa — ver
 *    {@link HUMAN_AGENT_NAO_E_PARA_AUTOMACAO}.
 *  · Ritmo: 750 chamadas/hora de private replies por conta profissional.
 */
export const LIMITES = {
  /** Dias após o comentário em que ainda se pode mandar a private reply. */
  PRIVATE_REPLY_DIAS: 7,
  /** Private replies por comentário. Uma. Não é um limite de ritmo, é um limite absoluto. */
  PRIVATE_REPLIES_POR_COMENTARIO: 1,
  /** Horas de janela aberta a contar da última mensagem DA PESSOA. */
  JANELA_RESPOSTA_HORAS: 24,
  /** Tecto da Meta: private replies por hora, por conta. */
  PRIVATE_REPLIES_POR_HORA: 750,
  /**
   * O nosso tecto por conta e por corrida, MUITO abaixo do da Meta e de propósito.
   *
   * O limite da Meta é o ponto onde ela bloqueia; não é o ponto onde uma conta começa a parecer
   * um robô a quem a lê. Com 5 pessoas a comentar por mês, um tecto de 750 não protege nada —
   * protege quem o excede é o volume de conteúdo, não este número. Fica em 25 porque é uma
   * ordem de grandeza acima do que temos e duas abaixo do que a Meta tolera.
   */
  NOSSO_TECTO_POR_CORRIDA: 25,
} as const

/**
 * Porque é que a etiqueta que esticava a janela para 7 dias não é usada aqui.
 *
 * A `HUMAN_AGENT` existe para o caso em que um HUMANO precisa de mais tempo para responder a uma
 * pergunta que a pessoa fez. Usá-la para uma automação enviar fora da janela é exactamente o que
 * a Meta descreve como abuso da etiqueta, e é o tipo de coisa que se paga com a conta.
 *
 * Por isso: passadas as {@link LIMITES.JANELA_RESPOSTA_HORAS}, este módulo não manda nada. Deixa a
 * conversa em rascunho para o Ricardo — e aí sim, é um humano a responder a um pedido da pessoa,
 * que é literalmente o caso para que a etiqueta foi feita.
 */
export const HUMAN_AGENT_NAO_E_PARA_AUTOMACAO = true

export interface FactosDoComentario {
  /** Idade do comentário em horas. Sem data conhecida, `null` — e aí trata-se como fora de prazo. */
  horasDesdeComentario: number | null
  /** Já saiu uma private reply para ESTE comentário? Se sim, acabou: a Meta só dá uma. */
  jaRespondidoEmPrivado: boolean
  /** A conta pode escrever automaticamente? A pessoal do Ricardo não — ver isAutoPublishBlocked. */
  contaPodeEscreverSozinha: boolean
}

export type MotivoSemDm =
  | 'fora_dos_7_dias'
  | 'data_desconhecida'
  | 'ja_gastou_a_unica'
  | 'conta_nao_escreve_sozinha'

/**
 * Pode sair a DM deste comentário? E, se não, porquê.
 *
 * O «porquê» não é enfeite: a FASE 1 só promete «mandei-te por privado» quando a FASE 2 vai mesmo
 * acontecer. Prometer em público uma DM que a janela bloqueia é fazer a marca parecer avariada à
 * frente de todos os outros leitores do post — e é o erro mais fácil de cometer aqui, porque o
 * texto da resposta pública é escrito antes de se saber se a DM passa.
 */
export function podeMandarDm(f: FactosDoComentario): { pode: boolean; motivo: MotivoSemDm | null } {
  if (f.jaRespondidoEmPrivado) return { pode: false, motivo: 'ja_gastou_a_unica' }
  if (!f.contaPodeEscreverSozinha) return { pode: false, motivo: 'conta_nao_escreve_sozinha' }
  if (f.horasDesdeComentario === null) return { pode: false, motivo: 'data_desconhecida' }
  if (f.horasDesdeComentario > LIMITES.PRIVATE_REPLY_DIAS * 24) return { pode: false, motivo: 'fora_dos_7_dias' }
  return { pode: true, motivo: null }
}

/**
 * A janela de 24h está aberta para continuar a conversa?
 *
 * Só serve para o SEGUIMENTO — a 2ª, 3ª pergunta. E mede-se desde a última mensagem DELA, nunca
 * desde a nossa: responder à nossa própria mensagem não abre janela nenhuma, e foi assim que se
 * chegou a este comentário em vez de a um `if` distraído.
 */
export function janelaAberta(horasDesdeMensagemDela: number | null): boolean {
  return horasDesdeMensagemDela !== null && horasDesdeMensagemDela <= LIMITES.JANELA_RESPOSTA_HORAS
}

// ═════════════════════════ 2. PORTUGUÊS DE PORTUGAL, VERIFICADO ═════════════════════════

/**
 * Os termos brasileiros que a persona entregue trazia, e o que se diz cá.
 *
 * Não é uma lista de correcção de estilo: é uma lista de coisas que, ditas a um lead português,
 * lhe dizem imediatamente que do outro lado não está a MTM. As quatro primeiras vinham literalmente
 * no texto que o dono entregou; as outras estão aqui porque são as que aparecem sempre que um
 * modelo escreve «português» sem especificar qual.
 */
export const TERMOS_BRASILEIROS: { errado: string; certo: string }[] = [
  { errado: 'que massa', certo: 'que bom / boa' },
  { errado: 'celular', certo: 'telemóvel' },
  { errado: 'dá uma olhada', certo: 'dá uma vista de olhos / vê' },
  { errado: 'tráfego pago', certo: '(não se fala de anúncios com um lead)' },
  { errado: 'você', certo: 'tu' },
  { errado: 'a gente vai', certo: 'nós vamos / vamos' },
  { errado: 'time', certo: 'equipa' },
  { errado: 'galera', certo: 'pessoal' },
  { errado: 'grana', certo: 'dinheiro' },
  { errado: 'bacana', certo: 'bom / boa' },
  { errado: 'legal', certo: 'bom / boa' },
  { errado: 'pra', certo: 'para' },
  { errado: 'tá bom', certo: 'está bem' },
  { errado: 'valeu', certo: 'obrigado' },
  { errado: 'aí você', certo: 'aí tu' },
  { errado: 'planilha', certo: 'folha de cálculo' },
  { errado: 'aplicativo', certo: 'aplicação / app' },
  { errado: 'cartão de crédito seu', certo: 'o teu cartão' },
]

/**
 * Devolve os termos brasileiros encontrados num texto.
 *
 * Existe para a guarda poder correr TODOS os textos da persona e falhar se algum deles voltar a
 * cair em brasileiro. Uma regra de voz que só vive num comentário é uma regra que a próxima edição
 * apaga sem dar por isso.
 */
export function termosBrasileiros(texto: string): string[] {
  const t = ` ${texto.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ')} `
  return TERMOS_BRASILEIROS.map((x) => x.errado).filter((e) => t.includes(` ${e} `))
}

// ═════════════════════════ 3. OS CAMPOS QUE ESTAVAM POR PREENCHER ═════════════════════════

/**
 * De onde veio cada campo da persona. Nenhum foi inventado.
 *
 * Fica escrito porque a alternativa era o dono ter de confiar na minha palavra de que os números
 * não saíram da minha cabeça — e porque no dia em que um deles mudar, isto diz onde ir mudá-lo.
 */
export const FONTES_DOS_CAMPOS = {
  produto:
    'lib/escada-precos.ts — escadaNumaLinha(). Os preços NÃO se repetem aqui: leem-se de lá, ' +
    'que é a única fonte deles desde o incidente dos 300$/350$.',
  clienteIdeal:
    'lib/instagram/dm-closer.ts (DM_SYSTEM: «aprender / sinais para copiar / automático») + ' +
    'lib/captacao-hot-calls.ts («o sinal mais forte que existe: já opera» noutra corretora).',
  propostaValor:
    'lib/instagram/dm-closer.ts («scanners, sinais, cópia automática (MTM Copy), academia/lives, ' +
    'app») + a regra de prova em PIPS e percentagem, nunca em euros.',
  linkOuCta:
    'lib/instagram/funnel.ts (REGISTER, TELEGRAM, CRIADORES, FUNDED) + ' +
    'lib/escada-precos.ts — ondeComprarTopoNumaLinha() para o degrau de cima.',
} as const

/** Os links, um por um, e nenhum novo: são os que o funil já usa. */
export const LINKS = {
  registo: 'https://www.morethanmoney.pt/register',
  telegram: 'https://t.me/MoreThanMoney_aibot?start=lead',
  criadores: 'https://www.morethanmoney.pt/criadores',
  funded: 'https://www.morethanmoney.pt/mtmfunded',
} as const

/** O cliente ideal, para o prompt do closer e para quem lê a persona. */
export function clienteIdeal(): string {
  return (
    'Português, fala-se-lhe por «tu». Quer uma de três coisas: APRENDER a operar, ter SINAIS para ' +
    'copiar à mão, ou algo AUTOMÁTICO que opere por ele. O mais qualificado de todos é quem JÁ ' +
    'opera noutra corretora — esse não precisa de ser convencido de que o mercado existe, só de ' +
    'perceber o que ganha em mudar de casa.'
  )
}

/** A proposta de valor, sem uma única promessa de lucro. */
export function propostaValor(): string {
  return (
    'Comunidade portuguesa de trading, com pessoas por trás: scanners e sinais acompanhados do ' +
    'início ao fim, cópia automática (MTM Copy), Tap to Trade na app, academia e sessões ao vivo. ' +
    'Os resultados falam-se em PIPS e em percentagem — o valor em dinheiro depende do lote de ' +
    'cada um, e não se promete nenhum.'
  )
}

// ═════════════════════════ 4. A PERSONA, EM PORTUGUÊS DE PORTUGAL ═════════════════════════

/**
 * As regras de estilo. São as mesmas em público e em privado — o que muda é o que se pode dizer,
 * não como se diz.
 */
const ESTILO = [
  'Português de PORTUGAL, sempre. Tratamento por «tu».',
  'Parágrafos curtos: no máximo 2 frases cada um.',
  'No máximo 1 ou 2 emojis em toda a mensagem. Zero também está bem.',
  'Directo ao ponto. Sem «espero que estejas bem», sem introduções, sem guião de vendedor.',
  'Soa a pessoa. Se a frase não se dissesse em voz alta a um amigo, não se escreve.',
].join('\n· ')

/**
 * As regras que NÃO se desligam. São as de `lib/funis-ia.ts`, repetidas aqui porque este texto vai
 * para um modelo diferente — e uma regra dura que só existe num dos dois prompts é meia regra.
 */
const REGRAS_DURAS = [
  'NUNCA prometas lucro, nem sugiras que se ganha dinheiro garantido.',
  'NUNCA inventes números — de desempenho, de percentagens, de resultados. Não os tens.',
  'NUNCA inventes preços, prazos, descontos ou bónus. Os que existem estão em baixo; fora deles, não há.',
  'Não dás conselho de investimento personalizado.',
  'Se não souberes, dizes que não sabes e passas a conversa ao Ricardo.',
  'À PRIMEIRA demonstração de desinteresse, encerras com educação e não voltas a puxar.',
].join('\n· ')

/**
 * FASE 1 — o guião da resposta pública.
 *
 * O que está proibido em público é o que mata a conversa antes de ela começar: um preço debaixo de
 * um post é uma objecção a ser lida por todos os outros, e uma pergunta de qualificação em público
 * é um interrogatório à frente da audiência da pessoa.
 */
export function guiaoFase1(prometeDm: boolean): string {
  return (
    `Estás a responder a um COMENTÁRIO PÚBLICO no Instagram da MoreThanMoney.\n\n` +
    `ESTILO:\n· ${ESTILO}\n\n` +
    `REGRAS QUE NÃO SE NEGOCEIAM:\n· ${REGRAS_DURAS}\n\n` +
    `O QUE ESTA RESPOSTA FAZ, e só isto:\n` +
    `1. Valida o que a pessoa disse — em concreto, referindo o que ELA escreveu, não um elogio genérico.\n` +
    (prometeDm
      ? `2. Diz-lhe que lhe mandaste o material por privado. Uma frase.\n`
      : `2. Convida-a a escrever-te por privado. NÃO digas que já mandaste nada: a janela de ` +
        `privado deste comentário está fechada e a mensagem não vai sair. Prometer uma DM que não ` +
        `chega é pior do que não prometer nada.\n`) +
    `3. Mais nada. Uma resposta pública tem 1 a 2 frases.\n\n` +
    `PROIBIDO EM PÚBLICO: preços, links de pagamento, perguntas de qualificação, argumentos de ` +
    `venda. Nada disso se discute à frente da audiência da pessoa.`
  )
}

/**
 * FASE 2 — o guião da DM.
 *
 * A ordem é a do dono: entregar primeiro, qualificar depois, e só então falar de dinheiro. E a
 * regra que faz esta fase funcionar é a da UMA pergunta — ver {@link ESCADA_DE_QUALIFICACAO}.
 */
export function guiaoFase2(passo: PassoDeQualificacao): string {
  return (
    `Estás a escrever uma DM do Instagram da MoreThanMoney, a alguém que comentou num post nosso.\n\n` +
    `ESTILO:\n· ${ESTILO}\n\n` +
    `REGRAS QUE NÃO SE NEGOCEIAM:\n· ${REGRAS_DURAS}\n\n` +
    `QUEM É ESTA PESSOA (o cliente que procuramos): ${clienteIdeal()}\n\n` +
    `O QUE TEMOS PARA LHE DAR: ${propostaValor()}\n\n` +
    `A ESCADA E OS PREÇOS (são estes e mais nenhuns):\n· ${escadaNumaLinha()}\n` +
    `· ${ondeComprarTopoNumaLinha()}\n\n` +
    `A REGRA DA UMA PERGUNTA: fazes UMA pergunta por mensagem. Uma. Duas perguntas seguidas é um ` +
    `questionário, e a pessoa fecha a conversa em vez de responder a um formulário.\n\n` +
    `O PASSO ONDE ESTÁS AGORA: ${DESCRICAO_DO_PASSO[passo]}\n\n` +
    `Responde SÓ com a mensagem a enviar. Texto simples, sem aspas, sem prefixos.`
  )
}

// ═════════════════════════ 5. A ESCADA DE QUALIFICAÇÃO, UM DEGRAU DE CADA VEZ ═════════════════════════

export type PassoDeQualificacao =
  | 'entrega'
  | 'objectivo'
  | 'experiencia'
  | 'conta_corretora'
  | 'quando'
  | 'fecho'
  | 'encerrar'

/** A ordem de subida. Não se salta um degrau, e não se fazem dois na mesma mensagem. */
export const ESCADA_DE_QUALIFICACAO: PassoDeQualificacao[] = [
  'entrega',
  'objectivo',
  'experiencia',
  'conta_corretora',
  'quando',
  'fecho',
]

export const DESCRICAO_DO_PASSO: Record<PassoDeQualificacao, string> = {
  entrega:
    'ENTREGAR. Dás-lhe o que foi prometido no comentário, sem cobrar nada e sem condições. ' +
    'Só depois de entregar é que fazes a primeira pergunta — e é a do objectivo.',
  objectivo:
    'OBJECTIVO. Uma pergunta: o que é que ela quer — aprender a operar, ter sinais para copiar à ' +
    'mão, ou algo automático?',
  experiencia:
    'EXPERIÊNCIA. Uma pergunta: já opera, ou está a começar agora? Isto muda tudo o que se diz a ' +
    'seguir, e é a diferença entre falar com um curioso e falar com um cliente.',
  conta_corretora:
    'CORRETORA. Uma pergunta: já tem conta numa corretora? NÃO perguntes quanto tem, nem quanto ' +
    'quer investir — isso é informação financeira que não nos compete pedir por DM, e faz a ' +
    'conversa parecer uma fraude.',
  quando:
    'QUANDO. Uma pergunta: quer começar agora ou está só a ver? Uma resposta honesta aqui vale ' +
    'mais do que um sim arrancado à força.',
  fecho:
    `FECHO. Já sabes o que ela quer, onde está e quando quer começar. Propõe UM passo concreto e ` +
    `só um: o Membro (${PRECO_MEMBRO}) para entrar, o Premium (${PRECO_PREMIUM}) para o acesso ` +
    `completo, a rota da PU Prime (${MIN_DEPOSIT}$) para quem prefere deixar o capital na própria ` +
    `conta, ou o ${NOME_DEGRAU_TOPO} para quem já decidiu subir. Um passo, um link.`,
  encerrar:
    'ENCERRAR. A pessoa mostrou desinteresse. Agradeces, deixas a porta aberta numa frase, e ' +
    'ACABOU. Não repetes a oferta, não perguntas porquê, não mandas nada mais.',
}

/**
 * O degrau seguinte, dado onde se está.
 *
 * `encerrar` é terminal de propósito: um passo depois do encerrar não existe. Sem isto, a primeira
 * pessoa que dissesse «não, obrigado» recebia a pergunta seguinte da escada — que é a maneira mais
 * rápida de transformar um não educado numa denúncia.
 */
export function passoSeguinte(actual: PassoDeQualificacao): PassoDeQualificacao {
  if (actual === 'encerrar' || actual === 'fecho') return actual
  const i = ESCADA_DE_QUALIFICACAO.indexOf(actual)
  return i < 0 || i + 1 >= ESCADA_DE_QUALIFICACAO.length ? 'fecho' : ESCADA_DE_QUALIFICACAO[i + 1]
}

// ═════════════════════════ 6. QUANDO PARAR ═════════════════════════

/**
 * As palavras com que uma pessoa diz que não quer.
 *
 * A regra do dono é «encerrar à PRIMEIRA demonstração de desinteresse», e por isso esta lista é
 * deliberadamente generosa: o custo de encerrar cedo com quem ainda queria é uma venda que se
 * podia fazer noutro dia; o custo de insistir com quem já disse não é uma queixa à Meta e um passo
 * na direcção de perder a conta.
 */
const DESINTERESSE = [
  'não obrigado', 'nao obrigado', 'não, obrigado', 'nao, obrigado',
  'não tenho interesse', 'nao tenho interesse', 'sem interesse',
  'não quero', 'nao quero', 'não me interessa', 'nao me interessa',
  'para já não', 'para ja nao', 'agora não', 'agora nao',
  'deixa estar', 'esquece', 'não insistas', 'nao insistas',
  'pára', 'para de', 'stop', 'chega',
  'não me mandes', 'nao me mandes', 'não mandes mais', 'nao mandes mais',
  'bloquear', 'denunciar', 'spam', 'golpe', 'fraude', 'esquema',
  'remove', 'sai daqui', 'sair',
]

/**
 * A pessoa mostrou desinteresse?
 *
 * Também apanha um «não» sozinho, ou um «nao.» — que é como a maioria das pessoas recusa por DM.
 * Não apanha um «não» no meio de uma frase («não sei se percebi»), porque isso é uma pergunta
 * disfarçada e encerrar ali era perder um lead que estava a pedir ajuda.
 */
export function mostraDesinteresse(texto: string): boolean {
  const t = (texto || '').toLowerCase().trim()
  if (!t) return false
  const limpo = t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (limpo === 'nao' || limpo === 'não' || limpo === 'no') return true
  return DESINTERESSE.some((d) => limpo.includes(d.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()))
}

// ═════════════════════════ 7. VALE A PENA RESPONDER A ESTE COMENTÁRIO? ═════════════════════════

/**
 * Sinais de que quem comentou pode querer alguma coisa de nós.
 *
 * Isto NÃO substitui o funil por palavra-chave do `funnel.ts` — esse continua a mandar, porque as
 * palavras dele são as CTAs das campanhas e quem as escreve pediu exactamente aquilo. Isto é a
 * rede por baixo: as 5 pessoas que em 30 dias comentaram a sério e não escreveram nenhuma palavra
 * da campanha, e que por isso nunca chegaram a ser leads.
 */
const SINAIS_DE_INTERESSE = [
  'como', 'quanto', 'onde', 'quando', 'qual', 'quais', 'posso', 'dá para', 'da para',
  'funciona', 'ensina', 'aprender', 'começar', 'comecar', 'entrar', 'inscrever',
  'preço', 'preco', 'custa', 'mensalidade', 'subscrição', 'subscricao',
  'conta', 'corretora', 'broker', 'depósito', 'deposito', 'lote',
  'sinal', 'sinais', 'copiar', 'automático', 'automatico', 'app', 'scanner',
  'informação', 'informacao', 'info', 'explica', 'interessado', 'interessada',
  'dúvida', 'duvida', 'ajuda', 'quero saber',
]

export type Classificacao =
  /** Nem pública nem privada. Elogio simples, emoji, spam. O `ig-engage` já lhe agradece. */
  | 'ignorar'
  /** Há interesse: vale a resposta pública e, se a janela deixar, a DM. */
  | 'setter'
  /** Disse que não quer. Nem pública nem privada, e fica marcado para nunca mais. */
  | 'encerrar'

export interface FactosParaClassificar {
  texto: string
  /** O comentador é uma das nossas próprias contas? */
  ehNossa: boolean
}

/**
 * Decide o que fazer com um comentário.
 *
 * A ordem das três verificações não é arbitrária: o desinteresse vem PRIMEIRO, antes dos sinais de
 * interesse. Uma frase como «não quero saber de sinais» tem a palavra «sinais» lá dentro — se o
 * interesse fosse testado antes, essa pessoa recebia uma DM de vendas por ter dito que não queria
 * uma. É o erro mais caro que esta função pode cometer e é o único que ela não pode cometer.
 */
export function classificar(f: FactosParaClassificar): Classificacao {
  const texto = (f.texto || '').trim()
  if (f.ehNossa || !texto) return 'ignorar'
  if (mostraDesinteresse(texto)) return 'encerrar'

  const limpo = texto.toLowerCase()
  // Letras e dígitos reais: um comentário de três corações não é uma pergunta.
  const substancia = texto.replace(/[^\p{L}\p{N}]/gu, '')
  if (substancia.length < 6) return 'ignorar'

  const temPergunta = texto.includes('?')
  const temSinal = SINAIS_DE_INTERESSE.some((s) => limpo.includes(s))
  return temPergunta || temSinal ? 'setter' : 'ignorar'
}

// ═════════════════════════ 8. OS TEXTOS DE RESERVA ═════════════════════════

/**
 * O que sai quando o modelo não responde.
 *
 * Existem porque a alternativa é o silêncio, e um funil que emudece quando a chave da API falha é
 * um funil que se descobre avariado semanas depois — é o mesmo raciocínio da reserva em
 * `lib/funis-ia.ts`. São curtos, não prometem nada e não têm um único número.
 */
export const RESERVA_FASE1_COM_DM = 'Boa pergunta! Mandei-te o material por privado. 🙌'
export const RESERVA_FASE1_SEM_DM = 'Boa pergunta! Escreve-me por privado que explico com calma. 🙌'
export const RESERVA_FASE2 =
  'Olá! Vi o teu comentário e vim cá por privado para te explicar melhor.\n\n' +
  'Para não te dizer coisas a mais: o que procuras é aprender a operar, ter sinais para copiar, ' +
  'ou algo automático?'
export const RESERVA_ENCERRAR =
  'Sem problema, obrigado pela franqueza. Fico por aqui — se um dia quiseres, sabes onde estamos. 🙂'

/**
 * ═══ O QUE ISTO NÃO FAZ, E NÃO VAI FAZER ═══════════════════════════════════════════════════
 *
 * · NÃO inicia conversas com quem não interagiu. Não há endpoint para isso, e o que há para o
 *   simular é raspar perfis — que não é caminho, nem tecnicamente nem de outra maneira.
 * · NÃO transforma o `ig_radar_prospetos` em pessoas. São 572 PUBLICAÇÕES e zero gente: a API não
 *   devolve o autor numa pesquisa por hashtag. Já está escrito em `lib/captacao-hot-calls.ts` e
 *   continua verdade.
 * · NÃO usa a etiqueta `HUMAN_AGENT` para esticar a janela — ver
 *   {@link HUMAN_AGENT_NAO_E_PARA_AUTOMACAO}.
 * · NÃO manda uma segunda private reply ao mesmo comentário. A Meta dá uma.
 * · NÃO pergunta quanto dinheiro a pessoa tem. Ver o passo `conta_corretora`.
 */
