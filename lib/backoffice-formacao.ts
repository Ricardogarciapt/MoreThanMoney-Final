/**
 * ACADEMIA DE VENDAS MTM — o curso de formação da equipa (funcionários e IBs), em PT e EN.
 *
 * Pedido do Ricardo a 23/11/2026: «prepara curso de formação do nosso backoffice e de setters,
 * closers e prospectors e como usar corretamente para escalar e vender o que temos na
 * MoreThanMoney e /solucoes… com animação, ilustrações, print screens, infografia e mind maps…
 * narra com a minha voz e publica no YouTube em Não listado, numa playlist própria… insere os
 * cursos e o material na área de material do backoffice». E logo a seguir: «Este curso é pt e inglês».
 *
 * FONTE ÚNICA. Esta lista alimenta três coisas ao mesmo tempo, e é por isso que vive num ficheiro só:
 *  1. a página `/backoffice/material/formacao` (aulas, mind maps, passos, quiz);
 *  2. o render dos vídeos (`video/formacao/render.mjs` lê as cenas e as falas daqui, via
 *     `node video/formacao/exportar.mjs`, e narra cada aula com a voz clone do Ricardo);
 *  3. o manual em PDF por função (`video/formacao/manual.mjs`).
 * Mudar uma frase aqui muda a página e, no próximo render, o vídeo e o manual.
 *
 * REGRAS (guardadas em `lib/__tests__/backoffice-formacao.check.ts`):
 *  · nenhum preço nem percentagem escritos à mão: os preços lêem-se em Materiais, que os vai buscar
 *    ao sistema (`lib/escada-precos.ts`); as comissões vêem-se no extracto;
 *  · nenhuma promessa de ganhos; nenhum concorrente nem pessoa de outra empresa pelo nome;
 *  · o MTM Funded é conta SIMULADA (Patrocínio de Desempenho), nunca «prop firm»;
 *  · não se nomeia a plataforma onde vivem os cursos (o vídeo fica no YouTube, não listado);
 *  · PT e EN têm de ter as mesmas cenas — uma aula a meio traduzida não se publica.
 */

export type Lingua = 'pt' | 'en'
export type T = Record<Lingua, string>

/** Ecrãs do back-office que as aulas mostram. Cada um tem captura real em `public/formacao/ecras/<id>.png` quando existir. */
export type EcraBackoffice =
  | 'hoje'
  | 'pipeline'
  | 'quadro'
  | 'ficha'
  | 'whatsapp'
  | 'tarefas'
  | 'chamadas'
  | 'material'
  | 'extracto'
  | 'equipa'
  | 'ib'

export type Cena =
  | { tipo: 'capa'; titulo: T; sub: T; fala: T }
  | { tipo: 'lista'; titulo: T; itens: T[]; fala: T }
  | { tipo: 'mapa'; centro: T; ramos: Array<{ nome: T; folhas: T[] }>; fala: T }
  | { tipo: 'fluxo'; titulo: T; passos: T[]; fala: T }
  | { tipo: 'ecra'; ecra: EcraBackoffice; titulo: T; destaques: T[]; fala: T }
  | { tipo: 'guiao'; titulo: T; quando: T; texto: T; fala: T }
  | { tipo: 'regra'; titulo: T; itens: T[]; fala: T }
  | { tipo: 'fim'; titulo: T; cta: T; fala: T }

export type PapelAula = 'todos' | 'prospector' | 'setter' | 'closer' | 'afiliado'

export interface Pergunta {
  pergunta: T
  opcoes: T[]
  /** Índice da opção certa. */
  certa: number
  porque: T
}

export interface Aula {
  slug: string
  numero: number
  papel: PapelAula
  titulo: T
  objetivo: T
  /** O que a pessoa faz depois de ver — a tarefa da aula. */
  tarefa: T
  cenas: Cena[]
  quiz: Pergunta[]
  /** Id do vídeo no YouTube (não listado), por língua. Preenche-se depois do upload. */
  youtube: Partial<Record<Lingua, string>>
}

export const CURSO = {
  slug: 'academia-vendas-mtm',
  titulo: { pt: 'Academia de Vendas MTM', en: 'MTM Sales Academy' } as T,
  sub: {
    pt: 'O back-office, os papéis e os guiões para converter com as nossas ferramentas.',
    en: 'The back office, the roles and the scripts to convert with our own tools.',
  } as T,
  /** Playlists no YouTube (não listadas), por língua. */
  playlist: {} as Partial<Record<Lingua, string>>,
  aviso: {
    pt: 'Formação interna. Conteúdo educativo, não constitui consultoria financeira. Resultados não garantidos.',
    en: 'Internal training. Educational content, not financial advice. Results are not guaranteed.',
  } as T,
}

const t = (pt: string, en: string): T => ({ pt, en })

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

