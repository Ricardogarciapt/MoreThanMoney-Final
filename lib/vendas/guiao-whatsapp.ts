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
import { MEMBRO_MENSAL_EUR, PREMIUM_MENSAL_EUR } from '@/lib/escada-precos'
import type { Lingua } from '@/lib/whatsapp/linguas'
import { linkAgendar } from '@/lib/agenda/link'

const SITE = 'https://www.morethanmoney.pt'
// Link de parceiro da PU Prime (o mesmo de lib/telegram-broker-gate.ts; aqui sem importar o motor todo).
const PUPRIME = 'https://www.puprime.com/campaign?cs=morethanmoney'
const AGENDA = linkAgendar('apresentacao')

export const ROTAS_WA = ['educacao', 'corretora', 'funded', 'solucoes', 'curioso'] as const
export type RotaWa = (typeof ROTAS_WA)[number]

/** Template de reencontro (Marketing): a 1.ª mensagem a contactos do Ricardo. Botões = opt-in. */
export const TEMPLATE_REENCONTRO = 'mtm_reencontro'
/** A abertura de 23/11, nas 5 línguas (mesmo nome, uma versão por língua na Meta). */
export const TEMPLATE_REENCONTRO_V3 = 'mtm_reencontro_v3'
/** 23/11: abertura de prospeto novo (5 línguas) — a que sai para a lista importada. */
export const TEMPLATE_PROSPETO = 'mtm_prospeto'

/** Id da linha «mudar de língua» no menu de rotas. */
export const ID_MUDAR_LINGUA = 'mudar_lingua'
/** Id da linha «falar com uma pessoa» no menu de rotas. */
export const ID_HUMANO = 'humano'

interface Guiao {
  botaoSim: string
  botaoDepois: string
  botaoSair: string
  menu: Array<{ id: RotaWa; titulo: string; descricao: string }>
  linhaLingua: { titulo: string; descricao: string }
  linhaHumano: { titulo: string; descricao: string }
  textoMenu: string
  textoMenuDeNovo: string
  botaoMenu: string
  textoLinguas: string
  botaoLinguas: string
  textoDepois: string
  textoHumano: string
  avisoIa: string
  /** Pergunta de licença dentro da janela (depois de a pessoa trocar de língua na abertura). */
  licenca: (nome: string) => string
  audioAbertura: (nome: string) => string
  audioDaRota: (rota: RotaWa, nome: string) => string
  textoDaRota: (rota: RotaWa) => string
}

const eur = (v: number, l: Lingua) => (l === 'en' ? `€${v}` : `${v} €`)

