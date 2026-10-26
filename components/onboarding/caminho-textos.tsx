import type { ReactNode } from "react"

/**
 * Os textos do caminho MTM em seis línguas: PT, EN, ES, FR, DE e IT.
 *
 * Os números não moram aqui: chegam em `n` (preços, depósito, bónus) para que uma mudança em
 * `escada-precos` apareça em todas as línguas de uma vez. Os nomes de botões e separadores da app
 * («Grátis 3 dias», «Abrir conta», «Aulas») ficam em português em todas as línguas, porque é assim
 * que a pessoa os vai ver escritos no ecrã.
 */

export const LINGUAS = ["pt", "en", "es", "fr", "de", "it"] as const
export type Lingua = (typeof LINGUAS)[number]

export const NOME_LINGUA: Record<Lingua, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
}

export type Numeros = {
  premium1oMes: string
  premiumMensal: string
  depositoMinimoUsd: number
  bonusPct: number
}

type Cartao = { titulo: string; texto: string; para: string; cta: string }

export type Textos = {
  eyebrow: string
  titulo: string
  intro: string
  factos: [string, string, string]
  /** Título do vídeo curto com os cinco passos, por cima do progresso. */
  videoPassos: string
  progresso: (feitos: number, total: number) => string
  tudoFeito: string
  jaFiz: string
  desfazer: string
  p1: {
    titulo: string
    resumo: string
    resumoIos: string
    ios: string
    corpo: ReactNode
    itens: (n: Numeros) => string[]
    dica: string
    cta: string
  }
  p2: {
    titulo: string
    resumo: string
    corpo: string
    iphone: string
    android: string
    computador: string
    ctaApk: string
    ctaBrowser: string
    notaApk: string
    notaBrowser: string
    dica: string
  }
  p3: {
    titulo: string
    resumo: string
    ios: string
    intro: ReactNode
    notaVideo: string | null
    sub: { titulo: string; texto: (n: Numeros) => ReactNode }[]
    enganosTitulo: string
    enganos: string[]
    ctaAbrir: string
    ctaUid: string
    ctaTelegram: string
  }
  p4: { titulo: string; resumo: string; corpo: string; auto: Cartao; alertas: Cartao; dica: string }
  p5: {
    titulo: string
    resumo: string
    corpo: ReactNode
    academias: string[]
    ctaAcademias: string
    ctaChamada: string
    nota: string
  }
  duvidas: (instagram: ReactNode, email: ReactNode) => ReactNode
  aviso: string
}