const aula1: Aula = {
  slug: '01-a-casa-e-o-que-vendemos',
  numero: 1,
  papel: 'todos',
  titulo: t('A casa e o que vendemos', 'The house and what we sell'),
  objetivo: t(
    'Saber explicar em dois minutos o que a MoreThanMoney é, os três caminhos de cliente e as Soluções para negócios.',
    'Explain in two minutes what MoreThanMoney is, the three customer paths and the Solutions for businesses.',
  ),
  tarefa: t(
    'Abre morethanmoney.pt/caminho e morethanmoney.pt/solucoes no telemóvel e percorre as três portas e a demo do dia.',
    'Open morethanmoney.pt/caminho and morethanmoney.pt/solucoes on your phone and go through the three doors and the demo of the day.',
  ),
  cenas: [
    {
      tipo: 'capa',
      titulo: t('Academia de Vendas MTM', 'MTM Sales Academy'),
      sub: t('Aula 1 · A casa e o que vendemos', 'Lesson 1 · The house and what we sell'),
      fala: t(
        'Olá, equipa. Sou o Ricardo e esta é a Academia de Vendas da MoreThanMoney. Antes de falares com alguém, tens de saber exatamente o que a casa é e o que vendemos. É isso que vamos ver nesta primeira aula.',
        "Hi team. I'm Ricardo and this is the MoreThanMoney Sales Academy. Before you talk to anyone, you need to know exactly what this house is and what we sell. That's what this first lesson is about.",
      ),
    },
    {
      tipo: 'lista',
      titulo: t('O que a MoreThanMoney é', 'What MoreThanMoney is'),
      itens: [
        t('Educação financeira e trading com método e gestão de risco', 'Financial education and trading with method and risk management'),
        t('Ferramentas próprias: scanners, WebTrader, app MTM System', 'Our own tools: scanners, WebTrader, the MTM System app'),
        t('Comunidade, sessões ao vivo e acompanhamento', 'Community, live sessions and support'),
        t('Soluções para negócios: sites, apps e agentes de IA', 'Solutions for businesses: websites, apps and AI agents'),
      ],
      fala: t(
        'A MoreThanMoney é educação financeira com método. Ensinamos trading com gestão de risco, com ferramentas que nós próprios construímos: os scanners, o WebTrader e a app MTM System. Há comunidade e sessões ao vivo. E há um segundo braço, as Soluções, onde fazemos sites, apps e agentes de inteligência artificial para pequenos negócios.',
        'MoreThanMoney is financial education with a method. We teach trading with risk management, using tools we built ourselves: the scanners, the WebTrader and the MTM System app. There is a community and live sessions. And there is a second arm, Solutions, where we build websites, apps and AI agents for small businesses.',
      ),
    },
    {
      tipo: 'mapa',
      centro: t('Os 3 caminhos', 'The 3 paths'),
      ramos: [
        {
          nome: t('Aprender', 'Learn'),
          folhas: [t('O Primeiro Passo (grátis)', 'The First Step (free)'), t('O Método Frio + 7 dias', 'The Cold Method + 7 days'), t('Premium (trial)', 'Premium (trial)'), t('Elite', 'Elite')],
        },
        {
          nome: t('Ferramentas', 'Tools'),
          folhas: [t('GoldKiller 30 dias grátis', 'GoldKiller 30 days free'), t('Membro', 'Member'), t('Desafio MTM Funded (simulado)', 'MTM Funded challenge (simulated)'), t('Premium', 'Premium')],
        },
        {
          nome: t('Capital', 'Capital'),
          folhas: [t('Como funciona', 'How it works'), t('Rota Corretora PU Prime', 'Broker Route PU Prime'), t('Desafio MTM Funded', 'MTM Funded challenge'), t('Elite', 'Elite')],
        },
      ],
      fala: t(
        'Cada cliente entra por um de três caminhos, e o caminho depende do perfil. Quem quer aprender começa no guia grátis O Primeiro Passo e sobe para o Método Frio, o Premium e a Elite. Quem quer ferramentas começa com o GoldKiller trinta dias grátis e sobe para Membro e Premium. Quem tem capital vai para a Rota Corretora, uma conta própria na PU Prime. Quem hesita tem sempre o Desafio MTM Funded, em conta simulada. Os preços nunca se decoram: lês sempre em Materiais, no back-office.',
        'Every customer comes in through one of three paths, and the path depends on the profile. Those who want to learn start with the free guide The First Step and move up to the Cold Method, Premium and Elite. Those who want tools start with GoldKiller thirty days free and move up to Member and Premium. Those with capital go to the Broker Route, their own account at PU Prime. Anyone who hesitates always has the MTM Funded challenge, on a simulated account. Never memorise prices: always read them in Materials, in the back office.',
      ),
    },
    {
      tipo: 'lista',
      titulo: t('Soluções para negócios', 'Solutions for businesses'),
      itens: [
        t('Página com app e agenda própria', 'A page with its own app and booking'),
        t('Agentes de IA que respondem, marcam e vendem', 'AI agents that reply, book and sell'),
        t('Scanners em licença e white label', 'Licensed scanners and white label'),
        t('Cursos narrados para a equipa do cliente', 'Narrated courses for the client’s team'),
      ],
      fala: t(
        'Em morethanmoney.pt barra soluções vendemos ao dono de um negócio local o que lhe rouba horas: página com app e agenda, agentes de IA que respondem e marcam, scanners em licença e cursos narrados como este. O cliente vê a demo do dia, carrega em receber protótipo e cai na nossa agenda e no CRM.',
        'At morethanmoney.pt slash solucoes we sell local business owners what eats their hours: a page with an app and booking, AI agents that reply and book, licensed scanners and narrated courses like this one. The client sees the demo of the day, taps get a prototype, and lands in our calendar and CRM.',
      ),
    },
    {
      tipo: 'regra',
      titulo: t('O que nunca se diz', 'What we never say'),
      itens: [
        t('Prometer ganhos, rendimento fixo ou lucro certo', 'Promise gains, fixed income or certain profit'),
        t('Inventar números ou preços de cabeça', 'Make up numbers or prices from memory'),
        t('Nomear concorrentes ou pessoas de outras empresas', 'Name competitors or people from other companies'),
        t('Chamar «prop firm» ao MTM Funded: é conta simulada', 'Call MTM Funded a “prop firm”: it is a simulated account'),
        t('Mandar link de pagamento a quem está no iPhone', 'Send a payment link to someone on an iPhone'),
        t('Dizer que se ganha por recrutar', 'Say that you earn by recruiting'),
      ],
      fala: t(
        'E agora as regras que valem para toda a gente. Nunca prometes ganhos. Nunca inventas números: a prova mede-se em pips e tem origem. Nunca nomeias concorrentes. O MTM Funded é conta simulada, não é prop firm. A quem está no iPhone, a subscrição faz-se dentro da app. E aqui não se ganha por recrutar: ganha-se quando um cliente real fica, porque lhe serve.',
        "Now the rules that apply to everyone. You never promise gains. You never make up numbers: our proof is measured in pips and has a source. You never name competitors. MTM Funded is a simulated account, not a prop firm. Anyone on an iPhone subscribes inside the app. And here nobody earns by recruiting: you earn when a real customer stays, because it serves them.",
      ),
    },
    {
      tipo: 'fim',
      titulo: t('Tarefa da aula', 'Lesson task'),
      cta: t('Abre /caminho e /solucoes e percorre as portas', 'Open /caminho and /solucoes and walk through the doors'),
      fala: t(
        'A tua tarefa: abre o caminho e as soluções no telemóvel e percorre tudo como se fosses cliente. Na próxima aula entramos no back-office.',
        "Your task: open the paths page and the solutions page on your phone and go through everything as if you were a customer. In the next lesson we go into the back office.",
      ),
    },
  ],
  quiz: [
    {
      pergunta: t('Onde vês o preço certo de cada degrau?', 'Where do you see the right price for each step?'),
      opcoes: [t('De memória', 'From memory'), t('Em Materiais, no back-office', 'In Materials, in the back office'), t('Numa mensagem antiga', 'In an old message')],
      certa: 1,
      porque: t('Os preços vêm do sistema no momento em que abres a página.', 'Prices come from the system the moment you open the page.'),
    },
    {
      pergunta: t('O MTM Funded é…', 'MTM Funded is…'),
      opcoes: [t('Uma prop firm', 'A prop firm'), t('Conta simulada com Patrocínio de Desempenho', 'A simulated account with Performance Sponsorship'), t('Uma conta real financiada por nós', 'A real account funded by us')],
      certa: 1,
      porque: t('Nunca se custodia nem se executa dinheiro real de clientes.', 'We never hold or trade real client money.'),
    },
  ],
  youtube: {},
}