export const GUIAO: Record<Lingua, Guiao> = {
  pt: {
    botaoSim: 'Sim, manda',
    botaoDepois: 'Agora não',
    botaoSair: 'Não quero receber',
    menu: [
      { id: 'educacao', titulo: 'Aprender trading', descricao: 'Formação com método e gestão de risco, ao teu ritmo' },
      { id: 'corretora', titulo: 'Acesso completo', descricao: 'Conta na corretora regulada e a plataforma incluída' },
      { id: 'funded', titulo: 'Testar sem arriscar', descricao: 'Desafios em conta simulada (MTM Funded)' },
      { id: 'solucoes', titulo: 'IA para o meu negócio', descricao: 'Automações, apps e agentes para empresas' },
      { id: 'curioso', titulo: 'Só quero conhecer', descricao: 'Explica-me o que é a MoreThanMoney' },
    ],
    linhaHumano: { titulo: '🙋 Falar com uma pessoa', descricao: 'Um assistente da equipa fala contigo' },
    linhaLingua: { titulo: '🌍 Mudar de língua', descricao: 'English · Français · Deutsch · Español' },
    textoMenu: 'Para eu não te fazer perder tempo: o que te interessa mais agora?',
    textoMenuDeNovo: 'Escolhe uma opção para eu te mandar o que interessa 👇',
    botaoMenu: 'Escolher',
    textoLinguas: 'Em que língua preferes falar? 🌍',
    botaoLinguas: 'Língua',
    textoDepois: 'Sem problema 🙂 Fica com o meu contacto. Quando quiseres, é só escreveres aqui.',
    textoHumano: `Combinado 🙂 Um assistente da nossa equipa vai falar contigo em breve, aqui mesmo.\n\nSe preferires, marca já uma conversa à hora que te der jeito: ${AGENDA}`,
    avisoIa: '',
    licenca: (n) => `Combinado${n ? `, ${n}` : ''} 🙂 Posso mandar-te o áudio de 1 minuto a contar como tudo começou?`,
    audioAbertura: (n) =>
      `Olá ${n}, obrigado por responderes, a sério. ` +
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
      `A seguir a este áudio mando-te uma lista. Escolhe o que faz mais sentido para ti.`,
    audioDaRota: (rota, n) => {
      switch (rota) {
        case 'educacao':
          return `${n}, boa escolha. Na formação aprendes a ler o mercado com método e, acima de tudo, a proteger a conta. Tens aulas, comunidade e acompanhamento. Podes começar como Membro, e se quiseres tudo, o Premium. Mando-te já o link para veres por dentro. Qualquer dúvida, responde-me aqui.`
        case 'corretora':
          return `${n}, esta é a rota que mais gente escolhe. Abres conta numa corretora regulada que recomendamos, com depósito mínimo de ${MIN_DEPOSIT} dólares, e enquanto a conta estiver ativa tens o Premium incluído. O dinheiro fica sempre em teu nome. Lembra-te que trading tem risco. Mando-te o passo a passo.`
        case 'funded':
          return `${n}, o MTM Funded é para provares o teu método sem arriscar capital próprio. São desafios em conta simulada, com regras claras. Quem cumpre pode ganhar um patrocínio de desempenho. Não é uma prop firm, é treino a sério. Mando-te o link para veres como funciona.`
        case 'solucoes':
          return `${n}, do lado das empresas fazemos automações, apps e agentes de inteligência artificial que atendem clientes, marcam reuniões e tratam do trabalho repetitivo. Tens exemplos reais na página. Se me disseres o teu ramo, digo-te o que faria no teu caso.`
        default:
          return `${n}, em resumo: a MoreThanMoney ensina a investir e a fazer trading com cabeça, tem uma comunidade e ferramentas próprias, e tem uma área de soluções de inteligência artificial para empresas. Mando-te a página principal. Depois diz-me o que te chamou mais à atenção.`
      }
    },
    textoDaRota: (rota) => {
      switch (rota) {
        case 'educacao':
          return `📚 Formação MoreThanMoney\n• Membro: ${eur(MEMBRO_MENSAL_EUR, 'pt')}/mês\n• Premium: ${eur(PREMIUM_MENSAL_EUR, 'pt')}/mês (acesso completo)\nVê por dentro: ${SITE}/f/educacao\n\nJá operaste alguma vez ou começas do zero?`
        case 'corretora':
          return `🏦 Rota Corretora, tudo aqui no WhatsApp:\n1) Abres conta na PU Prime: ${PUPRIME}\n2) Depositas o mínimo de ${MIN_DEPOSIT} $ (o dinheiro fica em teu nome)\n3) Mandas-me aqui o teu UID (só o número) e um print do depósito, e eu valido.\n\nJá tens conta na PU Prime?`
        case 'funded':
          return `🎯 MTM Funded (conta simulada): ${SITE}/mtmfunded\n\nQueres que te explique as regras do primeiro desafio?`
        case 'solucoes':
          return `🤖 MoreThanMoney Soluções: ${SITE}/solucoes\n\nQual é o teu ramo de negócio?`
        default:
          return `🌐 ${SITE}\n\nO que te interessa mais: aprender trading, a rota da corretora ou IA para negócios?`
      }
    },
  },

  en: {
    botaoSim: 'Yes, send it',
    botaoDepois: 'Not now',
    botaoSair: 'Stop messages',
    menu: [
      { id: 'educacao', titulo: 'Learn trading', descricao: 'Training with a method and risk management, at your pace' },
      { id: 'corretora', titulo: 'Full access', descricao: 'Account with a regulated broker, platform included' },
      { id: 'funded', titulo: 'Test with no risk', descricao: 'Challenges on a simulated account (MTM Funded)' },
      { id: 'solucoes', titulo: 'AI for my business', descricao: 'Automations, apps and AI agents for companies' },
      { id: 'curioso', titulo: 'Just curious', descricao: 'Tell me what MoreThanMoney is' },
    ],
    linhaHumano: { titulo: '🙋 Talk to a person', descricao: 'Someone from our team will reach out' },
    linhaLingua: { titulo: '🌍 Change language', descricao: 'Português · Français · Deutsch · Español' },
    textoMenu: "So I don't waste your time: what interests you most right now?",
    textoMenuDeNovo: "Pick an option and I'll send you what matters 👇",
    botaoMenu: 'Choose',
    textoLinguas: 'Which language do you prefer? 🌍',
    botaoLinguas: 'Language',
    textoDepois: "No problem 🙂 Keep my number. Whenever you want, just write here.",
    textoHumano: `Sure 🙂 Someone from our team will be in touch with you shortly, right here.\n\nIf you prefer, book a call at a time that suits you: ${AGENDA}`,
    avisoIa: '',
    licenca: (n) => `Sure${n ? `, ${n}` : ''} 🙂 Can I send you the 1-minute voice note about how it all started?`,
    audioAbertura: (n) =>
      `Hi ${n}, thanks for replying, really. ` +
      `Let me tell you in one minute where this comes from. ` +
      `I spent many years in uniform: the Army, the Marines, and then fourteen years in the Portuguese National Guard. ` +
      `It was a stable life, but I felt stuck with the same hours and the same salary. ` +
      `I started studying trading at night, made a lot of mistakes, lost money, and that's where I learned the most important thing: ` +
      `method and risk management are worth more than any guess. ` +
      `That's how MoreThanMoney was born: a financial education and trading platform, ` +
      `with a community, our own tools and real support. ` +
      `Today we also help businesses put artificial intelligence to work for them. ` +
      `I won't promise you easy money, that doesn't exist. ` +
      `But if you want to learn properly, or take your business to the next level, I think I can help. ` +
      `Right after this voice note I'll send you a list. Pick what makes the most sense for you.`,
    audioDaRota: (rota, n) => {
      switch (rota) {
        case 'educacao':
          return `${n}, good choice. In the training you learn to read the market with a method and, above all, to protect your account. You get lessons, a community and support. You can start as a Member, and if you want everything, Premium. I'm sending you the link so you can see it from the inside. Any questions, just reply here.`
        case 'corretora':
          return `${n}, this is the route most people choose. You open an account with a regulated broker we recommend, with a minimum deposit of ${MIN_DEPOSIT} dollars, and while the account is active you get Premium included. The money always stays in your name. Remember that trading carries risk. I'm sending you the step by step.`
        case 'funded':
          return `${n}, MTM Funded is for proving your method without risking your own capital. They're challenges on a simulated account, with clear rules. Those who pass can earn a performance sponsorship. It's not a prop firm, it's serious training. I'm sending you the link to see how it works.`
        case 'solucoes':
          return `${n}, on the business side we build automations, apps and artificial intelligence agents that answer customers, book meetings and handle repetitive work. You'll find real examples on the page. Tell me your industry and I'll tell you what I'd do in your case.`
        default:
          return `${n}, in short: MoreThanMoney teaches you to invest and trade with a clear head, has a community and its own tools, and has an artificial intelligence solutions area for businesses. I'm sending you the main page. Then tell me what caught your attention the most.`
      }
    },
    textoDaRota: (rota) => {
      switch (rota) {
        case 'educacao':
          return `📚 MoreThanMoney training\n• Member: ${eur(MEMBRO_MENSAL_EUR, 'en')}/month\n• Premium: ${eur(PREMIUM_MENSAL_EUR, 'en')}/month (full access)\nSee it inside: ${SITE}/f/educacao\n\nHave you ever traded, or are you starting from zero?`
        case 'corretora':
          return `🏦 Broker route, all right here:\n1) Open your PU Prime account: ${PUPRIME}\n2) Deposit at least $${MIN_DEPOSIT} (the money stays in your name)\n3) Send me your UID (just the number) and a screenshot of the deposit here, and I validate it.\n\nDo you already have a PU Prime account?`
        case 'funded':
          return `🎯 MTM Funded (simulated account): ${SITE}/mtmfunded\n\nShall I explain the rules of the first challenge?`
        case 'solucoes':
          return `🤖 MoreThanMoney Solutions: ${SITE}/solucoes\n\nWhat's your line of business?`
        default:
          return `🌐 ${SITE}\n\nWhat interests you most: learning to trade, the broker route or AI for business?`
      }
    },
  },

  fr: {
    botaoSim: 'Oui, envoie',
    botaoDepois: 'Pas maintenant',
    botaoSair: 'Ne plus recevoir',
    menu: [
      { id: 'educacao', titulo: 'Apprendre le trading', descricao: 'Formation avec méthode et gestion du risque, à ton rythme' },
      { id: 'corretora', titulo: 'Accès complet', descricao: 'Compte chez un courtier régulé, plateforme incluse' },
      { id: 'funded', titulo: 'Tester sans risque', descricao: 'Challenges sur compte simulé (MTM Funded)' },
      { id: 'solucoes', titulo: 'IA pour mon entreprise', descricao: 'Automatisations, apps et agents IA pour entreprises' },
      { id: 'curioso', titulo: 'Juste découvrir', descricao: "Explique-moi ce qu'est MoreThanMoney" },
    ],
    linhaHumano: { titulo: '🙋 Parler à quelqu’un', descricao: "Quelqu'un de l'équipe te contacte" },
    linhaLingua: { titulo: '🌍 Changer de langue', descricao: 'Português · English · Deutsch · Español' },
    textoMenu: "Pour ne pas te faire perdre de temps : qu'est-ce qui t'intéresse le plus en ce moment ?",
    textoMenuDeNovo: "Choisis une option et je t'envoie ce qui t'intéresse 👇",
    botaoMenu: 'Choisir',
    textoLinguas: 'Dans quelle langue préfères-tu parler ? 🌍',
    botaoLinguas: 'Langue',
    textoDepois: "Pas de souci 🙂 Garde mon numéro. Quand tu veux, écris-moi ici.",
    textoHumano: `D'accord 🙂 Quelqu'un de notre équipe va te contacter très bientôt, ici même.\n\nSi tu préfères, réserve un appel au moment qui t'arrange : ${AGENDA}`,
    avisoIa: '',
    licenca: (n) => `D'accord${n ? `, ${n}` : ''} 🙂 Je peux t'envoyer le vocal d'une minute qui raconte comment tout a commencé ?`,
    audioAbertura: (n) =>
      `Salut ${n}, merci de ta réponse, vraiment. ` +
      `Laisse-moi te raconter en une minute d'où ça vient. ` +
      `J'ai passé de nombreuses années en uniforme : l'armée, les fusiliers marins, puis quatorze ans dans la Garde nationale portugaise. ` +
      `C'était une vie stable, mais je me sentais coincé avec les mêmes horaires et le même salaire. ` +
      `J'ai commencé à étudier le trading le soir, j'ai fait beaucoup d'erreurs, j'ai perdu de l'argent, et c'est là que j'ai appris le plus important : ` +
      `la méthode et la gestion du risque valent plus que n'importe quelle intuition. ` +
      `C'est comme ça qu'est née MoreThanMoney : une plateforme d'éducation financière et de trading, ` +
      `avec une communauté, nos propres outils et un vrai accompagnement. ` +
      `Aujourd'hui, on aide aussi les entreprises à mettre l'intelligence artificielle au travail pour elles. ` +
      `Je ne vais pas te promettre de l'argent facile, ça n'existe pas. ` +
      `Mais si tu veux apprendre sérieusement, ou faire passer ton entreprise au niveau supérieur, je pense pouvoir t'aider. ` +
      `Juste après ce vocal, je t'envoie une liste. Choisis ce qui a le plus de sens pour toi.`,
    audioDaRota: (rota, n) => {
      switch (rota) {
        case 'educacao':
          return `${n}, bon choix. Dans la formation, tu apprends à lire le marché avec méthode et surtout à protéger ton compte. Tu as des cours, une communauté et un accompagnement. Tu peux commencer comme Membre, et si tu veux tout, le Premium. Je t'envoie le lien pour voir de l'intérieur. Une question, réponds-moi ici.`
        case 'corretora':
          return `${n}, c'est la voie que la plupart des gens choisissent. Tu ouvres un compte chez un courtier régulé que nous recommandons, avec un dépôt minimum de ${MIN_DEPOSIT} dollars, et tant que le compte est actif, le Premium est inclus. L'argent reste toujours à ton nom. N'oublie pas que le trading comporte des risques. Je t'envoie les étapes.`
        case 'funded':
          return `${n}, MTM Funded sert à prouver ta méthode sans risquer ton propre capital. Ce sont des challenges sur compte simulé, avec des règles claires. Ceux qui réussissent peuvent obtenir un parrainage de performance. Ce n'est pas une prop firm, c'est un vrai entraînement. Je t'envoie le lien pour voir comment ça marche.`
        case 'solucoes':
          return `${n}, côté entreprises, on crée des automatisations, des apps et des agents d'intelligence artificielle qui répondent aux clients, prennent les rendez-vous et s'occupent des tâches répétitives. Tu trouveras des exemples réels sur la page. Dis-moi ton secteur et je te dis ce que je ferais dans ton cas.`
        default:
          return `${n}, en bref : MoreThanMoney t'apprend à investir et à faire du trading avec la tête froide, a une communauté et ses propres outils, et une partie solutions d'intelligence artificielle pour les entreprises. Je t'envoie la page principale. Ensuite, dis-moi ce qui t'a le plus marqué.`
      }
    },
    textoDaRota: (rota) => {
      switch (rota) {
        case 'educacao':
          return `📚 Formation MoreThanMoney\n• Membre : ${eur(MEMBRO_MENSAL_EUR, 'fr')}/mois\n• Premium : ${eur(PREMIUM_MENSAL_EUR, 'fr')}/mois (accès complet)\nVoir de l'intérieur : ${SITE}/f/educacao\n\nTu as déjà tradé ou tu pars de zéro ?`
        case 'corretora':
          return `🏦 Voie courtier, tout ici :\n1) Ouvre ton compte PU Prime : ${PUPRIME}\n2) Dépose au moins ${MIN_DEPOSIT} $ (l'argent reste à ton nom)\n3) Envoie-moi ici ton UID (juste le numéro) et une capture du dépôt, et je valide.\n\nTu as déjà un compte PU Prime ?`
        case 'funded':
          return `🎯 MTM Funded (compte simulé) : ${SITE}/mtmfunded\n\nTu veux que je t'explique les règles du premier challenge ?`
        case 'solucoes':
          return `🤖 MoreThanMoney Solutions : ${SITE}/solucoes\n\nQuel est ton secteur d'activité ?`
        default:
          return `🌐 ${SITE}\n\nQu'est-ce qui t'intéresse le plus : apprendre le trading, la voie courtier ou l'IA pour les entreprises ?`
      }
    },
  },

  de: {
    botaoSim: 'Ja, schick es',
    botaoDepois: 'Jetzt nicht',
    botaoSair: 'Nicht mehr erhalten',
    menu: [
      { id: 'educacao', titulo: 'Trading lernen', descricao: 'Ausbildung mit Methode und Risikomanagement, in deinem Tempo' },
      { id: 'corretora', titulo: 'Voller Zugang', descricao: 'Konto bei einem regulierten Broker, Plattform inklusive' },
      { id: 'funded', titulo: 'Ohne Risiko testen', descricao: 'Challenges auf einem Demokonto (MTM Funded)' },
      { id: 'solucoes', titulo: 'KI für mein Business', descricao: 'Automatisierungen, Apps und KI-Agenten für Firmen' },
      { id: 'curioso', titulo: 'Nur reinschauen', descricao: 'Erklär mir, was MoreThanMoney ist' },
    ],
    linhaHumano: { titulo: '🙋 Mit jemandem reden', descricao: 'Jemand aus dem Team meldet sich' },
    linhaLingua: { titulo: '🌍 Sprache ändern', descricao: 'Português · English · Français · Español' },
    textoMenu: 'Damit ich dir keine Zeit raube: Was interessiert dich gerade am meisten?',
    textoMenuDeNovo: 'Wähl eine Option und ich schicke dir das Passende 👇',
    botaoMenu: 'Auswählen',
    textoLinguas: 'In welcher Sprache möchtest du schreiben? 🌍',
    botaoLinguas: 'Sprache',
    textoDepois: 'Kein Problem 🙂 Behalte meine Nummer. Wann immer du willst, schreib mir einfach hier.',
    textoHumano: `Alles klar 🙂 Jemand aus unserem Team meldet sich in Kürze bei dir, direkt hier.\n\nWenn du willst, buch dir gleich einen Termin, wann es dir passt: ${AGENDA}`,
    avisoIa: '',
    licenca: (n) => `Alles klar${n ? `, ${n}` : ''} 🙂 Darf ich dir die einminütige Sprachnachricht schicken, wie alles angefangen hat?`,
    audioAbertura: (n) =>
      `Hallo ${n}, danke für deine Antwort, wirklich. ` +
      `Lass mich dir in einer Minute erzählen, woher das kommt. ` +
      `Ich war viele Jahre in Uniform: beim Heer, bei den Marineinfanteristen und danach vierzehn Jahre bei der portugiesischen Nationalgarde. ` +
      `Es war ein sicheres Leben, aber ich fühlte mich gefangen in denselben Arbeitszeiten und demselben Gehalt. ` +
      `Ich habe abends angefangen, Trading zu lernen, habe viele Fehler gemacht, Geld verloren, und dabei das Wichtigste gelernt: ` +
      `Methode und Risikomanagement sind mehr wert als jedes Bauchgefühl. ` +
      `So ist MoreThanMoney entstanden: eine Plattform für Finanzbildung und Trading, ` +
      `mit Community, eigenen Tools und echter Begleitung. ` +
      `Heute helfen wir auch Unternehmen, künstliche Intelligenz für sich arbeiten zu lassen. ` +
      `Ich verspreche dir kein schnelles Geld, das gibt es nicht. ` +
      `Aber wenn du es ernsthaft lernen oder dein Business auf das nächste Level bringen willst, kann ich dir helfen. ` +
      `Gleich nach dieser Sprachnachricht schicke ich dir eine Liste. Wähl aus, was für dich am meisten Sinn ergibt.`,
    audioDaRota: (rota, n) => {
      switch (rota) {
        case 'educacao':
          return `${n}, gute Wahl. In der Ausbildung lernst du, den Markt mit Methode zu lesen und vor allem dein Konto zu schützen. Du bekommst Lektionen, Community und Begleitung. Du kannst als Mitglied starten, und wenn du alles willst, mit Premium. Ich schicke dir gleich den Link, damit du reinschauen kannst. Bei Fragen antworte einfach hier.`
        case 'corretora':
          return `${n}, das ist der Weg, den die meisten wählen. Du eröffnest ein Konto bei einem regulierten Broker, den wir empfehlen, mit einer Mindesteinzahlung von ${MIN_DEPOSIT} Dollar, und solange das Konto aktiv ist, ist Premium inklusive. Das Geld bleibt immer auf deinen Namen. Denk daran, dass Trading Risiken hat. Ich schicke dir die Schritte.`
        case 'funded':
          return `${n}, MTM Funded ist dafür da, deine Methode zu beweisen, ohne eigenes Kapital zu riskieren. Es sind Challenges auf einem Demokonto mit klaren Regeln. Wer besteht, kann ein Leistungssponsoring bekommen. Es ist keine Prop Firm, sondern echtes Training. Ich schicke dir den Link, wie es funktioniert.`
        case 'solucoes':
          return `${n}, für Unternehmen bauen wir Automatisierungen, Apps und KI-Agenten, die Kunden antworten, Termine vereinbaren und wiederkehrende Arbeit übernehmen. Echte Beispiele findest du auf der Seite. Sag mir deine Branche und ich sage dir, was ich in deinem Fall machen würde.`
        default:
          return `${n}, kurz gesagt: MoreThanMoney bringt dir bei, mit kühlem Kopf zu investieren und zu traden, hat eine Community und eigene Tools, und einen Bereich mit KI-Lösungen für Unternehmen. Ich schicke dir die Hauptseite. Sag mir danach, was dich am meisten angesprochen hat.`
      }
    },
    textoDaRota: (rota) => {
      switch (rota) {
        case 'educacao':
          return `📚 MoreThanMoney Ausbildung\n• Mitglied: ${eur(MEMBRO_MENSAL_EUR, 'de')}/Monat\n• Premium: ${eur(PREMIUM_MENSAL_EUR, 'de')}/Monat (voller Zugang)\nSchau rein: ${SITE}/f/educacao\n\nHast du schon mal getradet oder fängst du bei null an?`
        case 'corretora':
          return `🏦 Broker-Weg, alles hier:\n1) Konto bei PU Prime eröffnen: ${PUPRIME}\n2) Mindestens ${MIN_DEPOSIT} $ einzahlen (das Geld bleibt auf deinen Namen)\n3) Schick mir hier deine UID (nur die Nummer) und einen Screenshot der Einzahlung, ich prüfe es.\n\nHast du schon ein PU-Prime-Konto?`
        case 'funded':
          return `🎯 MTM Funded (Demokonto): ${SITE}/mtmfunded\n\nSoll ich dir die Regeln der ersten Challenge erklären?`
        case 'solucoes':
          return `🤖 MoreThanMoney Solutions: ${SITE}/solucoes\n\nIn welcher Branche bist du tätig?`
        default:
          return `🌐 ${SITE}\n\nWas interessiert dich am meisten: Trading lernen, der Broker-Weg oder KI fürs Business?`
      }
    },
  },

  es: {
    botaoSim: 'Sí, mándalo',
    botaoDepois: 'Ahora no',
    botaoSair: 'No quiero recibir',
    menu: [
      { id: 'educacao', titulo: 'Aprender trading', descricao: 'Formación con método y gestión del riesgo, a tu ritmo' },
      { id: 'corretora', titulo: 'Acceso completo', descricao: 'Cuenta en un bróker regulado, plataforma incluida' },
      { id: 'funded', titulo: 'Probar sin riesgo', descricao: 'Desafíos en cuenta simulada (MTM Funded)' },
      { id: 'solucoes', titulo: 'IA para mi negocio', descricao: 'Automatizaciones, apps y agentes de IA para empresas' },
      { id: 'curioso', titulo: 'Solo conocer', descricao: 'Explícame qué es MoreThanMoney' },
    ],
    linhaHumano: { titulo: '🙋 Hablar con alguien', descricao: 'Alguien del equipo te contactará' },
    linhaLingua: { titulo: '🌍 Cambiar idioma', descricao: 'Português · English · Français · Deutsch' },
    textoMenu: 'Para no hacerte perder el tiempo: ¿qué te interesa más ahora?',
    textoMenuDeNovo: 'Elige una opción y te mando lo que te interesa 👇',
    botaoMenu: 'Elegir',
    textoLinguas: '¿En qué idioma prefieres hablar? 🌍',
    botaoLinguas: 'Idioma',
    textoDepois: 'Sin problema 🙂 Guarda mi número. Cuando quieras, escríbeme aquí.',
    textoHumano: `Vale 🙂 Alguien de nuestro equipo te contactará muy pronto, aquí mismo.\n\nSi prefieres, reserva ya una llamada a la hora que te venga bien: ${AGENDA}`,
    avisoIa: '',
    licenca: (n) => `Vale${n ? `, ${n}` : ''} 🙂 ¿Te mando el audio de 1 minuto contando cómo empezó todo?`,
    audioAbertura: (n) =>
      `Hola ${n}, gracias por responder, de verdad. ` +
      `Déjame contarte en un minuto de dónde viene esto. ` +
      `Pasé muchos años de uniforme: el Ejército, los Fusileros y después catorce años en la Guardia Nacional portuguesa. ` +
      `Era una vida estable, pero me sentía atrapado en los mismos horarios y el mismo sueldo. ` +
      `Empecé a estudiar trading por las noches, me equivoqué mucho, perdí dinero, y ahí aprendí lo más importante: ` +
      `el método y la gestión del riesgo valen más que cualquier corazonada. ` +
      `Así nació MoreThanMoney: una plataforma de educación financiera y trading, ` +
      `con comunidad, herramientas propias y acompañamiento de verdad. ` +
      `Hoy también ayudamos a empresas a poner la inteligencia artificial a trabajar para ellas. ` +
      `No te voy a prometer dinero fácil, eso no existe. ` +
      `Pero si quieres aprender en serio, o dar un salto en tu negocio, creo que te puedo ayudar. ` +
      `Justo después de este audio te mando una lista. Elige lo que tenga más sentido para ti.`,
    audioDaRota: (rota, n) => {
      switch (rota) {
        case 'educacao':
          return `${n}, buena elección. En la formación aprendes a leer el mercado con método y, sobre todo, a proteger tu cuenta. Tienes clases, comunidad y acompañamiento. Puedes empezar como Miembro y, si lo quieres todo, con el Premium. Te mando ya el enlace para que lo veas por dentro. Cualquier duda, respóndeme aquí.`
        case 'corretora':
          return `${n}, esta es la ruta que más gente elige. Abres cuenta en un bróker regulado que recomendamos, con un depósito mínimo de ${MIN_DEPOSIT} dólares, y mientras la cuenta esté activa tienes el Premium incluido. El dinero siempre queda a tu nombre. Recuerda que el trading tiene riesgo. Te mando el paso a paso.`
        case 'funded':
          return `${n}, MTM Funded es para demostrar tu método sin arriesgar capital propio. Son desafíos en cuenta simulada, con reglas claras. Quien los supera puede ganar un patrocinio de rendimiento. No es una prop firm, es entrenamiento en serio. Te mando el enlace para que veas cómo funciona.`
        case 'solucoes':
          return `${n}, en el lado de las empresas hacemos automatizaciones, apps y agentes de inteligencia artificial que atienden clientes, agendan reuniones y se encargan del trabajo repetitivo. Tienes ejemplos reales en la página. Dime tu sector y te digo qué haría en tu caso.`
        default:
          return `${n}, en resumen: MoreThanMoney enseña a invertir y a hacer trading con cabeza, tiene una comunidad y herramientas propias, y un área de soluciones de inteligencia artificial para empresas. Te mando la página principal. Luego dime qué te llamó más la atención.`
      }
    },
    textoDaRota: (rota) => {
      switch (rota) {
        case 'educacao':
          return `📚 Formación MoreThanMoney\n• Miembro: ${eur(MEMBRO_MENSAL_EUR, 'es')}/mes\n• Premium: ${eur(PREMIUM_MENSAL_EUR, 'es')}/mes (acceso completo)\nMíralo por dentro: ${SITE}/f/educacao\n\n¿Ya has operado alguna vez o empiezas de cero?`
        case 'corretora':
          return `🏦 Ruta bróker, todo aquí:\n1) Abres tu cuenta en PU Prime: ${PUPRIME}\n2) Depositas al menos ${MIN_DEPOSIT} $ (el dinero queda a tu nombre)\n3) Me mandas aquí tu UID (solo el número) y una captura del depósito, y lo valido.\n\n¿Ya tienes cuenta en PU Prime?`
        case 'funded':
          return `🎯 MTM Funded (cuenta simulada): ${SITE}/mtmfunded\n\n¿Quieres que te explique las reglas del primer desafío?`
        case 'solucoes':
          return `🤖 MoreThanMoney Soluciones: ${SITE}/solucoes\n\n¿A qué se dedica tu negocio?`
        default:
          return `🌐 ${SITE}\n\n¿Qué te interesa más: aprender trading, la ruta del bróker o IA para negocios?`
      }
    },
  },
}