const pt: Textos = {
  eyebrow: "Onboarding MTM",
  titulo: "Começar na MoreThanMoney",
  intro:
    "Cinco passos, por esta ordem. Numa tarde fica tudo montado: a tua conta, a app, a corretora, os sinais e as aulas. Se já fizeste algum, marca-o e passa ao seguinte.",
  factos: ["5 passos", "Uma tarde", "3 dias de Premium grátis"],
  videoPassos: "Os 5 passos num minuto",
  progresso: (f, t) => `${f} de ${t} passos feitos`,
  tudoFeito: "Está tudo montado.",
  jaFiz: "Já fiz este passo",
  desfazer: "Afinal ainda não fiz isto",
  p1: {
    titulo: "Cria a tua conta MTM",
    resumo: "3 dias de Premium sem pagar nada.",
    resumoIos: "Já entraste com a tua conta.",
    ios: "Estás na app com a tua conta, por isso este passo já está feito. Segue para o passo 3.",
    corpo: (
      <>
        Regista-te e escolhe <b>«Grátis 3 dias»</b>. Ficas com o Premium inteiro: sinais, aulas ao vivo,
        scanners e a comunidade.
      </>
    ),
    itens: (n) => [
      "O cartão fica registado, mas nos 3 dias não é cobrado nada.",
      `Se continuares, o 1.º mês fica a ${n.premium1oMes} e depois ${n.premiumMensal}.`,
      "Cancelas na tua conta quando quiseres, sem teres de falar com ninguém.",
    ],
    dica: "Usa o mesmo email aqui, na app e na corretora. É por ele que ligamos as três coisas à tua conta.",
    cta: "Criar conta com 3 dias grátis",
  },
  p2: {
    titulo: "Instala a app MTM System",
    resumo: "No telemóvel, no computador, ou nos dois.",
    corpo:
      "É a mesma conta em todo o lado. Começas no telemóvel e continuas no computador, e está tudo sincronizado.",
    iphone: "iPhone e iPad",
    android: "Android",
    computador: "Computador",
    ctaApk: "Descarregar APK",
    ctaBrowser: "Abrir no browser",
    notaApk: "Se o telemóvel pedir, autoriza instalar desta fonte.",
    notaBrowser: "Sem instalar nada.",
    dica: "Quando a app pedir para enviar notificações, aceita. É por aí que chegam os alertas e o aviso de que uma aula começou.",
  },
  p3: {
    titulo: "Abre a tua conta na corretora",
    resumo: "O passo que põe o «ganha enquanto aprendes» a funcionar.",
    ios: "A abertura de conta na corretora faz-se no nosso site, fora da app.",
    intro: (
      <>
        O <b>ganha enquanto aprendes</b> precisa de uma conta tua. É nela que os sinais e o MTM Auto trabalham
        enquanto tu estudas. O dinheiro fica em teu nome na PU Prime, a nossa corretora parceira, e a MTM nunca
        lhe toca.
      </>
    ),
    notaVideo: null,
    sub: [
      {
        titulo: "Abre o registo pelo nosso link",
        texto: () =>
          "Tem de ser por este link. Uma conta aberta diretamente no site da PU Prime não fica ligada à MTM, e aí não te conseguimos dar o acesso pela corretora.",
      },
      {
        titulo: "Cria o perfil e verifica a identidade",
        texto: () =>
          "Nome, email, telemóvel e país. Depois o Cartão de Cidadão ou passaporte e um comprovativo de morada recente. A verificação demora entre uns minutos e 24 horas, e sem ela não dá para depositar.",
      },
      {
        titulo: "Abre uma conta real (Live)",
        texto: () => (
          <>
            Tipo <b>Standard</b>, plataforma <b>MT5</b>, moeda <b>USD</b>. A corretora envia-te por email o número
            da conta, a palavra-passe e o servidor. Guarda esse email.
          </>
        ),
      },
      {
        titulo: "Faz o primeiro depósito",
        texto: (n) =>
          `A partir de ${n.depositoMinimoUsd} $ ficas com o bónus de ${n.bonusPct}% da PU Prime e com direito ao Premium sem mensalidade, enquanto mantiveres esse saldo. Deposita só dinheiro de que não precisas.`,
      },
      {
        titulo: "Guarda o número da conta na MTM",
        texto: () => (
          <>
            Na app, em <b>«Abrir conta»</b>, colas o teu UID (o número da conta PU Prime). Depois envia o mesmo UID
            ao nosso bot no Telegram: é lá que se valida o depósito e se ativa o Premium sem mensalidade.
          </>
        ),
      },
    ],
    enganosTitulo: "Os enganos que mais vemos",
    enganos: [
      "Registar fora do nosso link.",
      "Usar na corretora um email diferente do da MTM.",
      "Abrir uma conta Demo e depositar à espera de que seja real.",
      "Deixar a verificação a meio e não conseguir depositar.",
    ],
    ctaAbrir: "Abrir conta na PU Prime",
    ctaUid: "Guardar o meu UID",
    ctaTelegram: "Validar no Telegram",
  },
  p4: {
    titulo: "Liga os sinais à tua conta",
    resumo: "Cópia automática ou alertas para executares tu.",
    corpo: "Há duas maneiras de usar os sinais. Escolhe uma agora e mudas quando quiseres.",
    auto: {
      titulo: "MTM Auto",
      texto:
        "Os sinais copiam-se sozinhos para a tua conta MT5 ou MT4, com o risco que definires. Também é lá que vive o Tap to Trade, para aprovares cada sinal com um toque.",
      para: "Para quem está a começar ou não tem tempo para estar ao ecrã.",
      cta: "Configurar o MTM Auto",
    },
    alertas: {
      titulo: "Alertas MTM",
      texto: "Recebes cada sinal com entrada, stop e alvos, e abres tu a operação na corretora.",
      para: "Para quem já opera, ou quer aprender a executar à mão.",
      cta: "Abrir os alertas",
    },
    dica: "A cópia automática abre operações reais na tua conta. Começa com risco baixo (por exemplo 0,5% por operação) e afina-o na chamada de onboarding.",
  },
  p5: {
    titulo: "Entra nas aulas e marca a tua chamada",
    resumo: "A parte do «aprendes». E 30 minutos connosco para fechar tudo.",
    corpo: (
      <>
        Na app, o separador <b>«Aulas»</b> tem as academias, as salas ao vivo e as gravações. Se nunca operaste,
        começa pela sala <b>«Básicos de Trading»</b>.
      </>
    ),
    academias: [
      "Forex e metais, com o Ricardo Garcia",
      "Criptomoedas, com o Ruben Pereira",
      "Ações e ETF, Imobiliário, Social Media e UGC",
    ],
    ctaAcademias: "Ver as academias",
    ctaChamada: "Marcar a chamada de onboarding",
    nota: "Na chamada confirmamos a conta, a app, a corretora e o teu risco, e saímos com um plano de estudo para as primeiras semanas.",
  },
  duvidas: (ig, mail) => (
    <>
      Dúvidas pelo caminho? Escreve-nos no Instagram {ig} ou para {mail}.
    </>
  ),
  aviso:
    "Conteúdo educativo, não constitui consultoria financeira. Operar com produtos alavancados tem risco elevado de perda e os resultados passados não garantem resultados futuros. A automação executa ordens na tua conta segundo as regras que tu defines.",
}

