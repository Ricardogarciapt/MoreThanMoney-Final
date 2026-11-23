/**
 * O GUIÃO HÍBRIDO DO WHATSAPP (19/11/2026) — texto, áudio, texto, link.
 *
 * Pedido do Ricardo: «deve ir uma mensagem; havendo resposta, vai um áudio para encaminhar para o
 * funil: se quer conhecer a oportunidade, se já sabe o que faço, se não, etc. [...] conversão o mais
 * rápido possível, para tudo o que temos: plataforma, trading, Soluções, B2B».
 *
 * PURO: sem rede, sem base. É lido pelo motor (`lib/whatsapp/fluxo.ts`) e pode ser lido pelo Telegram
 * e pelo Instagram, para os três canais falarem igual.
 *
 * Boas práticas que isto segue (pesquisa de 19/11, fontes no PR):
 *  · a primeira mensagem pede licença e tem botões — quem toca em «Sim» deu opt-in com prova;
 *  · o áudio vem DEPOIS de a pessoa responder, curto (30–45 s), com o nome dela;
 *  · uma pergunta de cada vez, e a escolha da rota em lista, não em texto livre;
 *  · cada rota acaba num link concreto e numa pergunta;
 *  · sem promessas de rendimento, com o risco dito, e o aviso de voz gerada por IA.
 */
import { MIN_DEPOSIT } from '@/lib/broker/deposito-minimo'
import { PRECO_MEMBRO, PRECO_PREMIUM } from '@/lib/escada-precos'

const SITE = 'https://www.morethanmoney.pt'

export const ROTAS_WA = ['educacao', 'corretora', 'funded', 'solucoes', 'curioso'] as const
export type RotaWa = (typeof ROTAS_WA)[number]

/** Template de reencontro (Marketing): a 1.ª mensagem a contactos do Ricardo. Botões = opt-in. */
export const TEMPLATE_REENCONTRO = 'mtm_reencontro'
export const BOTAO_SIM = 'Sim, manda'
export const BOTAO_DEPOIS = 'Agora não'
export const BOTAO_SAIR = 'Não quero receber'

/** A lista de rotas, como aparece no WhatsApp (título ≤ 24, descrição ≤ 72). */
export const MENU_ROTAS: Array<{ id: RotaWa; titulo: string; descricao: string }> = [
  { id: 'educacao', titulo: 'Aprender trading', descricao: 'Formação com método e gestão de risco, ao teu ritmo' },
  { id: 'corretora', titulo: 'Acesso completo', descricao: 'Conta na corretora regulada e a plataforma incluída' },
  { id: 'funded', titulo: 'Testar sem arriscar', descricao: 'Desafios em conta simulada (MTM Funded)' },
  { id: 'solucoes', titulo: 'IA para o meu negócio', descricao: 'Automações, apps e agentes para empresas' },
  { id: 'curioso', titulo: 'Só quero conhecer', descricao: 'Explica-me o que é a MoreThanMoney' },
]

export const TEXTO_MENU = 'Para eu não te fazer perder tempo: o que te interessa mais agora?'
export const BOTAO_MENU = 'Escolher'

/**
 * Áudio 1 — depois do «Sim». ~60–70 s, conta um pouco da história (pedido do Ricardo 23/11:
 * «o áudio pode contar um pouco mais da história»). {nome} é substituído.
 * A lista de rotas sai SEMPRE depois deste áudio (`lib/whatsapp/fluxo.ts`).
 */
export function audioAbertura(nome: string): string {
  return (
    `Olá ${nome}, obrigado por responderes, a sério. ` +
    `Deixa-me contar-te em um minuto de onde isto vem. ` +
    `Passei muitos anos na farda: Exército, Fuzileiros e depois catorze anos na GNR. ` +
    `Era uma vida estável, mas eu sentia que estava preso às mesmas horas e ao mesmo ordenado. ` +
    `Comecei a estudar trading à noite, errei muito, perdi dinheiro, e foi aí que aprendi o mais importante: ` +
    `método e gestão de risco valem mais do que qualquer palpite. ` +
    `Foi daí que nasceu a MoreThanMoney: uma plataforma de educação financeira e trading, ` +
    `com comunidade, ferramentas próprias e acompanhamento. ` +
    `Hoje também ajudamos empresas a pôr a inteligência artificial a trabalhar por elas. ` +
    `Não te vou prometer dinheiro fácil, isso não existe. ` +
    `Mas se quiseres aprender a sério, ou dar um salto no teu negócio, acho que te posso ajudar. ` +
    `A seguir a este áudio mando-te uma lista. Escolhe o que faz mais sentido para ti.`
  )
}

