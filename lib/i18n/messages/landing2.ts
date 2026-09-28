import type { Lang } from "@/lib/i18n/config"

/**
 * Namespace `l2.` — a landing pública reconstruída (/new-landing).
 *
 * `pt` é a fonte. Traduzido para en/es; os restantes idiomas caem para `pt` por desenho do
 * dicionário (ver registry/translate) — melhor uma página inteira em português do que meia
 * página traduzida. Termos de marca (MoreThanMoney, MTM, Premium, Tap to Trade, Sensei…)
 * não se traduzem.
 *
 * Nomes e citações dos testemunhos NÃO vivem aqui: são verbatim do chat da comunidade e
 * mostram-se na língua em que foram escritos.
 */
export const LANDING2_MESSAGES: Partial<Record<Lang, Record<string, string>>> = {
  pt: {
    "l2.heroKicker": "MoreThanMoney",
    "l2.heroL1": "O trading é uma das vias.",
    "l2.heroL2a": "Não é ",
    "l2.heroL2b": "a única",
    "l2.heroSub":
      "Mercados, marca pessoal, mindset e liderança — e formas de ganhar aqui sem abrir uma ordem. Do lado do trading, o sinal chega, decides com um toque, e o motor trata dele até fechar.",
    "l2.heroCta1": "Ver o que há cá dentro",
    "l2.heroFact1": "A conta é tua",
    "l2.heroFact2": "Sem fidelização",
    "l2.heroFact3": "Aulas ao vivo todas as semanas",
    "l2.heroVideo": "Bem-vindo à MoreThanMoney · 2 min",
    "l2.scrollHint": "desce",

    "l2.videoTitle": "Bem-vindo à MoreThanMoney",
    "l2.videoSub": "Dois minutos com o Ricardo, antes de decidires alguma coisa.",
    "l2.videoFallback": "Se o vídeo não abrir aqui,",
    "l2.videoFallbackLink": "vê-o no YouTube",
    "l2.close": "Fechar",


    "l2.narSign": "— Ricardo Garcia, fundador",

    "l2.ch2": "A solução, em ação",
    "l2.diaTitle": "Um dia normal, visto de dentro",
    "l2.diaSub":
      "Quarta-feira, 20 de agosto. As mensagens são as que os membros leram no telemóvel nesse dia, tal e qual — não uma recriação.",
    "l2.beat1T": "A ideia chega antes de ti",
    "l2.beat1B":
      "Ninguém estava a olhar para o gráfico. A ideia chegou ao canal já completa: entrada, stop e três alvos, sem ter de perguntar nada a ninguém.",
    "l2.beat1Tool": "Canal Premium",
    "l2.beat2T": "Chega ao teu bolso",
    "l2.beat2Tool": "App iOS e Android",
    "l2.beat3T": "Um toque, e é teu",
    "l2.beat3B": "A ordem entra na tua conta, na tua corretora, com o lote calculado pelo teu saldo — não pelo nosso.",
    "l2.beat3Tool": "Tap to Trade",
    "l2.beat4T": "Alvo, sem fazeres nada",
    "l2.beat4B":
      "Cem pips. O motor realizou a parcial e puxou o stop para a entrada. Tu estavas a tomar o pequeno-almoço.",
    "l2.beat4Tool": "Motor de gestão",
    "l2.beat5T": "E fecha sozinho",
    "l2.beat5B": "Todos os alvos atingidos. Duzentos pips. O desfecho apareceu no mesmo sítio onde o sinal nasceu.",
    "l2.beat5Tool": "Do início ao fim",
    "l2.feedTitle": "Ideias Premium",
    "l2.feedTap": "Aceitar trade",

    "l2.chExec": "As duas formas de executar",
    "l2.execTitle": "Queres decidir, ou não queres decidir?",
    "l2.execSub":
      "É a única pergunta que interessa. As duas respostas estão construídas, e podes ter as duas ao mesmo tempo — na mesma conta, na tua corretora.",
    "l2.t2tEyebrow": "Quero decidir",
    "l2.t2tSub": "Controlo total, num só toque.",
    "l2.t2tBody":
      "O sinal chega à app. Vês a entrada, a invalidação e os alvos antes de tocares em nada. Se aceitares, a ordem entra na tua conta com o lote calculado pelo teu saldo — e a partir daí é o motor que faz parciais, break-even e trailing.",
    "l2.t2tF1": "Recebe",
    "l2.t2tF2": "Revê",
    "l2.t2tF3": "Confirma",
    "l2.copyEyebrow": "Não quero decidir",
    "l2.copySub": "Configuras uma vez. Fica a correr.",
    "l2.copyBody":
      "As estratégias da casa replicam-se na tua conta sem interveres. O risco é o teu, o lote é calculado pelo teu capital e a gestão corre em segundo plano. Pausas quando quiseres — e pausar pára mesmo, não é um botão decorativo.",
    "l2.copyF1": "Liga a conta",
    "l2.copyF2": "Define o risco",
    "l2.copyF3": "Esquece",
    "l2.copyMaster": "MESTRE",
    "l2.copyStrategy": "ESTRATÉGIA MTM",
    "l2.copyClient": "Conta do cliente",
    "l2.execRisk":
      "Ambos operam na tua conta, na tua corretora, com o teu capital. Nunca temos acesso ao teu dinheiro — só à ordem que autorizaste.",

    "l2.ch3": "A prova",
    "l2.numTitle": "O sistema já correu isto tudo",
    "l2.numSub": "Contagens da nossa própria base de dados, recalculadas todas as segundas-feiras de manhã.",
    "l2.numTrades": "trades fechadas em contas reais",
    "l2.numWin": "taxa de acerto nessas trades",
    "l2.numSignals": "sinais processados pelos scanners",
    "l2.numOrders": "ordens colocadas pelo motor",
    "l2.numCerts": "certificados oficiais emitidos",
    "l2.numStamp": "atualizado a {d} · recalcula às segundas",
    "l2.numRisk":
      "Trades fechadas registadas no diário de {n} contas ligadas. A taxa de acerto é o que se repete entre contas; o resultado em euros depende do capital e do risco de cada um, e há contas com resultado negativo. O trading envolve risco: resultados passados não garantem resultados futuros.",
    "l2.jump1": "Estes números correm todos os dias, com ou sem ti.",
    "l2.jump1Sub": "A diferença é se a tua conta está ligada ou não.",
    "l2.jump1Cta": "Ligar a minha conta",
    "l2.jumpVideo": "Ver o vídeo · 2 min",

    "l2.narLabel2": "Ricardo Garcia · quem está do outro lado",
    "l2.narQuote2":
      "Podíamos ter alugado tudo. Não alugámos — e é por isso que conseguimos olhar alguém nos olhos quando alguma coisa corre mal.",
    "l2.narBody2":
      "Não é um nome numa apresentação. O Ricardo dá as aulas de Forex ele próprio — quatro salas, das básicas à mentoria, sete horários por semana — e escreveu os scanners, o motor que gere as posições e a app onde isto tudo vive. Quando alguém pergunta porque é que uma ordem entrou àquele preço, quem responde é quem escreveu a linha de código que a colocou.",


    "l2.dcaBuy": "Compra",

    "l2.live": "Ao vivo",

    "l2.invalidation": "Invalidação",
    "l2.exit": "Saída",

    "l2.chSchool": "Escola",
    "l2.schoolTitle": "Aprender aqui tem nota.",
    "l2.schoolTag1": "Fast Start",
    "l2.schoolTag2": "Bootcamp 30h",
    "l2.schoolTag3": "Teste Final · Junior Trader",
    "l2.schoolTag4": "Sessões ao vivo",
    "l2.schoolTag5": "Legendas em 5 idiomas",
    "l2.schoolCta": "Ver as avaliações",
    "l2.schoolCaption": "Bootcamp MTM · 30 horas, com avaliação no fim",
    "l2.schoolAlt": "Sala de estudo à noite: caderno com gráficos desenhados à mão em frente a dois ecrãs",

    "l2.ch5": "A prova de quem aprendeu",
    "l2.certsPill": "{n} certificados emitidos",
    "l2.certsTitle": "Alunos já certificados",
    "l2.certsSub":
      "Prova real: pessoas que concluíram a formação e receberam o seu certificado oficial — com nota, assinatura e código de validação.",
    "l2.certsRisk":
      "Os certificados atestam a conclusão e o aproveitamento na formação MoreThanMoney. Podem ser validados em morethanmoney.pt/avaliacoes/validar.",
    "l2.certFastStart": "Certificado de Conclusão",
    "l2.certBootcamp": "Certificado · Bootcamp de Trading",
    "l2.certFinal": "Certificado Final · Junior Trader",
    "l2.certTo": "Atribuído a",
    "l2.certGrade": "Classificação",
    "l2.certEducator": "Ricardo Garcia · Educador",
    "l2.courseFastStart": "Avaliação Fast Start",
    "l2.courseBootcamp": "Validação do Bootcamp",
    "l2.courseFinal": "Teste Final — Junior Trader",
    "l2.gradeValues": "valores",

    "l2.ch6": "Dentro da app",
    "l2.commTitle": "Não é só uma ferramenta.",
    "l2.commTitle2": "É onde as pessoas estão.",
    "l2.commSub": "A app não abre num gráfico. Abre no que a comunidade está a dizer.",
    "l2.comm1L": "Social",
    "l2.comm1T": "Feed da comunidade",
    "l2.comm1B":
      "Publicações, reações e comentários entre membros — updates, ideias, mindset. É a primeira coisa que vês quando abres.",
    "l2.comm2L": "Conversa",
    "l2.comm2T": "Chats por tema",
    "l2.comm2B":
      "Canais separados para Premium, scanners, cripto e ideias de forex. Cada sinal traz a sua própria conversa em thread.",
    "l2.comm3T": "Sessões com educadores",
    "l2.comm3B":
      "Quatro salas em direto todas as semanas, com legendas traduzidas em cinco idiomas. Quem falta encontra a gravação organizada em curso.",
    "l2.comm4L": "Mentor",
    "l2.comm4T": "Mentor de IA",
    "l2.comm4B": "Responde às tuas dúvidas a qualquer hora, com o contexto do teu percurso e do teu plano de trading.",
    "l2.comm5L": "Progresso",
    "l2.comm5T": "Plano e diário de trading",
    "l2.comm5B": "As tuas trades registadas sozinhas, com o teu risco, os teus pips e a tua evolução mês a mês.",
    "l2.comm6L": "Mindset",
    "l2.comm6T": "Mindset e liderança",
    "l2.comm6B": "Porque a disciplina não se aprende no gráfico. Sala própria, com horário semanal e acesso livre — não é preciso pagar nada para entrar.",

    "l2.ch7": "Testemunhos",
    "l2.testTitle": "O que dizem os nossos membros",
    "l2.testChat": "Mensagem no chat da comunidade",
    "l2.testVerbatim": "verbatim",
    "l2.testVerified": "verificado",
    "l2.testResult": "Resultado",
    "l2.testStamp": "{c} certificados emitidos · contados na nossa base, não estimados",
    "l2.jump3": "Nenhuma destas pessoas começou a saber.",
    "l2.jump3Sub": "Começaram a aparecer. É o único requisito.",
    "l2.jump3Cta": "Começar agora",
    "l2.jump3Cta2": "Assistir a uma sessão grátis",


    "l2.doorsLabel": "As quatro portas",
    "l2.doorsTitle": "Há quem venha aprender.",
    "l2.doorsTitle2": "E há quem venha construir.",
    "l2.doorsSub": "Quatro portas diferentes — e nenhuma delas te obriga a comprar um pacote para começar.",
    "l2.door1L": "Criadores · UGC",
    "l2.door1T": "Traz o teu conteúdo",
    "l2.door1Cta": "Candidatar",
    "l2.door2L": "Convida e ganha",
    "l2.door2T": "Traz quem confia em ti",
    "l2.door2B": "Dias de Premium por cada amigo que entre pelo teu link, e comissão sobre as subscrições que resultem.",
    "l2.door2Cta": "Como funciona",
    /* O IB é parceria de corretora, não um curso nem um botão: entra-se por conversa e a
       comissão é da corretora, não nossa. Fica como nota fora da grelha — se virasse cartão
       com botão, prometia um caminho self-service que não existe. */
    "l2.doorsIb":
      "Há ainda a parceria de corretora (IB): quem já traz volume entra na nossa rede e a comissão passa a ser paga do nosso lado. Não é um curso nem um formulário — é uma conversa, e o primeiro passo é abrires conta por nós.",
    "l2.doorsIbCta": "Abrir conta",
    "l2.door3L": "Marketing digital",
    "l2.door3T": "Material feito para vender",
    "l2.door3B": "Criativos, funis, páginas e sequências já escritas. Não tens de inventar copy — tens de a usar.",
    "l2.door3Cta": "Ver material",
    "l2.door4L": "Equipa",
    "l2.door4T": "Setters, closers e growth",
    "l2.door4B": "Vagas remotas com formação interna e comissões recorrentes. Trabalhar connosco, não para nós.",
    "l2.door4Cta": "Ver vagas",

    /* Áreas (#areas). Os nomes das academias e dos educadores NÃO vivem aqui: são nomes
       próprios lidos da base (lms_academies / lms_educators) e mostram-se como estão. */
    /* OS TRÊS CAMINHOS — o eixo de fora da página.
       Arrumar por assunto obriga quem chega a saber o que procura; arrumar por intenção não,
       porque a intenção toda a gente sabe qual é a sua. O assunto (MTM Markets / MTM Content
       & Business) continua a mandar dentro de "aprender". */
    "l2.chPaths": "Três caminhos",
    "l2.pathsTitle": "Escolhe o teu.",
    "l2.pathsSub":
      "As pessoas não chegam aqui todas pelo mesmo motivo, e a página não devia fingir que sim.",
    "l2.path1K": "Caminho um",
    "l2.path1T": "Aprender",
    "l2.path1B":
      "Aulas ao vivo todas as semanas, com o nome de quem as dá. Mercados de um lado, marca pessoal e negócio do outro — e avaliação com certificado no fim.",
    "l2.path1W": "Para quem chega sem saber nada",
    "l2.path2K": "Caminho dois",
    "l2.path2T": "Ganhar",
    "l2.path2B":
      "As ferramentas que executam na tua conta enquanto trabalhas, e as formas de ganhar aqui sem abrir uma ordem: alojamos o teu conteúdo, ou pagamos-te por quem trazes.",
    "l2.path2W": "Para quem tem pouco tempo",
    "l2.path3K": "Caminho três",
    "l2.path3T": "Aceder",
    "l2.path3B":
      "Entrar na sala, perguntar e ser respondido. Sessões ao vivo com os educadores, chats por área, e o mentor de IA às três da manhã quando não há mais ninguém acordado.",
    "l2.path3W": "Para quem já tentou sozinho",
    "l2.pathGo": "Ver este caminho",

    "l2.act1": "Aprender",
    "l2.act1Sub": "Quatro áreas com educador e horário semanal, em duas frentes.",
    "l2.act2": "Ganhar",
    "l2.act2Sub": "O que executa por ti, e o que te paga sem abrires uma ordem.",
    "l2.act3": "Aceder",
    "l2.act3Sub": "As pessoas, as salas e quem construiu isto.",

    /* A conta é tua (#seguranca). Isto já era a resposta de uma pergunta do acordeão; passou a
       bloco porque é a objeção que trava mais gente, e porque vem antes de pedirmos dinheiro. */
    "l2.chSafe": "Antes de mais nada",
    "l2.safeTitle": "A conta é tua. O dinheiro nunca passa por nós.",
    "l2.safeSub":
      "É a primeira pergunta que toda a gente faz, e merece resposta antes de falarmos de preços.",
    "l2.safe1L": "A conta",
    "l2.safe1T": "Aberta em teu nome",
    "l2.safe1B":
      "Abres a conta na tua corretora, com os teus documentos. Nós nunca lhe tocamos no saldo, nunca recebemos depósitos e nunca fazemos levantamentos.",
    "l2.safe2L": "A autorização",
    "l2.safe2T": "Só para colocar a ordem",
    "l2.safe2B":
      "O que autorizas é a colocação da ordem na tua conta — mais nada. O lote sai do teu saldo e do teu risco, não do nosso.",
    "l2.safe3L": "A saída",
    "l2.safe3T": "Desligas quando quiseres",
    "l2.safe3B":
      "Desligar pára mesmo: as posições deixam de ser copiadas nesse instante. E os planos mensais não têm fidelização — cancelas no teu perfil em dois cliques.",
    "l2.safeRisk":
      "Operar nos mercados envolve risco de perda, e há semanas negativas. Não somos consultores financeiros licenciados e nada aqui é aconselhamento financeiro personalizado.",

    "l2.chAreas": "As áreas",
    "l2.areasTitle": "Quem dá as aulas tem nome.",
    "l2.areasTitle2": "E tem hora marcada.",
    "l2.areasSub":
      "Duas frentes, e em cada uma há aulas ao vivo com o nome de quem as dá. Algumas áreas ainda não abriram — ficas a saber quais antes de pagares.",
    /* Os nomes dos pilares são marca e não se traduzem; as definições sim. */
    "l2.pil1D":
      "Os mercados e o dinheiro: aprender a operá-los, e as ferramentas que os operam por ti quando não podes estar.",
    "l2.pil2D":
      "Construir audiência e construir negócio: marca pessoal, conteúdo, e as formas de ganhar aqui sem abrir uma ordem.",
    "l2.pilCountEdu": "{n} com educador",
    "l2.pilCountNoEdu": "{n} sem aulas próprias",
    "l2.pilCountSoon": "{n} a abrir",
    "l2.pilAlso": "também neste pilar",
    "l2.areasFam1": "Com educador e horário semanal",
    "l2.areasFam2": "A abrir",
    "l2.areasSoonTag": "em preparação",
    "l2.areasEducator": "educador",
    "l2.areasLive": "a dar aulas",
    "l2.areasNoTeacher": "Sem aulas próprias",
    "l2.areasGo": "Ver no lobby ao vivo",
    "l2.areasHint": "Estas áreas abrem quando houver o educador certo.",
    "l2.areasHintLink": "Se és tu, candidata-te",
    "l2.areasRisk":
      "As salas e os horários são os que estão marcados esta semana, contados um a um. Uma área com uma sala e um horário acabou de começar — se procuras um arquivo cheio de aulas, ainda não é o que vais encontrar lá.",

    "l2.chFaq": "Antes de decidires",
    "l2.faqTitle": "As perguntas que toda a gente faz",
    "l2.faqSub": "As mesmas respostas que estão em {link} — sem letras pequenas.",
    "l2.faq1Q": "Preciso de saber alguma coisa de trading para começar?",
    "l2.faq1A":
      "Não. A maioria entra sem saber ler um gráfico. Começas pelo Fast Start, passas ao Bootcamp de 30 horas e, se quiseres, ligas a execução automática enquanto ainda estás a aprender — é precisamente para isso que ela existe.",
    "l2.faq2Q": "Vocês ficam com o meu dinheiro?",
    "l2.faq2A":
      "Nunca. A conta é tua, aberta em teu nome na tua corretora, e o dinheiro nunca passa por nós. O que autorizas é a colocação da ordem — nada mais. Podes desligar a ligação a qualquer momento, e desligar pára mesmo: as posições deixam de ser copiadas nesse instante.",
    "l2.faq3Q": "Quanto preciso de ter para começar?",
    "l2.faq3A":
      "O lote é calculado pelo teu saldo, não pelo nosso, por isso não há um mínimo imposto por nós — há o mínimo da tua corretora. O que te pedimos é que comeces com um valor que possas perder sem mudar a tua vida, porque há semanas negativas e vais ter algumas.",
    "l2.faq4Q": "Qual é a diferença entre o Membro e o Premium?",
    "l2.faq4A":
      "O Membro dá-te a app: comunidade, chats, sessões ao vivo, formação e certificação. O Premium acrescenta tudo o que vive no site — sinais Premium, Tap to Trade, MTM Copy, Terminal com IA, portefólios e DCA, e os scanners. Em resumo: o Membro é aprender, o Premium é aprender e executar.",
    "l2.faq5Q": "Estou preso por quanto tempo?",
    "l2.faq5A":
      "Por nenhum. Os planos mensais não têm fidelização e cancelas no teu perfil em dois cliques. Há 7 dias de garantia nos mensais, e ao cancelar mantens o acesso até ao fim do período que já pagaste. O plano anual sai mais barato por mês, mas é uma escolha tua — não é a única porta.",
    "l2.faq6Q": "Isto é garantido? Quanto vou ganhar?",
    "l2.faq6A":
      "Não é garantido nada, e quem te garantir está a mentir-te. O que te mostramos são contagens da nossa base de dados, com a data ao lado e com as contas negativas incluídas na conta. O resultado em euros depende do teu capital, do teu risco e de quanto tempo aguentas sem mexer no que está a correr bem. Não somos consultores financeiros licenciados e isto não é aconselhamento financeiro personalizado.",
    "l2.faq7Q": "Já pago no site. Tenho de pagar outra vez na app?",
    "l2.faq7A":
      "Não. O acesso é o mesmo dos dois lados: entras na app com o mesmo login e o que já pagaste vale lá. Só há uma subscrição por pessoa, seja ela feita no site ou dentro da app.",
    "l2.faq8Q": "Em que idiomas está a plataforma?",
    "l2.faq8A":
      "O site e a app estão traduzidos em 21 idiomas, e as sessões ao vivo têm legendas traduzidas em português, inglês, espanhol, francês e alemão — em direto, enquanto o educador fala.",
    /* As duas objeções que a página inteira levantava e não respondia. Ficam em primeiro
       lugar na lista da landing, porque é a primeira coisa que trava quem chega. */
    "l2.faq9Q": "Isto é só para quem quer fazer trading?",
    "l2.faq9A":
      "Não. Há aulas ao vivo em quatro áreas: Forex com o Ricardo Garcia, Criptomoedas com o Ruben Pereira, e Social Media e UGC e Mindset e Liderança com os educadores da casa — estas duas começaram agora, com uma sala e um horário semanal cada. Ações e ETF não têm aulas próprias: vivem no portefólio, no Terminal e no canal de chat. E Imobiliário, Inteligência Artificial e Network Marketing estão a abrir, ainda sem educador — dizemo-lo antes de pagares, não depois.",
    "l2.faq10Q": "Consigo ganhar aqui sem abrir uma única ordem?",
    "l2.faq10A":
      "Consegues, por duas vias. Se produzes conteúdo, alojamos e vendemos o teu curso ou mentoria e ficas com 90–95% do que vender, sem entrada e sem exclusividade — candidatas-te e falamos. E se trazes pessoas, o Convida & Ganha dá-te dias de Premium por cada amigo que entre pelo teu link, com comissão sobre as subscrições que resultem. A parceria de corretora (IB) é outra coisa e não se faz por formulário: é uma conversa, e só depois é que entras na rede.",

    "l2.ch9": "A decisão",
    "l2.packsTitle": "Escolhe pelo que queres fazer",
    "l2.packsSub": "Todos mensais e sem fidelização. Cancelas quando quiseres.",
    "l2.packMember": "Membro",
    "l2.packMemberPer": "por mês · 28€ no anual",
    "l2.packMemberLine": "Para quem quer aprender e estar com a comunidade.",
    "l2.packMember2": "Feed, chats e sessões ao vivo",
    "l2.packMember3": "Formação e certificação",
    "l2.packPremium": "Premium",
    "l2.packPremiumFlag": "O mais escolhido",
    "l2.packPremiumPer": "por mês · 52€ no anual",
    "l2.packPremiumLine": "Para quem quer os sinais a trabalhar na sua conta.",
    "l2.packPremium1": "Tudo do Membro",
    "l2.packPremium2": "Sinais Premium",
    "l2.packPremium3": "Tap to Trade e MTM Copy",
    "l2.packPremium4": "Terminal com IA",
    "l2.packPremium5": "Portefólios e DCA",
    "l2.packPremium6": "Scanners incluídos",
    "l2.packScanners": "Scanners",
    "l2.packScannersPer": "por mês",
    "l2.packScannersLine": "Só os indicadores — sem app, sem sinais, sem comunidade.",
    "l2.packAuto": "MTM Auto",
    "l2.packAutoPer": "por mês · app grátis",
    "l2.packAutoLine": "Para quem começa, ou vem de fora do ecossistema.",
    "l2.packAuto1": "Tap to Trade: aceitas cada sinal com um toque",
    "l2.packAuto2": "Ou cópia automática, se preferires não decidir",
    "l2.packAuto3": "Uma conta real e uma demo incluídas",
    "l2.packAuto4": "iOS, Android e web",
    "l2.packAutoFree": "Conta real PU Prime validada? Não pagas nada.",
    "l2.packAutoCta": "Conhecer a app",
    "l2.packEa": "MTM Sensei EA",
    "l2.packEaPer": "por ano · ou 1000€ vitalícia",
    "l2.packEaLine": "O robô a correr no teu MetaTrader 5, não numa conta nossa.",
    "l2.packEa1": "Vinte confirmações antes de cada entrada",
    "l2.packEa2": "Parciais, breakeven e trailing automáticos",
    "l2.packEa3": "Filtro de notícias e modo prop firm",
    "l2.packEa4": "Instalador para Windows e macOS",
    "l2.packEaFree": "Premium, VIP ou Fundador? Está incluído.",
    "l2.packEaCta": "Ver o EA",
    "l2.packSc": "Sensei Scalp Edition",
    "l2.packScPer": "por ano · ou 697€ vitalícia",
    "l2.packScLine": "EA diferente do Sensei EA — ouro em M5, com licença própria.",
    "l2.packSc1": "Ordens pendentes dos dois lados, em M5",
    "l2.packSc2": "Trailing desde o primeiro cêntimo de lucro",
    "l2.packSc3": "Sem stop loss fixo — fecha na reversão",
    "l2.packSc4": "Painel com lote fixo ou percentagem",
    "l2.packScFree": "Licença separada. Não entra em nenhum plano.",
    "l2.packScCta": "Ver a Scalp",
    "l2.packStart": "Começar",
    "l2.packSeeScanners": "Ver scanners",
    "l2.packsGuarantee": "7 dias de garantia nos planos mensais. Sem compromisso de continuidade.",

    "l2.ctaBarTitle": "Começa hoje por 35€/mês",
    "l2.ctaBarSub": "Sem fidelização · 7 dias de garantia · cancelas quando quiseres",
    "l2.ctaBarVideo": "Ver o vídeo",
    "l2.ctaBarPacks": "Escolher o meu pack",
  },

  en: {
    "l2.heroKicker": "MoreThanMoney",
    "l2.heroL1": "Trading is one way in.",
    "l2.heroL2a": "It isn't ",
    "l2.heroL2b": "the only one",
    "l2.heroSub":
      "Markets, personal brand, mindset and leadership — and ways to earn here without opening a single order. On the trading side, the signal arrives, you decide with one tap, and the engine handles it to the close.",
    "l2.heroCta1": "See what's inside",
    "l2.heroFact1": "The account is yours",
    "l2.heroFact2": "No lock-in",
    "l2.heroFact3": "Live classes every week",
    "l2.heroVideo": "Welcome to MoreThanMoney · 2 min",
    "l2.scrollHint": "scroll",

    "l2.videoTitle": "Welcome to MoreThanMoney",
    "l2.videoSub": "Two minutes with Ricardo, before you decide anything.",
    "l2.videoFallback": "If the video doesn't open here,",
    "l2.videoFallbackLink": "watch it on YouTube",
    "l2.close": "Close",


    "l2.narSign": "— Ricardo Garcia, founder",

    "l2.ch2": "The solution, in action",
    "l2.diaTitle": "An ordinary day, seen from inside",
    "l2.diaSub":
      "Wednesday, 20 August. The messages are the ones members read on their phones that day, word for word — not a recreation.",
    "l2.beat1T": "The idea lands before you do",
    "l2.beat1B":
      "Nobody was looking at the chart. The idea landed in the channel already complete: entry, stop and three targets, without having to ask anyone anything.",
    "l2.beat1Tool": "Premium channel",
    "l2.beat2T": "It reaches your pocket",
    "l2.beat2Tool": "iOS and Android app",
    "l2.beat3T": "One tap, and it's yours",
    "l2.beat3B": "The order goes into your account, at your broker, with the lot sized by your balance — not ours.",
    "l2.beat3Tool": "Tap to Trade",
    "l2.beat4T": "Target hit, without you lifting a finger",
    "l2.beat4B": "A hundred pips. The engine took the partial and pulled the stop to entry. You were having breakfast.",
    "l2.beat4Tool": "Management engine",
    "l2.beat5T": "And it closes on its own",
    "l2.beat5B": "All targets hit. Two hundred pips. The outcome showed up in the same place the signal was born.",
    "l2.beat5Tool": "Start to finish",
    "l2.feedTitle": "Premium Ideas",
    "l2.feedTap": "Accept trade",

    "l2.chExec": "The two ways to execute",
    "l2.execTitle": "Do you want to decide, or not?",
    "l2.execSub":
      "That's the only question that matters. Both answers are built, and you can have both at once — in the same account, at your broker.",
    "l2.t2tEyebrow": "I want to decide",
    "l2.t2tSub": "Full control, in a single tap.",
    "l2.t2tBody":
      "The signal reaches the app. You see the entry, the invalidation and the targets before you touch anything. If you accept, the order goes into your account with the lot sized by your balance — and from there the engine handles partials, break-even and trailing.",
    "l2.t2tF1": "Receive",
    "l2.t2tF2": "Review",
    "l2.t2tF3": "Confirm",
    "l2.copyEyebrow": "I don't want to decide",
    "l2.copySub": "Set it once. It keeps running.",
    "l2.copyBody":
      "The house strategies replicate into your account without you stepping in. The risk is yours, the lot is sized by your capital and management runs in the background. You pause whenever you want — and pausing actually stops it, it isn't a decorative button.",
    "l2.copyF1": "Connect the account",
    "l2.copyF2": "Set the risk",
    "l2.copyF3": "Forget it",
    "l2.copyMaster": "MASTER",
    "l2.copyStrategy": "MTM STRATEGY",
    "l2.copyClient": "Client account",
    "l2.execRisk":
      "Both run in your account, at your broker, with your capital. We never have access to your money — only to the order you authorised.",

    "l2.ch3": "The proof",
    "l2.numTitle": "The system has already run all of this",
    "l2.numSub": "Counts from our own database, recalculated every Monday morning.",
    "l2.numTrades": "trades closed in real accounts",
    "l2.numWin": "hit rate on those trades",
    "l2.numSignals": "signals processed by the scanners",
    "l2.numOrders": "orders placed by the engine",
    "l2.numCerts": "official certificates issued",
    "l2.numStamp": "updated {d} · recalculated on Mondays",
    "l2.numRisk":
      "Closed trades logged in the journals of {n} connected accounts. The hit rate is what repeats across accounts; the result in euros depends on each person's capital and risk, and some accounts are negative. Trading involves risk: past results do not guarantee future results.",
    "l2.jump1": "These numbers run every day, with or without you.",
    "l2.jump1Sub": "The difference is whether your account is connected.",
    "l2.jump1Cta": "Connect my account",
    "l2.jumpVideo": "Watch the video · 2 min",

    "l2.narLabel2": "Ricardo Garcia · who is on the other side",
    "l2.narQuote2":
      "We could have rented all of it. We didn't — and that's why we can look someone in the eye when something goes wrong.",
    "l2.narBody2":
      "Not a name on a slide. Ricardo teaches the Forex classes himself — four rooms, from the basics to mentoring, seven slots a week — and he wrote the scanners, the engine that manages the positions, and the app all of this lives in. When someone asks why an order went in at that price, the person answering is the one who wrote the line of code that placed it.",


    "l2.dcaBuy": "Buy",

    "l2.live": "Live",

    "l2.invalidation": "Invalidation",
    "l2.exit": "Exit",

    "l2.chSchool": "School",
    "l2.schoolTitle": "Learning here comes with a grade.",
    "l2.schoolTag1": "Fast Start",
    "l2.schoolTag2": "30h Bootcamp",
    "l2.schoolTag3": "Final Test · Junior Trader",
    "l2.schoolTag4": "Live sessions",
    "l2.schoolTag5": "Subtitles in 5 languages",
    "l2.schoolCta": "See the assessments",
    "l2.schoolCaption": "MTM Bootcamp · 30 hours, with an assessment at the end",
    "l2.schoolAlt": "A study room at night: a notebook with hand-drawn charts in front of two screens",

    "l2.ch5": "Proof from those who learned",
    "l2.certsPill": "{n} certificates issued",
    "l2.certsTitle": "Students already certified",
    "l2.certsSub":
      "Real proof: people who completed the training and received their official certificate — with a grade, a signature and a validation code.",
    "l2.certsRisk":
      "The certificates attest to completion of and performance in the MoreThanMoney training. They can be validated at morethanmoney.pt/avaliacoes/validar.",
    "l2.certFastStart": "Certificate of Completion",
    "l2.certBootcamp": "Certificate · Trading Bootcamp",
    "l2.certFinal": "Final Certificate · Junior Trader",
    "l2.certTo": "Awarded to",
    "l2.certGrade": "Grade",
    "l2.certEducator": "Ricardo Garcia · Educator",
    "l2.courseFastStart": "Fast Start Assessment",
    "l2.courseBootcamp": "Bootcamp Validation",
    "l2.courseFinal": "Final Test — Junior Trader",
    "l2.gradeValues": "out of 20",

    "l2.ch6": "Inside the app",
    "l2.commTitle": "It isn't just a tool.",
    "l2.commTitle2": "It's where the people are.",
    "l2.commSub": "The app doesn't open on a chart. It opens on what the community is saying.",
    "l2.comm1L": "Social",
    "l2.comm1T": "Community feed",
    "l2.comm1B": "Posts, reactions and comments between members — updates, ideas, mindset. It's the first thing you see.",
    "l2.comm2L": "Talk",
    "l2.comm2T": "Chats by topic",
    "l2.comm2B":
      "Separate channels for Premium, scanners, crypto and forex ideas. Each signal brings its own threaded conversation.",
    "l2.comm3T": "Sessions with educators",
    "l2.comm3B":
      "Four rooms live every week, with subtitles translated into five languages. Anyone who misses one finds the recording organised into a course.",
    "l2.comm4L": "Mentor",
    "l2.comm4T": "AI mentor",
    "l2.comm4B": "Answers your questions at any hour, with the context of your path and your trading plan.",
    "l2.comm5L": "Progress",
    "l2.comm5T": "Trading plan and journal",
    "l2.comm5B": "Your trades logged on their own, with your risk, your pips and your month-by-month progress.",
    "l2.comm6L": "Mindset",
    "l2.comm6T": "Mindset and leadership",
    "l2.comm6B": "Because discipline isn't learned on a chart. Its own room, with a weekly slot and open access — you don't have to pay anything to walk in.",

    "l2.ch7": "Testimonials",
    "l2.testTitle": "What our members say",
    "l2.testChat": "Message in the community chat",
    "l2.testVerbatim": "verbatim",
    "l2.testVerified": "verified",
    "l2.testResult": "Result",
    "l2.testStamp": "{c} certificates issued · counted in our database, not estimated",
    "l2.jump3": "None of these people started out knowing.",
    "l2.jump3Sub": "They started showing up. That's the only requirement.",
    "l2.jump3Cta": "Start now",
    "l2.jump3Cta2": "Watch a free session",


    "l2.doorsLabel": "The four doors",
    "l2.doorsTitle": "Some come to learn.",
    "l2.doorsTitle2": "And some come to build.",
    "l2.doorsSub": "Four different doors — and none of them makes you buy a bundle to start.",
    "l2.door1L": "Creators · UGC",
    "l2.door1T": "Bring your content",
    "l2.door1Cta": "Apply",
    "l2.door2L": "Refer and earn",
    "l2.door2T": "Bring the people who trust you",
    "l2.door2B": "Premium days for every friend who joins through your link, plus commission on the subscriptions that follow.",
    "l2.door2Cta": "How it works",
    "l2.doorsIb":
      "There's also the broker partnership (IB): if you already bring volume, you join our network and the commission starts being paid on our side. It isn't a course and it isn't a form — it's a conversation, and the first step is opening an account through us.",
    "l2.doorsIbCta": "Open an account",
    "l2.door3L": "Digital marketing",
    "l2.door3T": "Material built to sell",
    "l2.door3B": "Creatives, funnels, pages and sequences already written. You don't have to invent copy — you have to use it.",
    "l2.door3Cta": "See the material",
    "l2.door4L": "Team",
    "l2.door4T": "Setters, closers and growth",
    "l2.door4B": "Remote roles with in-house training and recurring commissions. Working with us, not for us.",
    "l2.door4Cta": "See the roles",

    "l2.chPaths": "Three paths",
    "l2.pathsTitle": "Pick yours.",
    "l2.pathsSub":
      "People don't all arrive here for the same reason, and the page shouldn't pretend they do.",
    "l2.path1K": "Path one",
    "l2.path1T": "Learn",
    "l2.path1B":
      "Live classes every week, with the name of whoever teaches them. Markets on one side, personal brand and business on the other — and an assessment with a certificate at the end.",
    "l2.path1W": "For people arriving knowing nothing",
    "l2.path2K": "Path two",
    "l2.path2T": "Earn",
    "l2.path2B":
      "The tools that execute in your account while you work, and the ways to earn here without opening an order: we host your content, or we pay you for the people you bring.",
    "l2.path2W": "For people short on time",
    "l2.path3K": "Path three",
    "l2.path3T": "Access",
    "l2.path3B":
      "Walk into the room, ask, and get an answer. Live sessions with the educators, chats by area, and the AI mentor at three in the morning when nobody else is awake.",
    "l2.path3W": "For people who already tried alone",
    "l2.pathGo": "See this path",

    "l2.act1": "Learn",
    "l2.act1Sub": "Four areas with an educator and a weekly slot, across two fronts.",
    "l2.act2": "Earn",
    "l2.act2Sub": "What executes for you, and what pays you without opening an order.",
    "l2.act3": "Access",
    "l2.act3Sub": "The people, the rooms, and whoever built this.",

    "l2.chSafe": "First things first",
    "l2.safeTitle": "The account is yours. The money never passes through us.",
    "l2.safeSub":
      "It's the first question everyone asks, and it deserves an answer before we talk about prices.",
    "l2.safe1L": "The account",
    "l2.safe1T": "Opened in your name",
    "l2.safe1B":
      "You open the account at your broker, with your documents. We never touch the balance, never take deposits and never make withdrawals.",
    "l2.safe2L": "The permission",
    "l2.safe2T": "Only to place the order",
    "l2.safe2B":
      "What you authorise is placing the order in your account — nothing else. The lot comes out of your balance and your risk, not ours.",
    "l2.safe3L": "The exit",
    "l2.safe3T": "Switch it off whenever you want",
    "l2.safe3B":
      "Switching off actually stops it: positions stop being copied that instant. And monthly plans have no lock-in — you cancel in your profile in two clicks.",
    "l2.safeRisk":
      "Trading the markets carries risk of loss, and there are losing weeks. We are not licensed financial advisers and nothing here is personalised financial advice.",

    "l2.chAreas": "The areas",
    "l2.areasTitle": "Whoever teaches has a name.",
    "l2.areasTitle2": "And a time in the week.",
    "l2.areasSub":
      "Two fronts, and each one has live classes with the name of whoever teaches them. Some areas haven't opened yet — you'll know which before you pay.",
    "l2.pil1D":
      "Markets and money: learning to run them, and the tools that run them for you when you can't be there.",
    "l2.pil2D":
      "Building an audience and building a business: personal brand, content, and the ways to earn here without opening an order.",
    "l2.pilCountEdu": "{n} with an educator",
    "l2.pilCountNoEdu": "{n} with no classes of its own",
    "l2.pilCountSoon": "{n} opening",
    "l2.pilAlso": "also in this pillar",
    "l2.areasFam1": "With an educator and a weekly slot",
    "l2.areasFam2": "Opening",
    "l2.areasSoonTag": "in preparation",
    "l2.areasEducator": "educator",
    "l2.areasLive": "teaching",
    "l2.areasNoTeacher": "No classes of its own",
    "l2.areasGo": "See it in the live lobby",
    "l2.areasHint": "These areas open when the right educator turns up.",
    "l2.areasHintLink": "If that's you, apply",
    "l2.areasRisk":
      "The rooms and slots are the ones booked this week, counted one by one. An area with one room and one slot has only just started — if you're after a full archive of lessons, that isn't what you'll find there yet.",

    "l2.chFaq": "Before you decide",
    "l2.faqTitle": "The questions everybody asks",
    "l2.faqSub": "The same answers you'll find at {link} — no small print.",
    "l2.faq1Q": "Do I need to know anything about trading to start?",
    "l2.faq1A":
      "No. Most people arrive unable to read a chart. You start with Fast Start, move on to the 30-hour Bootcamp and, if you want, switch on automatic execution while you're still learning — that is precisely what it's there for.",
    "l2.faq2Q": "Do you hold my money?",
    "l2.faq2A":
      "Never. The account is yours, opened in your name at your broker, and the money never passes through us. What you authorise is the placing of the order — nothing more. You can disconnect at any moment, and disconnecting really does stop it: positions stop being copied from that instant.",
    "l2.faq3Q": "How much do I need to start?",
    "l2.faq3A":
      "The lot is sized by your balance, not ours, so there is no minimum imposed by us — there's your broker's minimum. What we ask is that you start with an amount you can lose without changing your life, because there are losing weeks and you will have some.",
    "l2.faq4Q": "What's the difference between Member and Premium?",
    "l2.faq4A":
      "Member gives you the app: community, chats, live sessions, training and certification. Premium adds everything that lives on the site — Premium signals, Tap to Trade, MTM Copy, the AI Terminal, portfolios and DCA, and the scanners. In short: Member is learning, Premium is learning and executing.",
    "l2.faq5Q": "How long am I locked in for?",
    "l2.faq5A":
      "You aren't. Monthly plans have no lock-in and you cancel in your profile in two clicks. There's a 7-day guarantee on monthly plans, and when you cancel you keep access until the end of the period you've already paid for. The annual plan is cheaper per month, but that's your choice — it isn't the only door.",
    "l2.faq6Q": "Is this guaranteed? How much will I make?",
    "l2.faq6A":
      "Nothing is guaranteed, and anyone guaranteeing you something is lying to you. What we show you are counts from our database, with the date next to them and with the negative accounts included in the count. The result in euros depends on your capital, your risk and how long you can leave alone what's going well. We are not licensed financial advisers and this is not personalised financial advice.",
    "l2.faq7Q": "I already pay on the site. Do I have to pay again in the app?",
    "l2.faq7A":
      "No. Access is the same on both sides: you sign into the app with the same login and what you've already paid counts there. There's only one subscription per person, whether it was taken out on the site or inside the app.",
    "l2.faq8Q": "What languages is the platform in?",
    "l2.faq8A":
      "The site and the app are translated into 21 languages, and live sessions carry subtitles translated into Portuguese, English, Spanish, French and German — live, while the educator is speaking.",
    "l2.faq9Q": "Is this only for people who want to trade?",
    "l2.faq9A":
      "No. There are live classes in four areas: Forex with Ricardo Garcia, Crypto with Ruben Pereira, and Social Media and UGC and Mindset and Leadership with our in-house educators — those two have just started, with one room and one weekly slot each. Stocks and ETFs have no classes of their own: they live in the portfolio, the Terminal and the chat channel. And Real Estate, Artificial Intelligence and Network Marketing are opening, still without an educator — we say so before you pay, not after.",
    "l2.faq10Q": "Can I earn here without opening a single order?",
    "l2.faq10A":
      "You can, two ways. If you make content, we host and sell your course or mentorship and you keep 90–95% of what it sells, with no entry fee and no exclusivity — you apply and we talk. And if you bring people, Refer and Earn gives you Premium days for every friend who joins through your link, with commission on the subscriptions that follow. The broker partnership (IB) is a different thing and isn't done through a form: it's a conversation, and only then do you join the network.",

    "l2.ch9": "The decision",
    "l2.packsTitle": "Choose by what you want to do",
    "l2.packsSub": "All monthly and with no lock-in. Cancel whenever you want.",
    "l2.packMember": "Member",
    "l2.packMemberPer": "per month · €28 on the annual plan",
    "l2.packMemberLine": "For those who want to learn and be with the community.",
    "l2.packMember2": "Feed, chats and live sessions",
    "l2.packMember3": "Training and certification",
    "l2.packPremium": "Premium",
    "l2.packPremiumFlag": "Most chosen",
    "l2.packPremiumPer": "per month · €52 on the annual plan",
    "l2.packPremiumLine": "For those who want the signals working in their account.",
    "l2.packPremium1": "Everything in Member",
    "l2.packPremium2": "Premium signals",
    "l2.packPremium3": "Tap to Trade and MTM Copy",
    "l2.packPremium4": "AI Terminal",
    "l2.packPremium5": "Portfolios and DCA",
    "l2.packPremium6": "Scanners included",
    "l2.packScanners": "Scanners",
    "l2.packScannersPer": "per month",
    "l2.packScannersLine": "Just the indicators — no app, no signals, no community.",
    "l2.packAuto": "MTM Auto",
    "l2.packAutoPer": "per month · free download",
    "l2.packAutoLine": "For beginners, or anyone from outside the ecosystem.",
    "l2.packAuto1": "Tap to Trade: accept each signal with one tap",
    "l2.packAuto2": "Or full auto copy, if you would rather not decide",
    "l2.packAuto3": "One live and one demo account included",
    "l2.packAuto4": "iOS, Android and web",
    "l2.packAutoFree": "Trading live with PU Prime? You pay nothing.",
    "l2.packAutoCta": "See the app",
    "l2.packEa": "MTM Sensei EA",
    "l2.packEaPer": "per year · or €1000 lifetime",
    "l2.packEaLine": "The robot running inside your MetaTrader 5, not on our account.",
    "l2.packEa1": "Twenty confirmations before every entry",
    "l2.packEa2": "Partials, breakeven and trailing, automatic",
    "l2.packEa3": "News filter and prop-firm mode",
    "l2.packEa4": "Installer for Windows and macOS",
    "l2.packEaFree": "Premium, VIP or Founder? It is included.",
    "l2.packEaCta": "See the EA",
    "l2.packSc": "Sensei Scalp Edition",
    "l2.packScPer": "per year · or €697 lifetime",
    "l2.packScLine": "A different EA from the Sensei EA — gold on M5, with its own licence.",
    "l2.packSc1": "Pending orders on both sides, on M5",
    "l2.packSc2": "Trailing from the first cent of profit",
    "l2.packSc3": "No fixed stop loss — the reversal closes it",
    "l2.packSc4": "Panel with fixed lot or percentage",
    "l2.packScFree": "Separate licence. Not part of any plan.",
    "l2.packScCta": "See the Scalp",
    "l2.packStart": "Get started",
    "l2.packSeeScanners": "See scanners",
    "l2.packsGuarantee": "7-day guarantee on monthly plans. No commitment to continue.",

    "l2.ctaBarTitle": "Start today from €35/month",
    "l2.ctaBarSub": "No lock-in · 7-day guarantee · cancel whenever you want",
    "l2.ctaBarVideo": "Watch the video",
    "l2.ctaBarPacks": "Choose my pack",
  },
}