const en: Textos = {
  eyebrow: "MTM onboarding",
  titulo: "Getting started with MoreThanMoney",
  intro:
    "Five steps, in this order. One afternoon is enough to set everything up: your account, the app, the broker, the signals and the classes. If you have already done one, tick it and move on.",
  factos: ["5 steps", "One afternoon", "3 days of Premium free"],
  videoPassos: "The 5 steps in one minute",
  progresso: (f, t) => `${f} of ${t} steps done`,
  tudoFeito: "You're all set.",
  jaFiz: "I've done this step",
  desfazer: "Actually, I haven't done this yet",
  p1: {
    titulo: "Create your MTM account",
    resumo: "3 days of Premium without paying anything.",
    resumoIos: "You're already signed in.",
    ios: "You're in the app with your account, so this step is done. Go on to step 3.",
    corpo: (
      <>
        Sign up and choose <b>«Grátis 3 dias»</b> (3 days free). You get the full Premium: signals, live classes,
        scanners and the community.
      </>
    ),
    itens: (n) => [
      "Your card is registered, but nothing is charged during the 3 days.",
      `If you stay, the first month is ${n.premium1oMes} and then ${n.premiumMensal.replace("/mês", "/month")}.`,
      "Cancel from your account whenever you like, without talking to anyone.",
    ],
    dica: "Use the same email here, in the app and at the broker. That is how we link all three to your account.",
    cta: "Create account with 3 days free",
  },
  p2: {
    titulo: "Install the MTM System app",
    resumo: "On your phone, your computer, or both.",
    corpo: "It's the same account everywhere. Start on your phone, carry on at your computer, and everything stays in sync.",
    iphone: "iPhone and iPad",
    android: "Android",
    computador: "Computer",
    ctaApk: "Download APK",
    ctaBrowser: "Open in browser",
    notaApk: "If your phone asks, allow installing from this source.",
    notaBrowser: "Nothing to install.",
    dica: "When the app asks to send notifications, say yes. That's how alerts and the 'class has started' notice reach you.",
  },
  p3: {
    titulo: "Open your broker account",
    resumo: "The step that makes «earn while you learn» work.",
    ios: "Broker accounts are opened on our website, outside the app.",
    intro: (
      <>
        <b>Earn while you learn</b> needs an account of your own. That's where the signals and MTM Auto work while
        you study. The money stays in your name at PU Prime, our partner broker, and MTM never touches it.
      </>
    ),
    notaVideo: null,
    sub: [
      {
        titulo: "Sign up through our link",
        texto: () =>
          "It has to be this link. An account opened directly on the PU Prime website isn't linked to MTM, and then we can't give you access through the broker.",
      },
      {
        titulo: "Create your profile and verify your identity",
        texto: () =>
          "Name, email, phone and country. Then your ID card or passport and a recent proof of address. Verification takes from a few minutes to 24 hours, and you can't deposit without it.",
      },
      {
        titulo: "Open a real (Live) account",
        texto: () => (
          <>
            Type <b>Standard</b>, platform <b>MT5</b>, currency <b>USD</b>. The broker emails you the account
            number, password and server. Keep that email.
          </>
        ),
      },
      {
        titulo: "Make your first deposit",
        texto: (n) =>
          `From $${n.depositoMinimoUsd} you get PU Prime's ${n.bonusPct}% bonus and Premium with no monthly fee, as long as you keep that balance. Only deposit money you don't need.`,
      },
      {
        titulo: "Save your account number at MTM",
        texto: () => (
          <>
            In the app, under <b>«Abrir conta»</b> (open account), paste your UID (your PU Prime account number).
            Then send the same UID to our Telegram bot: that's where the deposit is checked and Premium with no
            monthly fee is switched on.
          </>
        ),
      },
    ],
    enganosTitulo: "The mistakes we see most",
    enganos: [
      "Signing up outside our link.",
      "Using a different email at the broker than at MTM.",
      "Opening a Demo account and depositing as if it were real.",
      "Leaving verification half done and then being unable to deposit.",
    ],
    ctaAbrir: "Open a PU Prime account",
    ctaUid: "Save my UID",
    ctaTelegram: "Verify on Telegram",
  },
  p4: {
    titulo: "Connect the signals to your account",
    resumo: "Automatic copying, or alerts you execute yourself.",
    corpo: "There are two ways to use the signals. Pick one now; you can switch whenever you like.",
    auto: {
      titulo: "MTM Auto",
      texto:
        "Signals are copied automatically to your MT5 or MT4 account, with the risk you set. Tap to Trade lives there too, so you can approve each signal with a tap.",
      para: "For beginners, or anyone without time to sit at a screen.",
      cta: "Set up MTM Auto",
    },
    alertas: {
      titulo: "MTM Alerts",
      texto: "You get each signal with entry, stop and targets, and you open the trade at the broker yourself.",
      para: "For people who already trade, or want to learn to execute by hand.",
      cta: "Open the alerts",
    },
    dica: "Automatic copying opens real trades in your account. Start with low risk (for example 0.5% per trade) and fine-tune it in the onboarding call.",
  },
  p5: {
    titulo: "Join the classes and book your call",
    resumo: "The «learn» part. And 30 minutes with us to wrap everything up.",
    corpo: (
      <>
        In the app, the <b>«Aulas»</b> (classes) tab has the academies, the live rooms and the recordings. If you
        have never traded, start with the <b>«Básicos de Trading»</b> (trading basics) room.
      </>
    ),
    academias: [
      "Forex and metals, with Ricardo Garcia",
      "Crypto, with Ruben Pereira",
      "Stocks and ETFs, Real estate, Social media and UGC",
    ],
    ctaAcademias: "See the academies",
    ctaChamada: "Book the onboarding call",
    nota: "On the call we check your account, the app, the broker and your risk, and you leave with a study plan for the first weeks. Classes and the call are in Portuguese.",
  },
  duvidas: (ig, mail) => (
    <>
      Questions along the way? Message us on Instagram {ig} or write to {mail}.
    </>
  ),
  aviso:
    "Educational content, not financial advice. Trading leveraged products carries a high risk of loss and past results do not guarantee future results. Automation places orders in your account according to the rules you set.",
}