/** Áudio 2 — por rota. ~30 s cada. */
export function audioDaRota(rota: RotaWa, nome: string): string {
  switch (rota) {
    case 'educacao':
      return (
        `${nome}, boa escolha. Na formação aprendes a ler o mercado com método e, acima de tudo, a proteger a conta. ` +
        `Tens aulas, comunidade e acompanhamento. Podes começar como Membro, e se quiseres tudo, o Premium. ` +
        `Mando-te já o link para veres por dentro. Qualquer dúvida, responde-me aqui.`
      )
    case 'corretora':
      return (
        `${nome}, esta é a rota que mais gente escolhe. Abres conta numa corretora regulada que recomendamos, ` +
        `com depósito mínimo de ${MIN_DEPOSIT} dólares, e enquanto a conta estiver ativa tens o Premium incluído. ` +
        `O dinheiro fica sempre em teu nome. Lembra-te que trading tem risco. Mando-te o passo a passo.`
      )
    case 'funded':
      return (
        `${nome}, o MTM Funded é para provares o teu método sem arriscar capital próprio. ` +
        `São desafios em conta simulada, com regras claras. Quem cumpre pode ganhar um patrocínio de desempenho. ` +
        `Não é uma prop firm, é treino a sério. Mando-te o link para veres como funciona.`
      )
    case 'solucoes':
      return (
        `${nome}, do lado das empresas fazemos automações, apps e agentes de inteligência artificial ` +
        `que atendem clientes, marcam reuniões e tratam do trabalho repetitivo. ` +
        `Tens exemplos reais na página. Se me disseres o teu ramo, digo-te o que faria no teu caso.`
      )
    default:
      return (
        `${nome}, em resumo: a MoreThanMoney ensina a investir e a fazer trading com cabeça, ` +
        `tem uma comunidade e ferramentas próprias, e tem uma área de soluções de inteligência artificial para empresas. ` +
        `Mando-te a página principal. Depois diz-me o que te chamou mais à atenção.`
      )
  }
}

/** O texto com link que segue o áudio da rota. Termina sempre numa pergunta. */
export function textoDaRota(rota: RotaWa): string {
  switch (rota) {
    case 'educacao':
      return (
        `📚 Formação MoreThanMoney\n• Membro: ${PRECO_MEMBRO}\n• Premium: ${PRECO_PREMIUM} (acesso completo)\n` +
        `Vê por dentro: ${SITE}/f/educacao\n\nJá operaste alguma vez ou começas do zero?`
      )
    case 'corretora':
      return (
        `🏦 Rota Corretora\n1) Abres conta: ${SITE}/abrir-conta\n2) Depósito mínimo: ${MIN_DEPOSIT} $\n` +
        `3) Mandas-me o UID e fica tudo ativo.\n\nJá tens conta numa corretora?`
      )
    case 'funded':
      return `🎯 MTM Funded (conta simulada): ${SITE}/mtmfunded\n\nQueres que te explique as regras do primeiro desafio?`
    case 'solucoes':
      return `🤖 MoreThanMoney Soluções: ${SITE}/solucoes\n\nQual é o teu ramo de negócio?`
    default:
      return `🌐 ${SITE}\n\nO que te interessa mais: aprender trading, a rota da corretora ou IA para negócios?`
  }
}

export const TEXTO_DEPOIS = 'Sem problema 🙂 Fica com o meu contacto. Quando quiseres, é só escreveres aqui.'
/**
 * Rodapé discreto da lista que segue o áudio (≤ 60 car.). Substitui a mensagem solta de aviso, que o
 * Ricardo achou desnecessária (23/11); fica só esta linha pequena por causa do AI Act (art. 50.º).
 */
export const AVISO_IA = 'Áudio com a voz do Ricardo, feita com IA'
export const TEXTO_HUMANO = 'Combinado, vou passar-te ao Ricardo. Se preferires marcar já uma conversa: ' + `${SITE}/agendar`

/** Lê a intenção numa resposta escrita (quando a pessoa não toca nos botões). Puro. */
export function lerIntencao(texto: string): RotaWa | 'sim' | 'depois' | 'sair' | 'humano' | null {
  const t = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
  if (/^(sair|parar|stop|cancelar|nao quero receber)\b/.test(t)) return 'sair'
  if (/^(sim|claro|pode|podes|manda|ok|bora|vamos|quero|s)\b/.test(t)) return 'sim'
  if (/^(agora nao|depois|mais tarde|nao)\b/.test(t)) return 'depois'
  if (/\b(falar com (o )?ricardo|pessoa|humano|ligar|chamada|telefonar)\b/.test(t)) return 'humano'
  if (/\b(empresa|negocio|loja|restaurante|clinica|automat|ia para|site|app)\b/.test(t)) return 'solucoes'
  if (/\b(corretora|pu ?prime|deposit|conta real|broker|uid)\b/.test(t)) return 'corretora'
  if (/\b(funded|simulad|desafio|prop)\b/.test(t)) return 'funded'
  if (/\b(aprender|curso|formacao|aulas|trading|forex|ouro|sinais|premium|membro)\b/.test(t)) return 'educacao'
  if (/\b(conhecer|o que e|curios|explica)\b/.test(t)) return 'curioso'
  return null
}