// Compatibilidade: o resto do código ainda lê as constantes em português.
export const BOTAO_SIM = GUIAO.pt.botaoSim
export const BOTAO_DEPOIS = GUIAO.pt.botaoDepois
export const BOTAO_SAIR = GUIAO.pt.botaoSair
export const MENU_ROTAS = GUIAO.pt.menu
export const TEXTO_MENU = GUIAO.pt.textoMenu
export const BOTAO_MENU = GUIAO.pt.botaoMenu
export const TEXTO_DEPOIS = GUIAO.pt.textoDepois
export const TEXTO_HUMANO = GUIAO.pt.textoHumano
export const AVISO_IA = GUIAO.pt.avisoIa

/** Áudio 1 — depois do «Sim». ~60–70 s, conta a história. A lista sai SEMPRE depois (`fluxo.ts`). */
export function audioAbertura(nome: string, l: Lingua = 'pt'): string {
  return GUIAO[l].audioAbertura(nome)
}
/** Áudio 2 — por rota. ~30 s cada. */
export function audioDaRota(rota: RotaWa, nome: string, l: Lingua = 'pt'): string {
  return GUIAO[l].audioDaRota(rota, nome)
}
/** O texto com link que segue o áudio da rota. Termina sempre numa pergunta. */
export function textoDaRota(rota: RotaWa, l: Lingua = 'pt'): string {
  return GUIAO[l].textoDaRota(rota)
}
/** O menu de rotas com «falar com uma pessoa» e «mudar de língua» no fim (lista do WhatsApp: até 10 linhas). */
export function menuComLingua(l: Lingua): Array<{ id: string; titulo: string; descricao?: string }> {
  return [...GUIAO[l].menu, { id: ID_HUMANO, ...GUIAO[l].linhaHumano }, { id: ID_MUDAR_LINGUA, ...GUIAO[l].linhaLingua }]
}