const fr: Textos = {
  eyebrow: "Onboarding MTM",
  titulo: "Bien démarrer chez MoreThanMoney",
  intro:
    "Cinq étapes, dans cet ordre. Un après-midi suffit pour tout mettre en place : ton compte, l'app, le courtier, les signaux et les cours. Si tu en as déjà fait une, coche-la et passe à la suivante.",
  factos: ["5 étapes", "Un après-midi", "3 jours de Premium offerts"],
  videoPassos: "Les 5 étapes en une minute",
  progresso: (f, t) => `${f} étape${f > 1 ? "s" : ""} sur ${t} terminée${f > 1 ? "s" : ""}`,
  tudoFeito: "Tout est en place.",
  jaFiz: "J'ai fait cette étape",
  desfazer: "En fait, je ne l'ai pas encore faite",
  p1: {
    titulo: "Crée ton compte MTM",
    resumo: "3 jours de Premium sans rien payer.",
    resumoIos: "Tu es déjà connecté.",
    ios: "Tu es dans l'app avec ton compte, cette étape est donc faite. Passe à l'étape 3.",
    corpo: (
      <>
        Inscris-toi et choisis <b>«Grátis 3 dias»</b> (3 jours gratuits). Tu as accès à tout le Premium : signaux,
        cours en direct, scanners et la communauté.
      </>
    ),
    itens: (n) => [
      "Ta carte est enregistrée, mais rien n'est prélevé pendant les 3 jours.",
      `Si tu continues, le 1er mois coûte ${n.premium1oMes}, puis ${n.premiumMensal.replace("/mês", "/mois")}.`,
      "Tu résilies depuis ton compte quand tu veux, sans devoir parler à qui que ce soit.",
    ],
    dica: "Utilise le même e-mail ici, dans l'app et chez le courtier. C'est grâce à lui que nous relions les trois à ton compte.",
    cta: "Créer mon compte avec 3 jours offerts",
  },
  p2: {
    titulo: "Installe l'app MTM System",
    resumo: "Sur ton téléphone, ton ordinateur, ou les deux.",
    corpo: "C'est le même compte partout. Tu commences sur le téléphone, tu continues sur l'ordinateur, et tout reste synchronisé.",
    iphone: "iPhone et iPad",
    android: "Android",
    computador: "Ordinateur",
    ctaApk: "Télécharger l'APK",
    ctaBrowser: "Ouvrir dans le navigateur",
    notaApk: "Si le téléphone le demande, autorise l'installation depuis cette source.",
    notaBrowser: "Rien à installer.",
    dica: "Quand l'app demande d'envoyer des notifications, accepte. C'est par là qu'arrivent les alertes et l'avis qu'un cours a commencé.",
  },
  p3: {
    titulo: "Ouvre ton compte chez le courtier",
    resumo: "L'étape qui fait fonctionner « gagne pendant que tu apprends ».",
    ios: "L'ouverture du compte chez le courtier se fait sur notre site, en dehors de l'app.",
    intro: (
      <>
        <b>Gagner pendant que tu apprends</b> demande un compte à ton nom. C'est là que les signaux et MTM Auto
        travaillent pendant que tu étudies. L'argent reste à ton nom chez PU Prime, notre courtier partenaire, et
        MTM n'y touche jamais.
      </>
    ),
    notaVideo: "La vidéo est en anglais. Les étapes ci-dessous disent la même chose, en français.",
    sub: [
      {
        titulo: "Inscris-toi par notre lien",
        texto: () =>
          "Ce doit être ce lien. Un compte ouvert directement sur le site de PU Prime n'est pas relié à MTM, et nous ne pouvons alors pas te donner l'accès via le courtier.",
      },
      {
        titulo: "Crée ton profil et vérifie ton identité",
        texto: () =>
          "Nom, e-mail, téléphone et pays. Puis ta carte d'identité ou ton passeport et un justificatif de domicile récent. La vérification prend de quelques minutes à 24 heures, et sans elle tu ne peux pas déposer.",
      },
      {
        titulo: "Ouvre un compte réel (Live)",
        texto: () => (
          <>
            Type <b>Standard</b>, plateforme <b>MT5</b>, devise <b>USD</b>. Le courtier t'envoie par e-mail le numéro
            du compte, le mot de passe et le serveur. Garde cet e-mail.
          </>
        ),
      },
      {
        titulo: "Fais ton premier dépôt",
        texto: (n) =>
          `À partir de ${n.depositoMinimoUsd} $, tu obtiens le bonus de ${n.bonusPct} % de PU Prime et le Premium sans abonnement, tant que tu gardes ce solde. Ne dépose que de l'argent dont tu n'as pas besoin.`,
      },
      {
        titulo: "Enregistre ton numéro de compte chez MTM",
        texto: () => (
          <>
            Dans l'app, sous <b>«Abrir conta»</b> (ouvrir un compte), colle ton UID (le numéro de ton compte PU
            Prime). Envoie ensuite le même UID à notre bot Telegram : c'est là que le dépôt est vérifié et que le
            Premium sans abonnement est activé.
          </>
        ),
      },
    ],
    enganosTitulo: "Les erreurs que nous voyons le plus",
    enganos: [
      "S'inscrire en dehors de notre lien.",
      "Utiliser chez le courtier un autre e-mail que celui de MTM.",
      "Ouvrir un compte Démo et déposer en pensant qu'il est réel.",
      "Laisser la vérification à moitié et ne plus pouvoir déposer.",
    ],
    ctaAbrir: "Ouvrir un compte PU Prime",
    ctaUid: "Enregistrer mon UID",
    ctaTelegram: "Valider sur Telegram",
  },
  p4: {
    titulo: "Relie les signaux à ton compte",
    resumo: "Copie automatique, ou alertes que tu exécutes toi-même.",
    corpo: "Il y a deux façons d'utiliser les signaux. Choisis-en une maintenant, tu pourras changer quand tu veux.",
    auto: {
      titulo: "MTM Auto",
      texto:
        "Les signaux sont copiés automatiquement sur ton compte MT5 ou MT4, avec le risque que tu définis. C'est aussi là que se trouve Tap to Trade, pour approuver chaque signal d'un geste.",
      para: "Pour les débutants, ou si tu n'as pas le temps de rester devant l'écran.",
      cta: "Configurer MTM Auto",
    },
    alertas: {
      titulo: "Alertes MTM",
      texto: "Tu reçois chaque signal avec l'entrée, le stop et les objectifs, et tu ouvres toi-même la position chez le courtier.",
      para: "Pour ceux qui tradent déjà, ou qui veulent apprendre à exécuter à la main.",
      cta: "Ouvrir les alertes",
    },
    dica: "La copie automatique ouvre des positions réelles sur ton compte. Commence avec un risque faible (par exemple 0,5 % par position) et ajuste-le pendant l'appel d'onboarding.",
  },
  p5: {
    titulo: "Rejoins les cours et réserve ton appel",
    resumo: "La partie « apprendre ». Et 30 minutes avec nous pour tout finaliser.",
    corpo: (
      <>
        Dans l'app, l'onglet <b>«Aulas»</b> (cours) regroupe les académies, les salles en direct et les
        enregistrements. Si tu n'as jamais tradé, commence par la salle <b>«Básicos de Trading»</b> (les bases du
        trading).
      </>
    ),
    academias: [
      "Forex et métaux, avec Ricardo Garcia",
      "Cryptomonnaies, avec Ruben Pereira",
      "Actions et ETF, Immobilier, Réseaux sociaux et UGC",
    ],
    ctaAcademias: "Voir les académies",
    ctaChamada: "Réserver l'appel d'onboarding",
    nota: "Pendant l'appel, nous vérifions ton compte, l'app, le courtier et ton risque, et tu repars avec un plan d'étude pour les premières semaines. Les cours et l'appel sont en portugais.",
  },
  duvidas: (ig, mail) => (
    <>
      Des questions en chemin ? Écris-nous sur Instagram {ig} ou à {mail}.
    </>
  ),
  aviso:
    "Contenu éducatif, ne constitue pas un conseil financier. Le trading de produits à effet de levier comporte un risque élevé de perte et les résultats passés ne garantissent pas les résultats futurs. L'automatisation exécute des ordres sur ton compte selon les règles que tu définis.",
}