const aula2: Aula = {
  slug: '02-o-back-office-por-dentro',
  numero: 2,
  papel: 'todos',
  titulo: t('O back-office por dentro', 'Inside the back office'),
  objetivo: t(
    'Saber onde está cada coisa: Hoje, Pipeline, ficha do contacto, Tarefas, Chamadas, Materiais e Extracto.',
    'Know where everything is: Today, Pipeline, contact record, Tasks, Calls, Materials and Statement.',
  ),
  tarefa: t(
    'Entra em backoffice.morethanmoney.pt, abre o Hoje, pega num lead da bolsa e escreve a primeira nota na ficha.',
    'Log in to backoffice.morethanmoney.pt, open Today, take a lead from the pool and write the first note on the record.',
  ),
  cenas: [
    {
      tipo: 'capa',
      titulo: t('O back-office por dentro', 'Inside the back office'),
      sub: t('Aula 2 · Onde está cada coisa', 'Lesson 2 · Where everything is'),
      fala: t(
        'Nesta aula vais conhecer o back-office por dentro. É aqui que trabalhas todos os dias, e cada ecrã tem uma função clara.',
        'In this lesson you get to know the back office from the inside. This is where you work every day, and every screen has a clear job.',
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'hoje',
      titulo: t('Hoje — o teu dia', 'Today — your day'),
      destaques: [
        t('Só o que é para hoje, por urgência', 'Only what is due today, by urgency'),
        t('Quem respondeu ontem passa à frente', 'Whoever replied yesterday comes first'),
        t('Rascunho escrito: lês, corriges, envias', 'Draft ready: you read, fix and send'),
      ],
      fala: t(
        'Começas sempre no Hoje. Aqui só aparece o que é para hoje, ordenado por urgência e não por prazo: quem respondeu ontem passa à frente de quem nunca respondeu. Cada tarefa já traz um rascunho. O teu trabalho é ler, corrigir e enviar tu. O sistema nunca envia nada sozinho.',
        'You always start on Today. It only shows what is due today, sorted by urgency, not by deadline: someone who replied yesterday comes before someone who never replied. Each task comes with a draft. Your job is to read it, fix it and send it yourself. The system never sends anything on its own.',
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'pipeline',
      titulo: t('Pipeline — os teus negócios', 'Pipeline — your deals'),
      destaques: [
        t('Lead → Contactado → Qualificado → Reunião marcada → Apresentado → Ganho', 'Lead → Contacted → Qualified → Meeting booked → Presented → Won'),
        t('Cada linha traz o passo seguinte escrito', 'Each row shows the next step'),
        t('Bolsa: leads sem dono — quem quer trabalhar, pega', 'Pool: unowned leads — whoever wants to work, takes one'),
      ],
      fala: t(
        'O Pipeline mostra os negócios em que participas, por estado: lead, contactado, qualificado, reunião marcada, apresentado, ganho ou perdido. Cada linha diz-te o passo seguinte. Na bolsa estão os leads sem dono: carregas em pegar e ficam teus. O papel não se escolhe, é o momento do lead que decide.',
        "The Pipeline shows the deals you're part of, by stage: lead, contacted, qualified, meeting booked, presented, won or lost. Each row tells you the next step. The pool holds unowned leads: tap take and they're yours. You don't pick the role; the lead's stage decides it.",
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'ficha',
      titulo: t('A ficha 360° do contacto', 'The 360° contact record'),
      destaques: [
        t('Histórico, tarefas, agenda e conversas num sítio', 'History, tasks, calendar and chats in one place'),
        t('Consentimento sempre à vista', 'Consent always visible'),
        t('A nota é o que sabes da pessoa', 'The note is what you know about the person'),
      ],
      fala: t(
        'Carrega no nome e abres a ficha do contacto. Está lá tudo: o negócio, o histórico, as tarefas, a agenda, o WhatsApp, o Telegram e o Instagram. O consentimento aparece sempre, porque contactar sem ele é a linha que não se passa. Na nota escreves o que sabes da pessoa: a dor, o tempo, a experiência.',
        "Tap the name and the contact record opens. Everything is there: the deal, the history, tasks, calendar, WhatsApp, Telegram and Instagram. Consent is always shown, because contacting without it is the line we never cross. In the note you write what you know about the person: their pain, their time, their experience.",
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'whatsapp',
      titulo: t('Primeira mensagem de WhatsApp', 'First WhatsApp message'),
      destaques: [
        t('Leads com telefone já têm a mensagem escrita', 'Leads with a phone already have the message written'),
        t('Um toque abre o WhatsApp com o texto', 'One tap opens WhatsApp with the text'),
        t('«Marquei enviada» passa a contactado', '“Marked as sent” moves it to contacted'),
      ],
      fala: t(
        'No Pipeline tens também a fila de WhatsApp. Cada lead com telefone já tem a primeira mensagem escrita. Um toque abre o WhatsApp com o texto, envias, e carregas em marquei enviada. O negócio passa a contactado e fica registado no histórico.',
        'In the Pipeline there is also the WhatsApp queue. Every lead with a phone already has the first message written. One tap opens WhatsApp with the text, you send it and tap marked as sent. The deal moves to contacted and it is logged in the history.',
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'chamadas',
      titulo: t('Chamadas no Google Meet', 'Calls on Google Meet'),
      destaques: [
        t('Apresentações, onboardings e follow-ups', 'Presentations, onboardings and follow-ups'),
        t('Resumo por IA no fim', 'AI summary at the end'),
        t('Guardar na ficha ou criar tarefa', 'Save to the record or create a task'),
      ],
      fala: t(
        'As chamadas fazem-se sempre no Google Meet. No fim, o back-office faz o resumo da conversa e tu decides: guardas na ficha ou crias a tarefa seguinte.',
        'Calls always happen on Google Meet. At the end, the back office summarises the conversation and you decide: save it to the record or create the next task.',
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'material',
      titulo: t('Materiais', 'Materials'),
      destaques: [
        t('O teu código e o teu link de registo', 'Your code and your sign-up link'),
        t('O kit do teu papel: guiões e objeções', 'Your role kit: scripts and objections'),
        t('A oferta com os preços do sistema', 'The offer with system prices'),
        t('Gerador de peças com o tom da casa', 'Content generator in the house tone'),
      ],
      fala: t(
        'Em Materiais tens o teu código de afiliado e o teu link de registo: quem se regista por ele fica ligado a ti. Tens o kit do teu papel, com guiões e objeções, a oferta com os preços lidos do sistema, um gerador de textos com o tom da casa, e esta Academia.',
        "In Materials you have your affiliate code and your sign-up link: anyone who signs up through it is linked to you. You have your role kit, with scripts and objections, the offer with prices read from the system, a text generator in the house tone, and this Academy.",
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'extracto',
      titulo: t('O meu extracto', 'My statement'),
      destaques: [
        t('O que ganhaste e de onde veio', 'What you earned and where it came from'),
        t('A venda nasce do pagamento confirmado', 'A sale is born from a confirmed payment'),
        t('Devoluções aparecem a negativo', 'Refunds show as negative'),
      ],
      fala: t(
        'Por fim, o extracto. Mostra o que ganhaste, de onde veio e o que falta receber. Atenção: marcar ganho no pipeline não cria comissão. A venda nasce do pagamento confirmado, e se um cliente devolver, aparece a negativo. É por isso que o teu link e o registo certo no pipeline são tão importantes.',
        "Finally, the statement. It shows what you earned, where it came from and what is still to be paid. Note: marking a deal as won does not create a commission. The sale is born from a confirmed payment, and if a customer gets a refund, it shows as negative. That is why your link and the right pipeline record matter so much.",
      ),
    },
    {
      tipo: 'fim',
      titulo: t('Tarefa da aula', 'Lesson task'),
      cta: t('Abre o Hoje, pega num lead e escreve a primeira nota', 'Open Today, take a lead and write the first note'),
      fala: t(
        'Tarefa: entra no back-office, abre o Hoje, pega num lead da bolsa e escreve a primeira nota na ficha. A partir da próxima aula, cada uma é sobre um papel.',
        'Task: log in to the back office, open Today, take a lead from the pool and write the first note on the record. From the next lesson on, each lesson is about one role.',
      ),
    },
  ],
  quiz: [
    {
      pergunta: t('Marcar «ganho» no pipeline cria a comissão?', 'Does marking “won” in the pipeline create the commission?'),
      opcoes: [t('Sim, logo', 'Yes, right away'), t('Não: nasce do pagamento confirmado', 'No: it comes from the confirmed payment')],
      certa: 1,
      porque: t('O dinheiro só existe quando o pagamento entra.', 'Money only exists when the payment comes in.'),
    },
    {
      pergunta: t('Os rascunhos do Hoje são enviados…', 'Drafts on Today are sent…'),
      opcoes: [t('Automaticamente', 'Automatically'), t('Por ti, depois de leres e corrigires', 'By you, after reading and fixing them')],
      certa: 1,
      porque: t('A IA redige, a pessoa envia.', 'AI drafts, the person sends.'),
    },
  ],
  youtube: {},
}

const aula3: Aula = {
  slug: '03-prospector',
  numero: 3,
  papel: 'prospector',
  titulo: t('Prospector: abrir conversas certas', 'Prospector: opening the right conversations'),
  objetivo: t(
    'Encontrar pessoas com a dor certa, abrir conversa com uma pergunta e passar ao setter qualificadas.',
    'Find people with the right pain, open with one question and hand them to the setter qualified.',
  ),
  tarefa: t(
    'Abre dez conversas hoje com o guião de primeiro contacto e regista no pipeline quem responder com uma dor clara.',
    'Open ten conversations today with the first-contact script and log in the pipeline anyone who replies with a clear pain.',
  ),
  cenas: [
    {
      tipo: 'capa',
      titulo: t('Prospector', 'Prospector'),
      sub: t('Aula 3 · Abrir conversas certas', 'Lesson 3 · Opening the right conversations'),
      fala: t(
        'O prospector abre conversas. Não vendes nada: descobres quem tem a dor e quer falar, e passas essa pessoa ao setter.',
        "The prospector opens conversations. You don't sell anything: you find who has the pain and wants to talk, and hand that person to the setter.",
      ),
    },
    {
      tipo: 'fluxo',
      titulo: t('O trabalho do prospector', 'The prospector’s job'),
      passos: [
        t('Onde procurar', 'Where to look'),
        t('Primeiro contacto: 1 pergunta', 'First contact: 1 question'),
        t('Registar o lead com a dor', 'Log the lead with the pain'),
        t('Passar ao setter', 'Hand over to the setter'),
      ],
      fala: t(
        'São quatro passos. Primeiro, onde procurar: quem comenta nos nossos posts e reels, grupos de trading e de finanças pessoais, quem fala de mensalidades que paga sem retorno. Segundo, o primeiro contacto: curto, pessoal, com uma pergunta só, sem links. Terceiro, se responder com interesse, registas o lead no pipeline com a dor que disse. Quarto, passas ao setter.',
        "There are four steps. First, where to look: people who comment on our posts and reels, trading and personal finance groups, people talking about subscriptions they pay with no return. Second, the first contact: short, personal, one question only, no links. Third, if they reply with interest, you log the lead in the pipeline with the pain they mentioned. Fourth, you hand over to the setter.",
      ),
    },
    {
      tipo: 'guiao',
      titulo: t('Primeiro contacto (a frio)', 'First contact (cold)'),
      quando: t('Alguém que fala de trading num grupo e nunca falou connosco', 'Someone talking about trading in a group who never spoke to us'),
      texto: t(
        'Olá {nome}, vi o que escreveste sobre {tema}. Também passei por isso. Posso perguntar-te uma coisa: hoje operas por conta própria ou segues alguém?',
        'Hi {name}, I saw what you wrote about {topic}. I’ve been there too. Can I ask you something: do you trade on your own today, or do you follow someone?',
      ),
      fala: t(
        'Este é o guião de primeiro contacto. Repara: mostra que leste o que a pessoa escreveu, cria ligação, e termina com uma pergunta fácil de responder. Não há link, não há preço, não há escada.',
        "This is the first-contact script. Notice: it shows you read what the person wrote, it builds a connection, and it ends with an easy question. No link, no price, no ladder.",
      ),
    },
    {
      tipo: 'guiao',
      titulo: t('Resposta a um comentário', 'Reply to a comment'),
      quando: t('Comentou um post nosso com uma palavra-chave', 'They commented on our post with a keyword'),
      texto: t(
        'Olá {nome}! Vi o teu comentário 🙌 Mandei-te por privado o material — diz-me se chegou. Já fazes trading ou estás a começar?',
        'Hi {name}! Saw your comment 🙌 I sent you the material in a DM — let me know if it arrived. Do you already trade or are you just starting?',
      ),
      fala: t(
        'Quando alguém comenta uma palavra-chave, o sistema já lhe manda o material. A tua mensagem confirma e faz a pergunta que nos diz onde a pessoa está.',
        "When someone comments a keyword, the system already sends them the material. Your message confirms it and asks the question that tells us where the person is.",
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'pipeline',
      titulo: t('Registar e passar', 'Log and hand over'),
      destaques: [
        t('Novo negócio com a dor na nota', 'New deal with the pain in the note'),
        t('Move para «contactado»', 'Move to “contacted”'),
        t('O setter entra no lugar vago', 'The setter takes the empty seat'),
      ],
      fala: t(
        'No pipeline crias o negócio, escreves a dor na nota e moves para contactado. Depois dizes à pessoa que o setter lhe vai mandar mensagem. A tua coluna fica registada, e é isso que conta para as comissões quando houver venda.',
        "In the pipeline you create the deal, write the pain in the note and move it to contacted. Then you tell the person that the setter will message them. Your column is recorded, and that is what counts for commissions when there is a sale.",
      ),
    },
    {
      tipo: 'fim',
      titulo: t('Tarefa da aula', 'Lesson task'),
      cta: t('10 conversas hoje, com uma pergunta cada', '10 conversations today, one question each'),
      fala: t(
        'Tarefa: abre dez conversas hoje com o guião de primeiro contacto e regista quem responder com uma dor clara. Constância ganha a talento.',
        'Task: open ten conversations today with the first-contact script and log anyone who replies with a clear pain. Consistency beats talent.',
      ),
    },
  ],
  quiz: [
    {
      pergunta: t('No primeiro contacto mandas…', 'In the first contact you send…'),
      opcoes: [t('O link de registo e os preços', 'The sign-up link and prices'), t('Uma mensagem curta com uma pergunta', 'A short message with one question')],
      certa: 1,
      porque: t('Primeiro abre-se a conversa; a oferta vem muito depois.', 'First you open the conversation; the offer comes much later.'),
    },
  ],
  youtube: {},
}

const aula4: Aula = {
  slug: '04-setter',
  numero: 4,
  papel: 'setter',
  titulo: t('Setter: qualificar e marcar', 'Setter: qualify and book'),
  objetivo: t(
    'Fazer a triagem com uma pergunta de cada vez e marcar a chamada de Onboarding com duas horas concretas.',
    'Qualify with one question at a time and book the Onboarding call with two concrete times.',
  ),
  tarefa: t(
    'Pega em três negócios em «contactado», faz a pergunta do custo fixo e marca pelo menos uma chamada.',
    'Take three deals in “contacted”, ask the fixed-cost question and book at least one call.',
  ),
  cenas: [
    {
      tipo: 'capa',
      titulo: t('Setter', 'Setter'),
      sub: t('Aula 4 · Qualificar e marcar', 'Lesson 4 · Qualify and book'),
      fala: t(
        'O setter faz a triagem e marca a chamada. Não fechas venda: qualificas e agendas.',
        "The setter qualifies and books the call. You don't close sales: you qualify and schedule.",
      ),
    },
    {
      tipo: 'mapa',
      centro: t('Qualificar', 'Qualify'),
      ramos: [
        { nome: t('Onde está', 'Where they are'), folhas: [t('Nunca operou', 'Never traded'), t('Opera sozinho', 'Trades alone'), t('Vem de uma rede', 'Comes from a network')] },
        { nome: t('Custo fixo', 'Fixed cost'), folhas: [t('Quanto paga por mês', 'How much they pay monthly'), t('O que recebeu em troca', 'What they got in return')] },
        { nome: t('Tempo', 'Time'), folhas: [t('Horas por semana', 'Hours per week')] },
        { nome: t('Capital', 'Capital'), folhas: [t('Tem: chamada', 'Has it: call'), t('Não tem: MTM Funded', 'Doesn’t: MTM Funded')] },
      ],
      fala: t(
        'Qualificar é descobrir quatro coisas, uma pergunta de cada vez. Onde a pessoa está: nunca operou, opera sozinha, ou vem de uma rede. O custo fixo: quanto paga hoje por mês e o que recebeu em troca. O tempo que tem por semana. E o capital: se tem, marca a chamada; se não tem, vai para o MTM Funded, em conta simulada.',
        "Qualifying means finding out four things, one question at a time. Where the person is: never traded, trades alone, or comes from a network. The fixed cost: how much they pay each month and what they got in return. The time they have per week. And capital: if they have it, book the call; if not, they go to MTM Funded, on a simulated account.",
      ),
    },
    {
      tipo: 'guiao',
      titulo: t('A pergunta do custo fixo', 'The fixed-cost question'),
      quando: t('Depois de saberes onde está', 'Once you know where they are'),
      texto: t(
        'Pergunta rápida: quanto pagas hoje por mês entre subscrições, cursos ou mensalidades ligadas a isto? E disso, o que é que te ficou de concreto — método, ferramentas, resultados que consegues repetir?',
        'Quick question: how much do you pay each month today in subscriptions, courses or fees related to this? And of that, what did you actually keep — a method, tools, results you can repeat?',
      ),
      fala: t(
        'Esta é a pergunta mais importante do setter. Faz a pessoa pôr lado a lado o que paga e o que recebe. Não critiques ninguém: deixa a resposta falar.',
        "This is the setter's most important question. It makes the person put what they pay next to what they get. Don't criticise anyone: let the answer do the talking.",
      ),
    },
    {
      tipo: 'guiao',
      titulo: t('Propor a chamada', 'Propose the call'),
      quando: t('Já sabes a dor e o tempo', 'You know the pain and the time'),
      texto: t(
        'Pelo que me dizes, faz sentido mostrarmos-te o sistema numa chamada curta: vês o WebTrader, como filtramos as entradas e como se gere o risco. Tenho {hora1} ou {hora2} — qual te dá mais jeito?',
        'From what you tell me, it makes sense to show you the system in a short call: you’ll see the WebTrader, how we filter entries and how risk is managed. I have {time1} or {time2} — which works better?',
      ),
      fala: t(
        'Quando propões a chamada, dás sempre duas horas concretas, nunca quando puderes. E dizes o que vai acontecer na chamada, para não parecer uma venda às cegas. O link de agenda está em Materiais.',
        "When you propose the call, always give two concrete times, never whenever you can. And say what will happen on the call, so it doesn't feel like a blind sales pitch. The booking link is in Materials.",
      ),
    },
    {
      tipo: 'fluxo',
      titulo: t('Depois de marcar', 'After booking'),
      passos: [
        t('Mover para «reunião marcada»', 'Move to “meeting booked”'),
        t('Lembrete na véspera', 'Reminder the day before'),
        t('Faltou? Remarcar com 2 horas', 'No-show? Rebook with 2 times'),
        t('Closer entra no negócio', 'Closer joins the deal'),
      ],
      fala: t(
        'Depois de marcar: moves o negócio para reunião marcada, mandas o lembrete na véspera, e se a pessoa faltar, remarcas com duas horas novas. O closer entra no negócio e tu continuas na tua coluna.',
        "After booking: move the deal to meeting booked, send the reminder the day before, and if the person doesn't show, rebook with two new times. The closer joins the deal and you stay in your column.",
      ),
    },
    {
      tipo: 'lista',
      titulo: t('Objeções do setter', 'Setter objections'),
      itens: [
        t('«Não tenho tempo» → quanto tens, de verdade? Mostramos na chamada', '“No time” → how much do you really have? We show it on the call'),
        t('«Manda-me a informação» → sem saber o teu caso, nada te servia', '“Just send info” → without knowing your case, nothing would fit'),
        t('«Não tenho dinheiro» → MTM Funded, conta simulada', '“No money” → MTM Funded, simulated account'),
      ],
      fala: t(
        'Três objeções que vais ouvir todos os dias. Não tenho tempo: pergunta quanto tem de verdade e diz que na chamada mostras como fica na rotina. Manda-me só a informação: sem saber o caso, mandavas tudo e nada servia. Não tenho dinheiro: então começa sem arriscar, no MTM Funded.',
        "Three objections you'll hear every day. I don't have time: ask how much they really have and say you'll show on the call how it fits their routine. Just send me the info: without knowing their case you'd send everything and nothing would fit. I have no money: then start without risk, on MTM Funded.",
      ),
    },
    {
      tipo: 'fim',
      titulo: t('Tarefa da aula', 'Lesson task'),
      cta: t('3 negócios, a pergunta do custo fixo, 1 chamada', '3 deals, the fixed-cost question, 1 call'),
      fala: t(
        'Tarefa: pega em três negócios em contactado, faz a pergunta do custo fixo e marca pelo menos uma chamada.',
        'Task: take three deals in contacted, ask the fixed-cost question and book at least one call.',
      ),
    },
  ],
  quiz: [
    {
      pergunta: t('Ao propor a chamada dizes…', 'When proposing the call you say…'),
      opcoes: [t('«Quando puderes»', '“Whenever you can”'), t('Duas horas concretas', 'Two concrete times')],
      certa: 1,
      porque: t('Uma escolha fácil marca; uma pergunta aberta arrasta.', 'An easy choice books; an open question drags.'),
    },
  ],
  youtube: {},
}

const aula5: Aula = {
  slug: '05-closer',
  numero: 5,
  papel: 'closer',
  titulo: t('Closer: apresentar e fechar', 'Closer: present and close'),
  objetivo: t(
    'Conduzir a chamada em cinco tempos e propor só o caminho que serve, sem pressão nem promessas.',
    'Run the call in five beats and offer only the path that fits, with no pressure and no promises.',
  ),
  tarefa: t(
    'Revê a ficha de cada chamada marcada esta semana antes de entrares e manda o follow-up no mesmo dia.',
    'Review the record of every call booked this week before you join and send the follow-up the same day.',
  ),
  cenas: [
    {
      tipo: 'capa',
      titulo: t('Closer', 'Closer'),
      sub: t('Aula 5 · Apresentar e fechar', 'Lesson 5 · Present and close'),
      fala: t(
        'O closer faz a apresentação e o fecho assistido. Os dois destinos principais são o Premium e a Rota Corretora.',
        'The closer runs the presentation and the assisted close. The two main destinations are Premium and the Broker Route.',
      ),
    },
    {
      tipo: 'fluxo',
      titulo: t('A chamada em 5 tempos', 'The call in 5 beats'),
      passos: [
        t('Agenda da chamada', 'Call agenda'),
        t('Diagnóstico', 'Diagnosis'),
        t('Demonstração', 'Demo'),
        t('Proposta: 1 caminho', 'Offer: 1 path'),
        t('Fecho e silêncio', 'Close and silence'),
      ],
      fala: t(
        'A chamada tem cinco tempos. Um: a agenda, dizes o que vais mostrar e que no fim é ele que decide. Dois: o diagnóstico, confirmas a dor, o custo fixo, o tempo e a experiência que o setter apurou. Três: a demonstração no WebTrader e na app, a análise, os filtros e a gestão de risco. Quatro: a proposta, só do caminho que serve. Cinco: perguntas qual faz sentido e calas-te.',
        "The call has five beats. One: the agenda, you say what you'll show and that at the end they decide. Two: the diagnosis, you confirm the pain, fixed cost, time and experience the setter found. Three: the demo on the WebTrader and the app, the analysis, filters and risk management. Four: the offer, only of the path that fits. Five: you ask which makes sense and you stay quiet.",
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'ficha',
      titulo: t('Antes de entrar: a ficha', 'Before joining: the record'),
      destaques: [
        t('Nota do setter: dor, tempo, experiência', 'Setter’s note: pain, time, experience'),
        t('Funil e caminho do perfil', 'Funnel and profile path'),
        t('Consentimento e canal', 'Consent and channel'),
      ],
      fala: t(
        'Nunca entras numa chamada às cegas. Abres a ficha, lês a nota do setter e o caminho do perfil. Assim a pessoa sente que foi ouvida e não tem de repetir a história.',
        'You never join a call blind. Open the record, read the setter’s note and the profile path. That way the person feels heard and does not have to repeat their story.',
      ),
    },
    {
      tipo: 'guiao',
      titulo: t('Abrir a chamada', 'Opening the call'),
      quando: t('Primeiro minuto', 'First minute'),
      texto: t(
        'Obrigado por apareceres, {nome}. A ideia é esta: percebo onde estás, mostro-te o sistema a funcionar e no fim dizes-me se faz sentido. Se não fizer, digo-to eu. Combinado?',
        'Thanks for joining, {name}. Here’s the idea: I understand where you are, I show you the system working, and at the end you tell me if it makes sense. If it doesn’t, I’ll tell you myself. Deal?',
      ),
      fala: t(
        'O primeiro minuto define tudo. Este guião tira a pressão: a pessoa sabe que pode dizer não, e é por isso que fica à vontade para dizer sim.',
        'The first minute sets everything. This script removes the pressure: the person knows they can say no, and that is exactly why they feel free to say yes.',
      ),
    },
    {
      tipo: 'mapa',
      centro: t('Que caminho propor', 'Which path to offer'),
      ramos: [
        { nome: t('Quer tudo já', 'Wants it all now'), folhas: [t('Premium (trial)', 'Premium (trial)')] },
        { nome: t('Prefere capital seu', 'Prefers own capital'), folhas: [t('Rota Corretora PU Prime', 'Broker Route PU Prime')] },
        { nome: t('Quer ferramentas', 'Wants tools'), folhas: [t('Membro', 'Member')] },
        { nome: t('Sem capital', 'No capital'), folhas: [t('MTM Funded (simulado)', 'MTM Funded (simulated)')] },
      ],
      fala: t(
        'Na proposta, um caminho só. Quem quer tudo já, Premium. Quem prefere pôr o dinheiro numa conta sua, Rota Corretora na PU Prime. Quem quer só as ferramentas, Membro. Sem capital, MTM Funded. Os preços lês em Materiais no momento da chamada.',
        'In the offer, one path only. Wants it all now: Premium. Prefers to put money into their own account: the Broker Route at PU Prime. Only wants the tools: Member. No capital: MTM Funded. Read the prices in Materials at the time of the call.',
      ),
    },
    {
      tipo: 'lista',
      titulo: t('Objeções do closer', 'Closer objections'),
      itens: [
        t('«É caro» → comparado com o que pagas hoje?', '“It’s expensive” → compared to what you pay today?'),
        t('«Já perdi dinheiro» → por isso começamos pelo risco', '“I lost money before” → that’s why we start with risk'),
        t('«Funciona mesmo?» → processo real e prova em pips', '“Does it work?” → real process and proof in pips'),
        t('«Vou pensar» → o que precisas de ver para decidir?', '“I’ll think about it” → what do you need to see to decide?'),
      ],
      fala: t(
        'As objeções do closer. É caro: comparado com quê? Põe ao lado do que paga hoje. Já perdi dinheiro: quase sempre foi falta de método, por isso começamos por proteger capital. Funciona mesmo: não prometemos lucro, mostramos processo real e a prova em pips. Vou pensar: o que precisas de ver para decidir? Urgência, só se for verdadeira.',
        "Closer objections. It's expensive: compared to what? Put it next to what they pay today. I've lost money before: it was almost always lack of method, which is why we start by protecting capital. Does it really work: we don't promise profit, we show a real process and proof in pips. I'll think about it: what do you need to see to decide? Urgency only if it's real.",
      ),
    },
    {
      tipo: 'guiao',
      titulo: t('Fechou — próximo passo', 'Closed — next step'),
      quando: t('Disse que sim', 'They said yes'),
      texto: t(
        'Bem-vindo, {nome} 👊 No iPhone descarregas a app e subscreves lá dentro; em Android ou web é em morethanmoney.pt/upgrade. Se for a rota da corretora, abres conta em morethanmoney.pt/abrir-conta e mandas-me o UID para validarmos.',
        'Welcome, {name} 👊 On iPhone you download the app and subscribe inside it; on Android or web it’s at morethanmoney.pt/upgrade. For the broker route, open your account at morethanmoney.pt/abrir-conta and send me the UID so we can validate it.',
      ),
      fala: t(
        'Quando diz que sim, o próximo passo é claro e depende do aparelho. No iPhone, subscreve dentro da app. Em Android ou web, na página de planos. Na rota da corretora, abre conta e manda o UID. E não fechou na chamada? Mandas o follow-up no mesmo dia e moves o negócio.',
        "When they say yes, the next step is clear and depends on the device. On iPhone, they subscribe inside the app. On Android or web, on the plans page. On the broker route, they open an account and send the UID. Didn't close on the call? Send the follow-up the same day and move the deal.",
      ),
    },
    {
      tipo: 'fim',
      titulo: t('Tarefa da aula', 'Lesson task'),
      cta: t('Ficha antes, follow-up no mesmo dia', 'Record before, follow-up the same day'),
      fala: t(
        'Tarefa: antes de cada chamada desta semana, lê a ficha. Depois de cada chamada, follow-up no mesmo dia. Fechos sempre éticos.',
        'Task: before every call this week, read the record. After every call, follow up the same day. Always ethical closes.',
      ),
    },
  ],
  quiz: [
    {
      pergunta: t('Na proposta apresentas…', 'In the offer you present…'),
      opcoes: [t('A escada toda', 'The whole ladder'), t('O caminho que serve a esta pessoa', 'The path that fits this person')],
      certa: 1,
      porque: t('Apresentar tudo transforma a conversa numa discussão de preço.', 'Presenting everything turns the conversation into a price argument.'),
    },
  ],
  youtube: {},
}

const aula6: Aula = {
  slug: '06-afiliado-e-ib',
  numero: 6,
  papel: 'afiliado',
  titulo: t('Afiliados e IBs', 'Affiliates and IBs'),
  objetivo: t(
    'Usar o teu link, recomendar com a tua experiência real e acompanhar a rede de IBs da PU Prime.',
    'Use your link, recommend with your real experience and follow your PU Prime IB network.',
  ),
  tarefa: t(
    'Copia o teu link em Materiais, escreve uma publicação com o gerador e partilha-a com o aviso educativo.',
    'Copy your link from Materials, write a post with the generator and share it with the educational disclaimer.',
  ),
  cenas: [
    {
      tipo: 'capa',
      titulo: t('Afiliados e IBs', 'Affiliates and IBs'),
      sub: t('Aula 6 · Recomendar com o teu link', 'Lesson 6 · Recommend with your link'),
      fala: t(
        'Esta aula é para quem recomenda: afiliados e IBs. Ganhas quando um cliente real subscreve e fica. Nunca por recrutar.',
        'This lesson is for those who recommend: affiliates and IBs. You earn when a real customer subscribes and stays. Never by recruiting.',
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'material',
      titulo: t('O teu código e o teu link', 'Your code and your link'),
      destaques: [
        t('O mesmo código que o site usa (?ref=)', 'The same code the site uses (?ref=)'),
        t('Quem se regista fica ligado a ti', 'Whoever signs up is linked to you'),
        t('É essa ligação que cria a linha no extracto', 'That link creates the line in your statement'),
      ],
      fala: t(
        'Tudo começa no teu link, em Materiais. É o mesmo código que o site usa. Quem se regista por ele fica ligado a ti, e é essa ligação que faz nascer a linha no teu extracto quando houver uma venda. Usa sempre o teu link, em tudo.',
        'It all starts with your link, in Materials. It is the same code the site uses. Whoever signs up through it is linked to you, and that link is what creates the line in your statement when there is a sale. Always use your link, everywhere.',
      ),
    },
    {
      tipo: 'fluxo',
      titulo: t('Recomendar bem', 'Recommending well'),
      passos: [
        t('Partilha a tua experiência real', 'Share your real experience'),
        t('Link + aviso educativo', 'Link + educational disclaimer'),
        t('Interesse a sério → setter ou agenda', 'Serious interest → setter or booking'),
        t('Acompanha no extracto', 'Track it in your statement'),
      ],
      fala: t(
        'Recomendar bem é simples. Partilhas a tua experiência real, o que aprendeste e como usas a app, nunca resultados nem promessas. Pões o link e o aviso educativo. Quem mostrar interesse a sério passa a um setter ou recebe o link da agenda. E acompanhas tudo no extracto.',
        'Recommending well is simple. You share your real experience, what you learned and how you use the app, never results or promises. You add your link and the educational disclaimer. Anyone seriously interested goes to a setter or gets the booking link. And you track everything in your statement.',
      ),
    },
    {
      tipo: 'guiao',
      titulo: t('Story ou publicação', 'Story or post'),
      quando: t('Nas tuas redes', 'On your socials'),
      texto: t(
        'O que mais mudou desde que entrei na MoreThanMoney não foi o saldo — foi saber proteger capital e ter um método. Se te interessa aprender a sério, o link está aqui: {link}. (Conteúdo educativo, não constitui consultoria financeira.)',
        'What changed most since I joined MoreThanMoney wasn’t my balance — it was learning to protect capital and having a method. If you want to learn properly, the link is here: {link}. (Educational content, not financial advice.)',
      ),
      fala: t(
        'Este é um exemplo de publicação. Fala do método e da gestão de risco, não de dinheiro. E leva sempre o aviso. Para escrever mais, usa o gerador em Materiais: ele recusa qualquer texto com promessas ou números que não venham do sistema.',
        'This is an example post. It talks about method and risk management, not money. And it always carries the disclaimer. To write more, use the generator in Materials: it rejects any text with promises or numbers that do not come from the system.',
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'ib',
      titulo: t('Rede de IBs (PU Prime)', 'IB network (PU Prime)'),
      destaques: [
        t('As contas de corretora da tua rede', 'The broker accounts in your network'),
        t('Ordenadas por onde vale a pena começar', 'Sorted by where it’s worth starting'),
        t('Marca o ponto de cada conversa', 'Mark where each conversation stands'),
      ],
      fala: t(
        'Se és IB, tens a Rede de IBs no menu. Mostra as contas de corretora da tua rede, ordenadas por onde vale a pena começar, e deixa-te marcar o ponto de cada conversa. O objetivo é trazer as pessoas para a PU Prime e para dentro do ecossistema, onde aprendem com método.',
        "If you're an IB, you have the IB Network in the menu. It shows the broker accounts in your network, sorted by where it's worth starting, and lets you mark where each conversation stands. The goal is to bring people to PU Prime and into the ecosystem, where they learn with a method.",
      ),
    },
    {
      tipo: 'fim',
      titulo: t('Tarefa da aula', 'Lesson task'),
      cta: t('Link + gerador + aviso = primeira publicação', 'Link + generator + disclaimer = first post'),
      fala: t(
        'Tarefa: copia o teu link, escreve uma publicação com o gerador e partilha com o aviso educativo.',
        'Task: copy your link, write a post with the generator and share it with the educational disclaimer.',
      ),
    },
  ],
  quiz: [
    {
      pergunta: t('Numa publicação de afiliado falas de…', 'In an affiliate post you talk about…'),
      opcoes: [t('Quanto ganhaste', 'How much you made'), t('A tua experiência e o método', 'Your experience and the method')],
      certa: 1,
      porque: t('Resultados e promessas ficam de fora, sempre.', 'Results and promises always stay out.'),
    },
  ],
  youtube: {},
}

const aula7: Aula = {
  slug: '07-vender-solucoes-b2b',
  numero: 7,
  papel: 'todos',
  titulo: t('Vender as Soluções a negócios', 'Selling Solutions to businesses'),
  objetivo: t(
    'Mostrar a um negócio local a demo certa e levá-lo a pedir o protótipo, que cai na agenda e no CRM.',
    'Show a local business the right demo and get them to request the prototype, which lands in the calendar and CRM.',
  ),
  tarefa: t(
    'Escolhe três negócios do teu bairro, abre a demo do sector deles e manda o link com uma pergunta.',
    'Pick three businesses in your area, open the demo for their sector and send the link with one question.',
  ),
  cenas: [
    {
      tipo: 'capa',
      titulo: t('Soluções para negócios', 'Solutions for businesses'),
      sub: t('Aula 7 · Da demo ao protótipo', 'Lesson 7 · From demo to prototype'),
      fala: t(
        'Agora o segundo braço da casa: as Soluções. Aqui o cliente é o dono de um negócio local, e o que lhe vendemos são horas de volta.',
        'Now the second arm of the house: Solutions. Here the customer is a local business owner, and what we sell them is hours back.',
      ),
    },
    {
      tipo: 'fluxo',
      titulo: t('O funil B2B', 'The B2B funnel'),
      passos: [
        t('Escolher o sector', 'Pick the sector'),
        t('Mostrar a demo do sector', 'Show the sector demo'),
        t('«Receber protótipo»', '“Get a prototype”'),
        t('Agenda + CRM', 'Calendar + CRM'),
        t('Chamada no Meet', 'Call on Meet'),
      ],
      fala: t(
        'O funil é curto. Escolhes o sector, mostras a demo desse sector, o dono carrega em receber protótipo, e o pedido cai na agenda e no CRM. Depois há uma chamada no Google Meet para mostrar o protótipo já com a cara do negócio dele.',
        "The funnel is short. You pick the sector, show that sector's demo, the owner taps get a prototype, and the request lands in the calendar and the CRM. Then there's a Google Meet call to show the prototype already branded for their business.",
      ),
    },
    {
      tipo: 'guiao',
      titulo: t('Primeira mensagem a um negócio', 'First message to a business'),
      quando: t('Pastelaria, ginásio, oficina, restaurante…', 'Bakery, gym, garage, restaurant…'),
      texto: t(
        'Olá {nome}! Fazemos apps e agentes que respondem aos clientes e marcam por ti, sem subscrições externas. Preparei uma demo para {sector}: {link}. Quanto tempo por dia perdes hoje a responder a mensagens e marcações?',
        'Hi {name}! We build apps and agents that reply to customers and take bookings for you, with no external subscriptions. I prepared a demo for {sector}: {link}. How much time do you lose each day replying to messages and bookings?',
      ),
      fala: t(
        'Na primeira mensagem a um negócio, mostras uma demo do sector dele e fazes uma pergunta sobre o tempo que perde. O dono não compra tecnologia: compra tempo e clientes que não fogem.',
        "In the first message to a business, you show a demo for their sector and ask about the time they lose. The owner doesn't buy technology: they buy time and customers who don't slip away.",
      ),
    },
    {
      tipo: 'lista',
      titulo: t('Regras das Soluções', 'Solutions rules'),
      itens: [
        t('Nunca «em breve»: só se mostra o que existe', 'Never “coming soon”: only show what exists'),
        t('Demos com renders reais', 'Demos with real renders'),
        t('Reuniões só no Google Meet', 'Meetings only on Google Meet'),
        t('Preço só depois do protótipo', 'Price only after the prototype'),
      ],
      fala: t(
        'Regras das Soluções: nunca dizes em breve, só mostras o que existe. As demos são reais. As reuniões são no Google Meet. E o preço só aparece depois de o dono ver o protótipo.',
        "Solutions rules: you never say coming soon, you only show what exists. The demos are real. Meetings are on Google Meet. And the price only comes after the owner sees the prototype.",
      ),
    },
    {
      tipo: 'fim',
      titulo: t('Tarefa da aula', 'Lesson task'),
      cta: t('3 negócios, 3 demos, 3 perguntas', '3 businesses, 3 demos, 3 questions'),
      fala: t(
        'Tarefa: escolhe três negócios do teu bairro, abre a demo do sector deles e manda o link com uma pergunta.',
        'Task: pick three businesses in your area, open the demo for their sector and send the link with one question.',
      ),
    },
  ],
  quiz: [
    {
      pergunta: t('Quando aparece o preço numa venda B2B?', 'When does price come up in a B2B sale?'),
      opcoes: [t('Na primeira mensagem', 'In the first message'), t('Depois de o dono ver o protótipo', 'After the owner sees the prototype')],
      certa: 1,
      porque: t('Primeiro o valor, depois o preço.', 'Value first, price second.'),
    },
  ],
  youtube: {},
}

const aula8: Aula = {
  slug: '08-rotina-diaria',
  numero: 8,
  papel: 'todos',
  titulo: t('A rotina diária que escala', 'The daily routine that scales'),
  objetivo: t(
    'Ter um dia de trabalho com blocos fixos e medir o que importa: conversas, chamadas marcadas e vendas confirmadas.',
    'Have a workday with fixed blocks and measure what matters: conversations, booked calls and confirmed sales.',
  ),
  tarefa: t(
    'Põe os três blocos no teu calendário para os próximos cinco dias e cumpre-os.',
    'Put the three blocks in your calendar for the next five days and stick to them.',
  ),
  cenas: [
    {
      tipo: 'capa',
      titulo: t('A rotina diária', 'The daily routine'),
      sub: t('Aula 8 · O que escala é a constância', 'Lesson 8 · Consistency is what scales'),
      fala: t(
        'Última aula. Já sabes as ferramentas e os guiões. O que faz a diferença agora é a rotina.',
        'Last lesson. You know the tools and the scripts. What makes the difference now is the routine.',
      ),
    },
    {
      tipo: 'fluxo',
      titulo: t('Os 3 blocos do dia', 'The 3 blocks of the day'),
      passos: [
        t('Manhã: o Hoje até zero', 'Morning: Today down to zero'),
        t('Tarde: conversas novas e chamadas', 'Afternoon: new conversations and calls'),
        t('Fim do dia: notas e pipeline em dia', 'End of day: notes and pipeline up to date'),
      ],
      fala: t(
        'Três blocos. De manhã, abres o Hoje e trabalhas até não sobrar nada. À tarde, abres conversas novas e fazes as chamadas. No fim do dia, escreves as notas e deixas o pipeline em dia, para amanhã o Hoje estar certo.',
        'Three blocks. In the morning, open Today and work until nothing is left. In the afternoon, open new conversations and do your calls. At the end of the day, write your notes and leave the pipeline up to date, so tomorrow Today is accurate.',
      ),
    },
    {
      tipo: 'mapa',
      centro: t('O que medir', 'What to measure'),
      ramos: [
        { nome: t('Prospector', 'Prospector'), folhas: [t('Conversas abertas', 'Conversations opened'), t('Leads com dor', 'Leads with pain')] },
        { nome: t('Setter', 'Setter'), folhas: [t('Qualificados', 'Qualified'), t('Chamadas marcadas', 'Calls booked')] },
        { nome: t('Closer', 'Closer'), folhas: [t('Apresentados', 'Presented'), t('Pagamentos confirmados', 'Confirmed payments')] },
        { nome: t('Afiliado', 'Affiliate'), folhas: [t('Registos pelo link', 'Sign-ups via link'), t('Clientes que ficam', 'Customers who stay')] },
      ],
      fala: t(
        'Mede o que depende de ti. O prospector mede conversas abertas e leads com dor. O setter, qualificados e chamadas marcadas. O closer, apresentações e pagamentos confirmados. O afiliado, registos pelo link e clientes que ficam. Os números estão no pipeline, na equipa e no extracto.',
        "Measure what depends on you. The prospector measures conversations opened and leads with pain. The setter, qualified leads and calls booked. The closer, presentations and confirmed payments. The affiliate, sign-ups via the link and customers who stay. The numbers are in the pipeline, the team page and the statement.",
      ),
    },
    {
      tipo: 'ecra',
      ecra: 'equipa',
      titulo: t('A minha equipa', 'My team'),
      destaques: [
        t('Quem responde a ti e o que trabalha', 'Who reports to you and what they work on'),
        t('O líder vê as linhas, não só os totais', 'The leader sees the lines, not just totals'),
        t('Um nível, sem cadeia', 'One level, no chain'),
      ],
      fala: t(
        'Se lideras uma equipa, a página A minha equipa mostra quem responde a ti, o que cada um está a trabalhar e o que ganhou, linha a linha. Serve para ajudar, não para vigiar.',
        'If you lead a team, the My team page shows who reports to you, what each person is working on and what they earned, line by line. It is there to help, not to watch.',
      ),
    },
    {
      tipo: 'fim',
      titulo: t('Bem-vindo à equipa', 'Welcome to the team'),
      cta: t('Três blocos no calendário, cinco dias seguidos', 'Three blocks in your calendar, five days in a row'),
      fala: t(
        'A tua última tarefa: põe os três blocos no calendário durante cinco dias e cumpre. Tudo o que viste está em Materiais, para reveres quando quiseres. Bem-vindo à equipa. Vamos a isso.',
        "Your last task: put the three blocks in your calendar for five days and stick to them. Everything you saw is in Materials, to review whenever you want. Welcome to the team. Let's go.",
      ),
    },
  ],
  quiz: [
    {
      pergunta: t('Por onde começas o dia?', 'Where do you start your day?'),
      opcoes: [t('Pelo Hoje, até zero', 'On Today, down to zero'), t('Por leads novos ao acaso', 'With random new leads')],
      certa: 0,
      porque: t('O Hoje já está ordenado pelo que vale mais agora.', 'Today is already sorted by what is worth most right now.'),
    },
  ],
  youtube: {},
}

export const AULAS: Aula[] = [aula1, aula2, aula3, aula4, aula5, aula6, aula7, aula8]

/** O texto narrado de uma aula, numa língua (as falas das cenas, por ordem). */
export function narracao(aula: Aula, lingua: Lingua): string {
  return aula.cenas.map((c) => c.fala[lingua]).join('\n\n')
}

/** As aulas que esta pessoa vê primeiro: as gerais e as dos seus papéis. O dono e o team leader vêem todas. */
export function aulasPara(papeis: string[], todas: boolean): Aula[] {
  if (todas) return AULAS
  return AULAS.filter((a) => a.papel === 'todos' || papeis.includes(a.papel))
}

export const NOME_PAPEL: Record<PapelAula, T> = {
  todos: t('Todos', 'Everyone'),
  prospector: t('Prospector', 'Prospector'),
  setter: t('Setter', 'Setter'),
  closer: t('Closer', 'Closer'),
  afiliado: t('Afiliado / IB', 'Affiliate / IB'),
}