/** Lê a intenção numa resposta escrita (quando a pessoa não toca nos botões). Puro. */
export function lerIntencao(texto: string): RotaWa | 'sim' | 'depois' | 'sair' | 'humano' | null {
  const t = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
  if (/^(sair|parar|stop|cancelar|nao quero receber|stop messages|unsubscribe|ne plus recevoir|arreter|nicht mehr erhalten|abmelden|no quiero recibir|baja)\b/.test(t)) return 'sair'
  if (/^(sim|claro|pode|podes|manda|ok|bora|vamos|quero|s|yes|yeah|sure|send|oui|envoie|vas-y|ja|klar|schick|si|vale|mandalo|dale)\b/.test(t)) return 'sim'
  if (/^(agora nao|depois|mais tarde|nao|not now|later|no|pas maintenant|plus tard|non|jetzt nicht|spater|nein|ahora no|luego|mas tarde)\b/.test(t)) return 'depois'
  if (/\b(falar com (o )?ricardo|pessoa|humano|ligar|chamada|telefonar|talk to ricardo|human|call me|parler a ricardo|appel|mit ricardo sprechen|anruf|hablar con ricardo|llamada)\b/.test(t)) return 'humano'
  if (/\b(empresa|negocio|loja|restaurante|clinica|automat|ia para|site|app|business|company|entreprise|firma|unternehmen|ki fur)\b/.test(t)) return 'solucoes'
  if (/\b(corretora|pu ?prime|deposit|conta real|broker|uid)\b/.test(t)) return 'corretora'
  if (/\b(funded|simulad|desafio|prop)\b/.test(t)) return 'funded'
  if (/\b(aprender|curso|formacao|aulas|trading|forex|ouro|sinais|premium|membro|learn|course|apprendre|formation|lernen|kurs|curso|formacion)\b/.test(t)) return 'educacao'
  if (/\b(conhecer|o que e|curios|explica|what is|decouvrir|reinschauen|conocer)\b/.test(t)) return 'curioso'
  return null
}