const de: Textos = {
  eyebrow: "MTM Onboarding",
  titulo: "Dein Start bei MoreThanMoney",
  intro:
    "Fünf Schritte, in dieser Reihenfolge. An einem Nachmittag ist alles eingerichtet: dein Konto, die App, der Broker, die Signale und die Kurse. Wenn du einen Schritt schon erledigt hast, hak ihn ab und mach mit dem nächsten weiter.",
  factos: ["5 Schritte", "Ein Nachmittag", "3 Tage Premium gratis"],
  videoPassos: "Die 5 Schritte in einer Minute",
  progresso: (f, t) => `${f} von ${t} Schritten erledigt`,
  tudoFeito: "Alles ist eingerichtet.",
  jaFiz: "Diesen Schritt habe ich erledigt",
  desfazer: "Doch noch nicht erledigt",
  p1: {
    titulo: "Erstelle dein MTM-Konto",
    resumo: "3 Tage Premium, ohne etwas zu zahlen.",
    resumoIos: "Du bist bereits angemeldet.",
    ios: "Du bist mit deinem Konto in der App, dieser Schritt ist also erledigt. Weiter mit Schritt 3.",
    corpo: (
      <>
        Registriere dich und wähle <b>«Grátis 3 dias»</b> (3 Tage gratis). Du bekommst das komplette Premium:
        Signale, Live-Kurse, Scanner und die Community.
      </>
    ),
    itens: (n) => [
      "Deine Karte wird hinterlegt, aber in den 3 Tagen wird nichts abgebucht.",
      `Wenn du bleibst, kostet der 1. Monat ${n.premium1oMes} und danach ${n.premiumMensal.replace("/mês", "/Monat")}.`,
      "Du kündigst jederzeit in deinem Konto, ohne mit jemandem sprechen zu müssen.",
    ],
    dica: "Verwende hier, in der App und beim Broker dieselbe E-Mail. Darüber verbinden wir alle drei mit deinem Konto.",
    cta: "Konto mit 3 Tagen gratis erstellen",
  },
  p2: {
    titulo: "Installiere die App MTM System",
    resumo: "Auf dem Handy, am Computer oder auf beiden.",
    corpo: "Es ist überall dasselbe Konto. Du fängst am Handy an, machst am Computer weiter, und alles bleibt synchron.",
    iphone: "iPhone und iPad",
    android: "Android",
    computador: "Computer",
    ctaApk: "APK herunterladen",
    ctaBrowser: "Im Browser öffnen",
    notaApk: "Wenn das Handy fragt, erlaube die Installation aus dieser Quelle.",
    notaBrowser: "Keine Installation nötig.",
    dica: "Wenn die App Benachrichtigungen senden möchte, erlaube es. So erreichen dich die Alerts und der Hinweis, dass ein Kurs begonnen hat.",
  },
  p3: {
    titulo: "Eröffne dein Konto beim Broker",
    resumo: "Der Schritt, der „Verdienen, während du lernst“ möglich macht.",
    ios: "Das Brokerkonto eröffnest du auf unserer Website, außerhalb der App.",
    intro: (
      <>
        <b>Verdienen, während du lernst</b> braucht ein eigenes Konto. Dort arbeiten die Signale und MTM Auto,
        während du lernst. Das Geld bleibt auf deinen Namen bei PU Prime, unserem Partnerbroker, und MTM rührt es
        nie an.
      </>
    ),
    notaVideo: "Das Video ist auf Englisch. Die Schritte unten sagen dasselbe, auf Deutsch.",
    sub: [
      {
        titulo: "Registriere dich über unseren Link",
        texto: () =>
          "Es muss dieser Link sein. Ein Konto, das direkt auf der Website von PU Prime eröffnet wird, ist nicht mit MTM verbunden, und dann können wir dir den Zugang über den Broker nicht geben.",
      },
      {
        titulo: "Profil anlegen und Identität bestätigen",
        texto: () =>
          "Name, E-Mail, Telefon und Land. Dann Personalausweis oder Reisepass und ein aktueller Adressnachweis. Die Prüfung dauert ein paar Minuten bis 24 Stunden, und ohne sie kannst du nicht einzahlen.",
      },
      {
        titulo: "Eröffne ein echtes Konto (Live)",
        texto: () => (
          <>
            Typ <b>Standard</b>, Plattform <b>MT5</b>, Währung <b>USD</b>. Der Broker schickt dir Kontonummer,
            Passwort und Server per E-Mail. Heb diese E-Mail auf.
          </>
        ),
      },
      {
        titulo: "Mach deine erste Einzahlung",
        texto: (n) =>
          `Ab ${n.depositoMinimoUsd} $ bekommst du den ${n.bonusPct}-%-Bonus von PU Prime und Premium ohne Monatsgebühr, solange du diesen Kontostand hältst. Zahl nur Geld ein, das du nicht brauchst.`,
      },
      {
        titulo: "Hinterlege deine Kontonummer bei MTM",
        texto: () => (
          <>
            In der App fügst du unter <b>«Abrir conta»</b> (Konto eröffnen) deine UID ein (deine PU-Prime-
            Kontonummer). Schick dieselbe UID dann an unseren Telegram-Bot: Dort wird die Einzahlung geprüft und
            Premium ohne Monatsgebühr freigeschaltet.
          </>
        ),
      },
    ],
    enganosTitulo: "Die häufigsten Fehler",
    enganos: [
      "Registrierung außerhalb unseres Links.",
      "Beim Broker eine andere E-Mail als bei MTM verwenden.",
      "Ein Demokonto eröffnen und einzahlen, als wäre es echt.",
      "Die Prüfung halb fertig lassen und dann nicht einzahlen können.",
    ],
    ctaAbrir: "PU-Prime-Konto eröffnen",
    ctaUid: "Meine UID speichern",
    ctaTelegram: "Auf Telegram bestätigen",
  },
  p4: {
    titulo: "Verbinde die Signale mit deinem Konto",
    resumo: "Automatisches Kopieren oder Alerts, die du selbst ausführst.",
    corpo: "Es gibt zwei Wege, die Signale zu nutzen. Wähl jetzt einen, wechseln kannst du jederzeit.",
    auto: {
      titulo: "MTM Auto",
      texto:
        "Die Signale werden automatisch auf dein MT5- oder MT4-Konto kopiert, mit dem Risiko, das du festlegst. Dort findest du auch Tap to Trade, um jedes Signal mit einem Tippen freizugeben.",
      para: "Für Einsteiger oder alle, die keine Zeit haben, vor dem Bildschirm zu sitzen.",
      cta: "MTM Auto einrichten",
    },
    alertas: {
      titulo: "MTM Alerts",
      texto: "Du bekommst jedes Signal mit Einstieg, Stop und Zielen und eröffnest die Position selbst beim Broker.",
      para: "Für alle, die schon traden oder das manuelle Ausführen lernen wollen.",
      cta: "Alerts öffnen",
    },
    dica: "Das automatische Kopieren eröffnet echte Positionen auf deinem Konto. Fang mit niedrigem Risiko an (zum Beispiel 0,5 % pro Trade) und stell es im Onboarding-Gespräch fein ein.",
  },
  p5: {
    titulo: "Nimm an den Kursen teil und buche dein Gespräch",
    resumo: "Der Teil „Lernen“. Und 30 Minuten mit uns, um alles abzuschließen.",
    corpo: (
      <>
        In der App findest du im Tab <b>«Aulas»</b> (Kurse) die Akademien, die Live-Räume und die Aufzeichnungen.
        Wenn du noch nie getradet hast, fang mit dem Raum <b>«Básicos de Trading»</b> (Trading-Grundlagen) an.
      </>
    ),
    academias: [
      "Forex und Metalle, mit Ricardo Garcia",
      "Kryptowährungen, mit Ruben Pereira",
      "Aktien und ETFs, Immobilien, Social Media und UGC",
    ],
    ctaAcademias: "Akademien ansehen",
    ctaChamada: "Onboarding-Gespräch buchen",
    nota: "Im Gespräch prüfen wir dein Konto, die App, den Broker und dein Risiko, und du gehst mit einem Lernplan für die ersten Wochen. Kurse und Gespräch sind auf Portugiesisch.",
  },
  duvidas: (ig, mail) => (
    <>
      Fragen unterwegs? Schreib uns auf Instagram {ig} oder an {mail}.
    </>
  ),
  aviso:
    "Bildungsinhalt, keine Finanzberatung. Der Handel mit gehebelten Produkten birgt ein hohes Verlustrisiko, und vergangene Ergebnisse garantieren keine zukünftigen. Die Automatisierung führt Orders auf deinem Konto nach den Regeln aus, die du festlegst.",
}

const it: Textos = {
  eyebrow: "Onboarding MTM",
  titulo: "Iniziare con MoreThanMoney",
  intro:
    "Cinque passi, in quest'ordine. In un pomeriggio è tutto pronto: il tuo account, l'app, il broker, i segnali e le lezioni. Se ne hai già fatto uno, segnalo e passa al successivo.",
  factos: ["5 passi", "Un pomeriggio", "3 giorni di Premium gratis"],
  videoPassos: "I 5 passi in un minuto",
  progresso: (f, t) => `${f} di ${t} passi completati`,
  tudoFeito: "È tutto pronto.",
  jaFiz: "Ho fatto questo passo",
  desfazer: "In realtà non l'ho ancora fatto",
  p1: {
    titulo: "Crea il tuo account MTM",
    resumo: "3 giorni di Premium senza pagare nulla.",
    resumoIos: "Hai già effettuato l'accesso.",
    ios: "Sei nell'app con il tuo account, quindi questo passo è fatto. Vai al passo 3.",
    corpo: (
      <>
        Registrati e scegli <b>«Grátis 3 dias»</b> (3 giorni gratis). Hai tutto il Premium: segnali, lezioni dal
        vivo, scanner e la community.
      </>
    ),
    itens: (n) => [
      "La carta viene registrata, ma nei 3 giorni non viene addebitato nulla.",
      `Se continui, il 1° mese costa ${n.premium1oMes} e poi ${n.premiumMensal.replace("/mês", "/mese")}.`,
      "Disdici dal tuo account quando vuoi, senza dover parlare con nessuno.",
    ],
    dica: "Usa la stessa email qui, nell'app e presso il broker. È così che colleghiamo tutte e tre le cose al tuo account.",
    cta: "Crea l'account con 3 giorni gratis",
  },
  p2: {
    titulo: "Installa l'app MTM System",
    resumo: "Sul telefono, sul computer, o su entrambi.",
    corpo: "È lo stesso account ovunque. Inizi sul telefono, continui sul computer, ed è tutto sincronizzato.",
    iphone: "iPhone e iPad",
    android: "Android",
    computador: "Computer",
    ctaApk: "Scarica l'APK",
    ctaBrowser: "Apri nel browser",
    notaApk: "Se il telefono lo chiede, consenti l'installazione da questa fonte.",
    notaBrowser: "Niente da installare.",
    dica: "Quando l'app chiede di inviare notifiche, accetta. È da lì che arrivano gli alert e l'avviso che una lezione è iniziata.",
  },
  p3: {
    titulo: "Apri il tuo conto presso il broker",
    resumo: "Il passo che fa funzionare «guadagna mentre impari».",
    ios: "L'apertura del conto presso il broker si fa sul nostro sito, fuori dall'app.",
    intro: (
      <>
        <b>Guadagnare mentre impari</b> richiede un conto tuo. È lì che i segnali e MTM Auto lavorano mentre tu
        studi. Il denaro resta a tuo nome presso PU Prime, il nostro broker partner, e MTM non lo tocca mai.
      </>
    ),
    notaVideo: "Il video è in inglese. I passi qui sotto dicono la stessa cosa, in italiano.",
    sub: [
      {
        titulo: "Registrati dal nostro link",
        texto: () =>
          "Deve essere questo link. Un conto aperto direttamente sul sito di PU Prime non è collegato a MTM, e in quel caso non possiamo darti l'accesso tramite il broker.",
      },
      {
        titulo: "Crea il profilo e verifica l'identità",
        texto: () =>
          "Nome, email, telefono e paese. Poi carta d'identità o passaporto e una prova di residenza recente. La verifica richiede da pochi minuti a 24 ore, e senza di essa non puoi depositare.",
      },
      {
        titulo: "Apri un conto reale (Live)",
        texto: () => (
          <>
            Tipo <b>Standard</b>, piattaforma <b>MT5</b>, valuta <b>USD</b>. Il broker ti invia via email il numero
            del conto, la password e il server. Conserva quella email.
          </>
        ),
      },
      {
        titulo: "Fai il primo deposito",
        texto: (n) =>
          `Da ${n.depositoMinimoUsd} $ ottieni il bonus del ${n.bonusPct}% di PU Prime e il Premium senza canone mensile, finché mantieni quel saldo. Deposita solo denaro di cui non hai bisogno.`,
      },
      {
        titulo: "Salva il numero del conto su MTM",
        texto: () => (
          <>
            Nell'app, in <b>«Abrir conta»</b> (apri conto), incolla il tuo UID (il numero del conto PU Prime). Poi
            invia lo stesso UID al nostro bot su Telegram: è lì che si verifica il deposito e si attiva il Premium
            senza canone mensile.
          </>
        ),
      },
    ],
    enganosTitulo: "Gli errori che vediamo più spesso",
    enganos: [
      "Registrarsi fuori dal nostro link.",
      "Usare presso il broker un'email diversa da quella di MTM.",
      "Aprire un conto Demo e depositare pensando che sia reale.",
      "Lasciare la verifica a metà e non riuscire a depositare.",
    ],
    ctaAbrir: "Apri un conto PU Prime",
    ctaUid: "Salva il mio UID",
    ctaTelegram: "Verifica su Telegram",
  },
  p4: {
    titulo: "Collega i segnali al tuo conto",
    resumo: "Copia automatica, oppure alert che esegui tu.",
    corpo: "Ci sono due modi di usare i segnali. Scegline uno ora, puoi cambiare quando vuoi.",
    auto: {
      titulo: "MTM Auto",
      texto:
        "I segnali si copiano da soli sul tuo conto MT5 o MT4, con il rischio che imposti tu. Lì trovi anche Tap to Trade, per approvare ogni segnale con un tocco.",
      para: "Per chi inizia o non ha tempo di stare davanti allo schermo.",
      cta: "Configura MTM Auto",
    },
    alertas: {
      titulo: "Alert MTM",
      texto: "Ricevi ogni segnale con entrata, stop e obiettivi, e apri tu l'operazione presso il broker.",
      para: "Per chi fa già trading, o vuole imparare a eseguire a mano.",
      cta: "Apri gli alert",
    },
    dica: "La copia automatica apre operazioni reali sul tuo conto. Inizia con un rischio basso (per esempio 0,5% per operazione) e regolalo durante la chiamata di onboarding.",
  },
  p5: {
    titulo: "Entra nelle lezioni e prenota la tua chiamata",
    resumo: "La parte «impari». E 30 minuti con noi per chiudere tutto.",
    corpo: (
      <>
        Nell'app, la scheda <b>«Aulas»</b> (lezioni) contiene le accademie, le sale dal vivo e le registrazioni. Se
        non hai mai fatto trading, inizia dalla sala <b>«Básicos de Trading»</b> (le basi del trading).
      </>
    ),
    academias: [
      "Forex e metalli, con Ricardo Garcia",
      "Criptovalute, con Ruben Pereira",
      "Azioni ed ETF, Immobiliare, Social media e UGC",
    ],
    ctaAcademias: "Vedi le accademie",
    ctaChamada: "Prenota la chiamata di onboarding",
    nota: "Nella chiamata controlliamo il tuo account, l'app, il broker e il tuo rischio, e ne esci con un piano di studio per le prime settimane. Le lezioni e la chiamata sono in portoghese.",
  },
  duvidas: (ig, mail) => (
    <>
      Domande lungo il percorso? Scrivici su Instagram {ig} o a {mail}.
    </>
  ),
  aviso:
    "Contenuto educativo, non costituisce consulenza finanziaria. Operare con prodotti a leva comporta un rischio elevato di perdita e i risultati passati non garantiscono risultati futuri. L'automazione esegue ordini sul tuo conto secondo le regole che definisci tu.",
}

const es: Textos = {
  eyebrow: "Onboarding MTM",
  titulo: "Empieza en MoreThanMoney",
  intro:
    "Cinco pasos, en este orden. En una tarde lo tienes todo listo: tu cuenta, la app, el bróker, las señales y las clases. Si ya has hecho alguno, márcalo y pasa al siguiente.",
  factos: ["5 pasos", "Una tarde", "3 días de Premium gratis"],
  videoPassos: "Los 5 pasos en un minuto",
  progresso: (f, t) => `${f} de ${t} pasos hechos`,
  tudoFeito: "Ya está todo listo.",
  jaFiz: "Ya he hecho este paso",
  desfazer: "En realidad todavía no lo he hecho",
  p1: {
    titulo: "Crea tu cuenta MTM",
    resumo: "3 días de Premium sin pagar nada.",
    resumoIos: "Ya has entrado con tu cuenta.",
    ios: "Estás en la app con tu cuenta, así que este paso ya está hecho. Sigue con el paso 3.",
    corpo: (
      <>
        Regístrate y elige <b>«Grátis 3 dias»</b> (3 días gratis). Tienes el Premium completo: señales, clases en
        directo, escáneres y la comunidad.
      </>
    ),
    itens: (n) => [
      "La tarjeta queda registrada, pero durante los 3 días no se cobra nada.",
      `Si sigues, el 1.er mes cuesta ${n.premium1oMes} y después ${n.premiumMensal.replace("/mês", "/mes")}.`,
      "Cancelas desde tu cuenta cuando quieras, sin tener que hablar con nadie.",
    ],
    dica: "Usa el mismo email aquí, en la app y en el bróker. Es con él como unimos las tres cosas a tu cuenta.",
    cta: "Crear cuenta con 3 días gratis",
  },
  p2: {
    titulo: "Instala la app MTM System",
    resumo: "En el móvil, en el ordenador, o en los dos.",
    corpo: "Es la misma cuenta en todas partes. Empiezas en el móvil, sigues en el ordenador y todo queda sincronizado.",
    iphone: "iPhone y iPad",
    android: "Android",
    computador: "Ordenador",
    ctaApk: "Descargar APK",
    ctaBrowser: "Abrir en el navegador",
    notaApk: "Si el móvil lo pide, permite instalar desde esta fuente.",
    notaBrowser: "Sin instalar nada.",
    dica: "Cuando la app pida enviar notificaciones, acepta. Por ahí llegan las alertas y el aviso de que ha empezado una clase.",
  },
  p3: {
    titulo: "Abre tu cuenta en el bróker",
    resumo: "El paso que hace funcionar el «gana mientras aprendes».",
    ios: "La cuenta en el bróker se abre en nuestra web, fuera de la app.",
    intro: (
      <>
        <b>Ganar mientras aprendes</b> necesita una cuenta tuya. Es en ella donde las señales y MTM Auto trabajan
        mientras tú estudias. El dinero está a tu nombre en PU Prime, nuestro bróker colaborador, y MTM nunca lo toca.
      </>
    ),
    notaVideo: "El vídeo está en inglés. Los pasos de abajo dicen lo mismo, en español.",
    sub: [
      {
        titulo: "Regístrate con nuestro enlace",
        texto: () =>
          "Tiene que ser con este enlace. Una cuenta abierta directamente en la web de PU Prime no queda vinculada a MTM, y entonces no podemos darte el acceso a través del bróker.",
      },
      {
        titulo: "Crea el perfil y verifica tu identidad",
        texto: () =>
          "Nombre, email, teléfono y país. Después el DNI o pasaporte y un justificante de domicilio reciente. La verificación tarda entre unos minutos y 24 horas, y sin ella no puedes depositar.",
      },
      {
        titulo: "Abre una cuenta real (Live)",
        texto: () => (
          <>
            Tipo <b>Standard</b>, plataforma <b>MT5</b>, divisa <b>USD</b>. El bróker te envía por email el número
            de cuenta, la contraseña y el servidor. Guarda ese email.
          </>
        ),
      },
      {
        titulo: "Haz tu primer depósito",
        texto: (n) =>
          `A partir de ${n.depositoMinimoUsd} $ tienes el bono del ${n.bonusPct}% de PU Prime y el Premium sin cuota mensual, mientras mantengas ese saldo. Deposita solo dinero que no necesites.`,
      },
      {
        titulo: "Guarda el número de cuenta en MTM",
        texto: () => (
          <>
            En la app, en <b>«Abrir conta»</b> (abrir cuenta), pega tu UID (el número de tu cuenta PU Prime). Después
            envía el mismo UID a nuestro bot de Telegram: allí se valida el depósito y se activa el Premium sin cuota
            mensual.
          </>
        ),
      },
    ],
    enganosTitulo: "Los errores que más vemos",
    enganos: [
      "Registrarse fuera de nuestro enlace.",
      "Usar en el bróker un email distinto al de MTM.",
      "Abrir una cuenta Demo y depositar pensando que es real.",
      "Dejar la verificación a medias y no poder depositar.",
    ],
    ctaAbrir: "Abrir cuenta en PU Prime",
    ctaUid: "Guardar mi UID",
    ctaTelegram: "Validar en Telegram",
  },
  p4: {
    titulo: "Conecta las señales a tu cuenta",
    resumo: "Copia automática o alertas para que operes tú.",
    corpo: "Hay dos maneras de usar las señales. Elige una ahora y cambia cuando quieras.",
    auto: {
      titulo: "MTM Auto",
      texto:
        "Las señales se copian solas en tu cuenta MT5 o MT4, con el riesgo que definas. Ahí está también Tap to Trade, para aprobar cada señal con un toque.",
      para: "Para quien empieza o no tiene tiempo de estar delante de la pantalla.",
      cta: "Configurar MTM Auto",
    },
    alertas: {
      titulo: "Alertas MTM",
      texto: "Recibes cada señal con entrada, stop y objetivos, y abres tú la operación en el bróker.",
      para: "Para quien ya opera, o quiere aprender a ejecutar a mano.",
      cta: "Abrir las alertas",
    },
    dica: "La copia automática abre operaciones reales en tu cuenta. Empieza con un riesgo bajo (por ejemplo 0,5% por operación) y ajústalo en la llamada de onboarding.",
  },
  p5: {
    titulo: "Entra en las clases y reserva tu llamada",
    resumo: "La parte del «aprendes». Y 30 minutos con nosotros para cerrarlo todo.",
    corpo: (
      <>
        En la app, la pestaña <b>«Aulas»</b> (clases) tiene las academias, las salas en directo y las grabaciones. Si
        nunca has operado, empieza por la sala <b>«Básicos de Trading»</b> (lo básico del trading).
      </>
    ),
    academias: [
      "Forex y metales, con Ricardo Garcia",
      "Criptomonedas, con Ruben Pereira",
      "Acciones y ETF, Inmobiliario, Redes sociales y UGC",
    ],
    ctaAcademias: "Ver las academias",
    ctaChamada: "Reservar la llamada de onboarding",
    nota: "En la llamada revisamos tu cuenta, la app, el bróker y tu riesgo, y sales con un plan de estudio para las primeras semanas. Las clases y la llamada son en portugués.",
  },
  duvidas: (ig, mail) => (
    <>
      ¿Dudas por el camino? Escríbenos en Instagram {ig} o a {mail}.
    </>
  ),
  aviso:
    "Contenido educativo, no constituye asesoramiento financiero. Operar con productos apalancados conlleva un riesgo elevado de pérdida y los resultados pasados no garantizan resultados futuros. La automatización ejecuta órdenes en tu cuenta según las reglas que tú defines.",
}

export const TEXTOS: Record<Lingua, Textos> = { pt, en, es, fr, de, it }
