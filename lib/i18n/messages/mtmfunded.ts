import type { Lang } from "../config"

/**
 * Namespace i18n do MTM Funded e dos torneios.
 *
 * Os idiomas em falta caem para PT, por desenho do dicionário — e, nestas páginas, o seletor
 * do Google Translate cobre o resto enquanto a migração para dicionário nativo não chega a
 * cada componente. Este ficheiro é o que essa migração vai consumir, e já é a fonte das
 * peças de navegação.
 *
 * O que NÃO se traduz, de propósito: nomes de produtos («MTM Funded», «Trading Tournament»),
 * o texto do contrato (é um documento jurídico, e uma tradução aproximada de um contrato é
 * pior do que o original noutra língua) e os códigos de certificado.
 */
export const MTMFUNDED_MESSAGES: Partial<Record<Lang, Record<string, string>>> = {
  pt: {
    "mtmfunded.nav.programas": "Programas",
    "mtmfunded.nav.torneio": "Torneio",
    "mtmfunded.nav.faq": "FAQ",
    "mtmfunded.nav.area": "A minha área",

    "mtmfunded.hero.kicker": "More Than Money",
    "mtmfunded.hero.titulo": "Prova o que vales numa conta avaliada.",
    "mtmfunded.hero.sub":
      "Escolhes o tamanho, negoceias com as regras à vista, e as métricas actualizam sozinhas. Sem letra pequena e sem promessas de rendimento.",
    "mtmfunded.hero.ver": "Ver os programas",
    "mtmfunded.hero.torneio": "Torneio gratuito",

    "mtmfunded.facto.simuladas": "Contas simuladas",
    "mtmfunded.facto.simuladasNota":
      "Dinheiro virtual. Não há fundos de participantes em lado nenhum.",
    "mtmfunded.facto.regras": "Regras publicadas",
    "mtmfunded.facto.regrasNota": "Antes de te inscreveres, e não mudam a meio da prova.",
    "mtmfunded.facto.classificacao": "Classificação pública",
    "mtmfunded.facto.classificacaoNota":
      "Actualiza de hora a hora, com o motivo à vista de quem não conta.",

    "mtmfunded.escada.titulo": "Escolhe o tamanho — e o caminho",
    "mtmfunded.escada.conta": "Conta",
    "mtmfunded.escada.caminho": "Caminho",
    "mtmfunded.escada.objetivo": "Objectivo",
    "mtmfunded.escada.perdaDiaria": "Perda diária",
    "mtmfunded.escada.perdaMaxima": "Perda máxima",
    "mtmfunded.escada.diasMin": "Dias mín.",
    "mtmfunded.escada.preco": "Preço",
    "mtmfunded.escada.comecar": "Começar",
    "mtmfunded.escada.brevemente": "Brevemente",
    "mtmfunded.escada.umaFase": "1 fase · difícil",
    "mtmfunded.escada.duasFases": "2 fases",

    "mtmfunded.passos.titulo": "Como funciona",
    "mtmfunded.regras.titulo": "O que podes e não podes fazer",
    "mtmfunded.regras.titulo2": "Regras claras, sem letra pequena",
    "mtmfunded.certificados.titulo": "Certificados",
    "mtmfunded.certificados.verificar": "verificar",
    "mtmfunded.certificados.exemplar": "exemplar",

    "mtmfunded.entrar.titulo": "Entrar",
    "mtmfunded.entrar.criar": "Criar conta",
    "mtmfunded.entrar.jaTenho": "Já tenho conta",
    "mtmfunded.entrar.naoTenho": "Ainda não tenho conta",
    "mtmfunded.entrar.email": "Email",
    "mtmfunded.entrar.password": "Palavra-passe",

    "mtmfunded.conta.primeiroNome": "Primeiro nome",
    "mtmfunded.conta.apelido": "Apelido",
    "mtmfunded.conta.pais": "País",
    "mtmfunded.conta.telemovel": "Telemóvel",
    "mtmfunded.conta.nascimento": "Data de nascimento",

    "mtmfunded.painel.dashboard": "Dashboard",
    "mtmfunded.painel.contas": "Contas de Trading",
    "mtmfunded.painel.contratos": "Contratos",
    "mtmfunded.painel.levantamentos": "Levantamentos",
    "mtmfunded.painel.competicoes": "Competições",
    "mtmfunded.painel.classificacao": "Classificação",
    "mtmfunded.painel.terminal": "Terminal MTM",
    "mtmfunded.painel.certificados": "Certificados",
    "mtmfunded.painel.comunidade": "Comunidade",
    "mtmfunded.painel.apoio": "Apoio",

    "mtmfunded.levantar.pedir": "Pedir levantamento",
    "mtmfunded.levantar.disponivel": "Levantável",
    "mtmfunded.levantar.almofada": "Almofada (3%)",
    "mtmfunded.levantar.copiar": "copiar",
    "mtmfunded.levantar.copiado": "copiado",

    "mtmfunded.rodape.produto": "Produto",
    "mtmfunded.rodape.legal": "Legal",
    "mtmfunded.rodape.risco": "Aviso de risco",

    // ── rodapé ──
    "mtmfunded.rodape.tagline": "Avaliação de traders em contas simuladas. Regras publicadas, métricas à vista.",
    "mtmfunded.rodape.avisoTitulo": "Aviso de risco",
    "mtmfunded.rodape.aviso": "Todas as contas do MTM Funded — de torneio, de avaliação e financiadas — são contas de demonstração, com dinheiro virtual. Não há execução em mercado real, não são depositados nem geridos fundos de participantes, e nada aqui é aconselhamento financeiro ou de investimento. Nas contas financiadas, o Fundo MTM aloca capital real correspondente a 10% do valor nominal da conta, e a participação nos resultados é de 75% para o trader.",
    "mtmfunded.rodape.termos": "Termos e Condições",
    "mtmfunded.rodape.privacidade": "Privacidade",
    "mtmfunded.rodape.reembolsos": "Reembolsos",
    "mtmfunded.rodape.tt": "Trading Tournament",
    "mtmfunded.rodape.faq": "Perguntas frequentes",

    // ── painel ──
    "mtmfunded.painel.ola": "Olá",
    "mtmfunded.painel.admin": "Admin",
    "mtmfunded.painel.inscrever": "Inscrever-me",
    "mtmfunded.painel.aInscrever": "A inscrever…",
    "mtmfunded.painel.mostrarCred": "Mostrar credenciais",
    "mtmfunded.painel.aLer": "A ler…",
    "mtmfunded.painel.esconder": "Esconder",
    "mtmfunded.painel.login": "Login",
    "mtmfunded.painel.servidor": "Servidor",
    "mtmfunded.painel.palavraPasse": "Palavra-passe",
    "mtmfunded.painel.investidor": "Investidor (só leitura)",
    "mtmfunded.painel.qrToque": "Entrar na app com um toque",
    "mtmfunded.painel.qrComo": "No MetaTrader 5 do telemóvel: Nova conta → Entrar com código QR.",
    "mtmfunded.painel.semContas": "Ainda não tens contas.",
    "mtmfunded.painel.aEmitir": "a emitir",
    "mtmfunded.painel.saldoInicial": "Saldo inicial",
    "mtmfunded.painel.alavancagem": "Alavancagem",
    "mtmfunded.painel.estado": "Estado",
    "mtmfunded.painel.equity": "Equity",
    "mtmfunded.painel.posicao": "Posição",
    "mtmfunded.painel.resultado": "Resultado",
    "mtmfunded.painel.semTorneio": "Não há torneio a decorrer.",
    "mtmfunded.painel.credBloqueadas": "As credenciais desta conta abrem na véspera do torneio.",

    // ── levantamentos ──
    "mtmfunded.levantar.titulo": "Como se levanta",
    "mtmfunded.levantar.quota": "75% do lucro é teu.",
    "mtmfunded.levantar.quotaNota": "Os 25% restantes ficam para a MTM, que suporta o capital real, a infraestrutura e o risco.",
    "mtmfunded.levantar.almofadaNota": "Só é levantável o que passar de 3% de lucro sobre o saldo inicial. A almofada fica na tua conta e continua a ser tua para negociar — não é uma retenção.",
    "mtmfunded.levantar.pagamento": "Pagamento por depósito na PU Prime.",
    "mtmfunded.levantar.pagamentoNota": "Em USDC, rede Solana, para o endereço que a própria corretora gera na tua conta.",
    "mtmfunded.levantar.semContrato": "Falta assinar o contrato",
    "mtmfunded.levantar.irContrato": "Ir ao contrato",
    "mtmfunded.levantar.enviar": "Enviar pedido",
    "mtmfunded.levantar.cancelar": "Cancelar",

    // ── contrato ──
    "mtmfunded.contrato.titulo": "Contrato de Trader Financiado",
    "mtmfunded.contrato.assinado": "Assinado",
    "mtmfunded.contrato.assinar": "Assinar contrato",
    "mtmfunded.contrato.aAssinar": "A assinar…",
    "mtmfunded.contrato.nomeCompleto": "Nome completo",
    "mtmfunded.contrato.aviso": "Assina para poderes pedir levantamentos. É o documento que diz em que termos é que o dinheiro sai — vale a pena lê-lo antes de assinar, não depois.",

    // ── página /mtmfunded ────────────────────────────────────────────────
    "mtmfunded.hero.tituloA": "Prova o que vales numa",
    "mtmfunded.hero.tituloB": "conta avaliada",
    "mtmfunded.escada.sub1": "Dois caminhos, os mesmos tamanhos de conta.",
    "mtmfunded.escada.umaFaseB": "Uma fase",
    "mtmfunded.escada.sub2": "é o caminho rápido: pede mais lucro e perdoa menos perda.",
    "mtmfunded.escada.duasFasesB": "Duas fases",
    "mtmfunded.escada.sub3": "pede menos de cada vez, com mais tempo para o fazer.",
    "mtmfunded.escada.fechadas":
      "As inscrições nos programas abrem em breve. Entretanto, o torneio trimestral é gratuito e tem conta avaliada.",
    "mtmfunded.escada.aPreparar": "Os programas estão a ser preparados.",
    "mtmfunded.escada.fase": "fase",
    "mtmfunded.escada.fases": "fases",
    "mtmfunded.escada.consistencia": "Consistência: máx.",
    "mtmfunded.passos.p1t": "Escolhes e recebes a conta",
    "mtmfunded.passos.p1x":
      "Escolhes a plataforma: MTM Funded (conta activa na hora, WebTrader, credenciais por link seguro) ou MetaTrader 5 (conta demo na corretora, criada em até 24 horas e enviada por email).",
    "mtmfunded.passos.p2t": "Negoceias com as regras à vista",
    "mtmfunded.passos.p2x":
      "O painel mostra quanto falta até cada limite. Tudo medido sobre equity — as posições abertas contam.",
    "mtmfunded.passos.p3t": "Passas, e o certificado é teu",
    "mtmfunded.passos.p3x":
      "Cumprindo os objectivos, sais com um certificado verificável e o caminho aberto para uma conta financiada da MTM.",
    "mtmfunded.regras.sub": "Quatro regras. Iguais para todas as contas — e nunca mudam a meio da tua avaliação.",
    "mtmfunded.regras.r1t": "Perda diária",
    "mtmfunded.regras.r1x":
      "Mede-se sobre a equity com que o dia abriu. Chegando ao limite, a conta congela na posição em que estava — não há liquidação-surpresa nem margem escondida.",
    "mtmfunded.regras.r2t": "Perda máxima total",
    "mtmfunded.regras.r2x":
      "Sobre o saldo inicial. É o chão da conta. Nunca é maior do que a diária, por construção: uma diária acima da máxima seria uma regra que nunca chegava a disparar.",
    "mtmfunded.regras.r3t": "Dias mínimos",
    "mtmfunded.regras.r3x":
      "Um resultado feito num dia não prova nada. Abaixo dos dias mínimos o resultado não conta, e a classificação diz-te porquê em vez de te deixar a adivinhar.",
    "mtmfunded.regras.r4t": "Consistência",
    "mtmfunded.regras.r4x":
      "Nenhum dia pode valer mais do que uma fatia do lucro total. Passa quem repete, não quem acertou uma vez.",
    "mtmfunded.regras.negSub":
      "Valem para todas as contas, na avaliação e depois de financiada. Estão aqui antes de comprares — não escondidas numa página que só se lê quando já é tarde.",
    "mtmfunded.certificados.sub":
      "Cada um tem um código que qualquer pessoa pode verificar, sem conta e sem pedir nada a ninguém. É isso que os faz valer alguma coisa fora daqui.",
    "mtmfunded.torneio.gratuito": "Gratuito",
    "mtmfunded.torneio.subA": "Torneio trimestral com conta avaliada de",
    "mtmfunded.torneio.subB":
      "USD, sem custo. As mesmas regras, uma classificação pública, e prémios para o pódio.",
    "mtmfunded.torneio.abertas": "Inscrições abertas",
    "mtmfunded.torneio.ver": "Ver o torneio",

    // ── página do torneio ────────────────────────────────────────────────
    "tt.kicker": "MoreThanMoney apresenta",
    "tt.lema": "Trade · Evolve · Earn",
    "tt.abertas": "Inscrições abertas",
    "tt.fecham": "fecham",
    "tt.semTorneioT": "O próximo torneio está a ser preparado",
    "tt.semTorneioX": "Os torneios são trimestrais. Assim que as inscrições abrirem, aparecem aqui.",
    "tt.comeca": "Começa",
    "tt.termina": "Termina",
    "tt.conta": "Conta",
    "tt.regras": "Regras",
    "tt.perdaDiaria": "Perda diária máxima:",
    "tt.perdaMaxima": "Perda máxima total:",
    "tt.diasMinimos": "Dias mínimos de negociação:",
    "tt.consistenciaA": "Nenhum dia acima de",
    "tt.consistenciaB": "do lucro",
    "tt.equityNota":
      "Tudo medido sobre equity — as posições abertas contam. Quebrar uma regra congela a conta na posição em que estava.",
    "tt.lugar": ".º lugar",
    "tt.inscrever": "Inscrever-me",
    "tt.minhaArea": "A minha área",
    "tt.p1t": "Inscreves-te",
    "tt.p1x": "Gratuito. Pedimos os dados que a corretora exige para emitir a conta.",
    "tt.p2t": "Recebes a conta",
    "tt.p2x": "Por email, com um código QR que entra na app do MetaTrader com um toque.",
    "tt.p3t": "Competes",
    "tt.p3x": "A classificação actualiza de hora a hora e diz sempre porque é que alguém não conta.",
    "tt.demoA": "A conta é de",
    "tt.demoB": "demonstração",
    "tt.demoC":
      ", com dinheiro virtual. Não depositas nada e não há execução em mercado real. O que se avalia é a forma como negoceias.",
    "tt.classificacao": "Classificação",
    "tt.atualizadaAs": "Actualizada às",
    "tt.deHoraEmHora": "de hora a hora",
    "tt.atualizaHora": "Actualiza de hora a hora",
    "tt.semParticipantes": "Ainda não há participantes classificados.",
    "tt.participante": "Participante",
    "tt.email": "Email",
    "tt.resultado": "Resultado",
    "tt.estado": "Estado",
    "tt.quebrada": "conta quebrada",
    "tt.aContar": "a contar",
    "tt.porClassificar": "por classificar",

    // ── FAQ ──────────────────────────────────────────────────────────────
    "faq.titulo": "Perguntas frequentes",
    "faq.subA": "Sobre o MTM Funded e os torneios. Para o resto,",
    "faq.q1p": "O dinheiro das contas é real?",
    "faq.q1r":
      "Não. Todas as contas do MTM Funded — de torneio e de avaliação — são contas de demonstração, com dinheiro virtual. As ordens não chegam a nenhum mercado real e ninguém deposita fundos numa conta nossa. O que se avalia é a forma como negoceia.",
    "faq.q2p": "Quanto custa participar no torneio?",
    "faq.q2r": "Nada. Os torneios são gratuitos, com conta emitida por nós.",
    "faq.q3p": "Quando começa o próximo torneio?",
    "faq.q3r": "O {nome} decorre de {inicio} a {fim}, com conta de {saldo} USD. {inscricoes}",
    "faq.q3abertas": "As inscrições estão abertas{ate}.",
    "faq.q3ate": " até {data}",
    "faq.q3decorrer": "As inscrições estão fechadas — o próximo é trimestral.",
    "faq.q3embreve": "As inscrições abrem em breve.",
    "faq.q3semP": "Quando é o próximo torneio?",
    "faq.q3semR":
      "Os torneios são trimestrais. Assim que o próximo abrir, aparece nesta página e na página do torneio.",
    "faq.q4p": "Como me inscrevo?",
    "faq.q4r":
      "Entra na [tua área](/mtmfunded/tradingtournament/dashboard) e preenche a inscrição. Pedimos o nome que queres na classificação, o telemóvel e a data de nascimento — as duas últimas porque a corretora as exige para emitir a conta.",
    "faq.q5p": "Quanto tempo demora a receber a conta?",
    "faq.q5r":
      "Não é imediato. As contas são criadas uma a uma no MetaTrader e as credenciais seguem por email assim que cada uma estiver pronta. Enquanto isso, o painel mostra a conta como «a emitir».",
    "faq.q6p": "Quais são as regras?",
    "faq.q6r": "Tudo medido sobre equity — as posições abertas contam:",
    "faq.q6diaria": "Perda diária máxima: {v}%",
    "faq.q6maxima": "Perda máxima total: {v}%",
    "faq.q6dias": "Dias mínimos de negociação: {v}",
    "faq.q6consistencia": "Nenhum dia acima de {v}% do lucro total",
    "faq.q7p": "O que acontece se quebrar uma regra?",
    "faq.q7r":
      "A conta congela na posição em que estava e o motivo fica à vista no teu painel. A conta não é reaberta — entras no torneio seguinte. Não há penalização nenhuma além disso.",
    "faq.q8p": "Porque é que a minha posição não conta?",
    "faq.q8r":
      "A classificação mostra o motivo ao lado de cada participante. Normalmente é por ainda não teres os dias mínimos de negociação, ou por concentração — um único dia a representar demasiado do lucro total. Ambos se resolvem continuando a negociar.",
    "faq.q9p": "Com que frequência actualiza a classificação?",
    "faq.q9r": "De hora a hora. A hora da última leitura está no fundo da tabela.",
    "faq.q10p": "O meu email fica público?",
    "faq.q10r":
      "Não. A tabela mostra-o censurado, e a censura é feita no servidor — o email completo nunca chega ao browser de quem consulta a classificação.",
    "faq.q11p": "Posso usar robôs ou copiar sinais?",
    "faq.q11r":
      "As regras de cada programa dizem o que é permitido. O que é sempre motivo de desqualificação está nos [Termos](/mtmfunded/legal/termos): explorar falhas da plataforma, coordenar posições opostas entre contas e negociar a conta de outra pessoa.",
    "faq.q12p": "Recebo certificado?",
    "faq.q12r":
      "Sim. Os certificados são emitidos no fim de cada torneio, ficam na tua área e cada um tem um código que qualquer pessoa pode verificar.",
    "faq.q13p": "Qual é a diferença entre o torneio e um programa de avaliação?",
    "faq.q13r":
      "O torneio é gratuito, trimestral e competitivo: vale a tua posição face aos outros. Um programa de avaliação é pago, individual e sem prazo de competição — vale o cumprimento dos objectivos publicados.",
    "faq.q14p": "Como funciona uma conta financiada da MTM?",
    "faq.q14r":
      "A negociação é **simulada do princípio ao fim** — não há ordens tuas a chegar ao mercado. O que é real é o capital que o Fundo MTM afecta à conta: **10% do valor nominal**. Numa conta financiada de 10.000 USD, isso são 1.000 USD reais alocados pela MTM. É desse capital e do desempenho que ele produz que saem os teus pagamentos.",
    "faq.q15p": "Quanto é que eu recebo do que ganho?",
    "faq.q15r":
      "**75% do lucro é teu**, 25% ficam para a MTM. Os 25% pagam o capital real que a MTM põe, a infraestrutura e o risco — sem isso não haveria conta financiada nenhuma para financiar.",
    "faq.q16p": "O que é a almofada de 3%?",
    "faq.q16r":
      "Só é levantável o que passar de **3% de lucro sobre o saldo inicial** da conta. A almofada não é uma retenção: fica na tua conta e continua a ser tua para negociar. Existe para que a conta não regresse ao ponto de partida a cada levantamento — e para que a MTM acumule o capital que financia os traders seguintes.",
    "faq.q17p": "Como recebo o dinheiro?",
    "faq.q17r":
      "Por **depósito na tua conta da PU Prime**, a corretora parceira, em USDC na rede Solana. No pedido indicas o UID da tua conta e anexas o print do menu de depósito, com o endereço e o valor visíveis. O endereço nunca é escrito à mão por ninguém: é o que a corretora gerou, tal como aparece no print. Um pagamento em cripto enviado para um endereço errado não se recupera.",
    "faq.q18p": "Preciso de assinar alguma coisa antes de levantar?",
    "faq.q18r":
      "Sim: o **contrato de trader financiado**, na tua área, em Contratos. Confirmas aí o teu nome completo e a data de nascimento — tens de ter 18 anos ou mais. Sem contrato assinado o pedido de levantamento nem chega a ser aceite.",
    "faq.q19p": "Posso usar robôs, copytrading ou negociar em notícias?",
    "faq.q19r":
      "**Notícias, sim** — não fechamos janelas à volta de indicadores. **Robôs (EA)**: podes usá-los para passar a avaliação, mas não na conta financiada — o que se financia é o teu critério. **Copytrading**: só sincronizado com o MTM Auto, porque aí a origem e a gestão são conhecidas. Copiar sinais de fora não mostra nada sobre quem os copia.",
    "faq.q20p": "Que outras regras de negociação existem?",
    "faq.q20r":
      "Mínimo de **2 minutos por operação**, risco máximo de **1,5% por operação**, máximo de **3 posições** no mesmo par e direcção, e **sem hedge** — nem na mesma conta nem entre contas.",
    "faq.q21p": "Isto é aconselhamento financeiro?",
    "faq.q21r":
      "Não. O MTM Funded não é corretora nem empresa de investimento e não presta aconselhamento. Lê o [Aviso de Risco](/mtmfunded/legal/risco).",

    // ── formulários (dados da conta, entrar, checkout) ───────────────────
    "mtmfunded.conta.primeiroNomeNota": "Como consta no teu documento.",
    "mtmfunded.conta.apelidoNota": "O último apelido chega.",
    "mtmfunded.conta.paisNota": "Define o indicativo.",
    "mtmfunded.conta.telemovelNota": "Sem o indicativo — esse vem do país.",
    "mtmfunded.conta.nascimentoNota": "Exigida pela corretora. Tens de ser maior de idade.",
    "mtmfunded.entrar.subEntrar": "Se já tens conta MoreThanMoney, é a mesma.",
    "mtmfunded.entrar.subCriar":
      "Uma conta para o MTM Funded. Serve também no morethanmoney.pt, se um dia quiseres.",
    "mtmfunded.entrar.passwordNota": "Pelo menos 8 caracteres.",
    "mtmfunded.entrar.momento": "Um momento…",
    "mtmfunded.entrar.erroCredenciais": "Email ou palavra-passe errados",
    "mtmfunded.entrar.erroCriar": "Não foi possível criar a conta",
    "mtmfunded.entrar.erroGeral": "Não foi possível continuar",
    "mtmfunded.checkout.total": "Total",
    "mtmfunded.checkout.temCupao": "Tens um cupão?",
    "mtmfunded.checkout.codigo": "CÓDIGO",
    "mtmfunded.checkout.aplicar": "Aplicar",
    "mtmfunded.checkout.cupaoInvalido": "Cupão inválido",
    "mtmfunded.checkout.aAbrir": "A abrir o pagamento…",
    "mtmfunded.checkout.erroPagamento": "Não foi possível abrir o pagamento",

    "mtmfunded.entrar.dadosTitulo": "Dados da conta de negociação",
    "mtmfunded.entrar.dadosNota":
      "Pedidos pela corretora para emitir a conta. Ficam guardados — não voltas a preenchê-los ao inscreveres-te num torneio ou ao comprares um desafio.",
    "mtmfunded.entrar.aceitasA": "Ao continuar aceitas os",
    "mtmfunded.entrar.termos": "Termos",
    "mtmfunded.entrar.aceitasB": "e a",
    "mtmfunded.entrar.privacidade": "Privacidade",
    "mtmfunded.entrar.aceitasC": "do MTM Funded.",
    // ── plataforma (checkout + página) ──
    "mtmfunded.plataforma.titulo": "Plataforma",
    "mtmfunded.plataforma.recomendada": "Recomendada",
    "mtmfunded.plataforma.simNota":
      "O nosso servidor simulado. A conta fica activa assim que o pagamento é confirmado; negoceias no WebTrader e recebes as credenciais por um link seguro (nunca a password por email).",
    "mtmfunded.plataforma.mt5Nota":
      "Conta demo na corretora, para negociares na app MetaTrader 5. É criada pela nossa fila automática em até {h} horas (normalmente menos de uma) e as credenciais chegam por email.",
    "mtmfunded.plataforma.igual":
      "As regras, o preço e os objectivos são os mesmos nas duas. Em ambas a negociação é simulada — dinheiro virtual. A plataforma fica para as fases seguintes e para a conta financiada.",
    "mtmfunded.plataforma.contaSimulada": "conta simulada",
    "mtmfunded.plataforma.iosSemCheckout":
      "Na app iOS não é possível comprar programas. Abre morethanmoney.pt/mtmfunded no browser para concluir a compra — a conta aparece depois na app.",
    "mtmfunded.plataforma.nenhuma": "Neste momento não há plataformas disponíveis para compra. Volta a tentar mais tarde.",
    "mtmfunded.plataforma.secTitulo": "Duas plataformas, as mesmas regras",
    "mtmfunded.plataforma.secSub":
      "Escolhes no checkout. Em ambas a conta é simulada, as regras são as publicadas nesta página e os resultados medem-se em percentagem e pips — não prometemos rendimento.",
    "mtmfunded.plataforma.simT": "MTM Funded",
    "mtmfunded.plataforma.simX1": "Conta activa assim que o pagamento é confirmado — e mais barata do que a conta na corretora",
    "mtmfunded.plataforma.simX2": "WebTrader no browser, com as métricas das regras ao vivo",
    "mtmfunded.plataforma.simX3": "Credenciais por link seguro, sem passwords no email",
    "mtmfunded.plataforma.mt5T": "MetaTrader 5",
    "mtmfunded.plataforma.mt5X1": "Conta demo na corretora, na app MetaTrader 5 que já conheces",
    "mtmfunded.plataforma.mt5X2": "Criada em até 24 horas (normalmente menos de uma); credenciais por email",
    "mtmfunded.plataforma.mt5X3": "Métricas lidas periodicamente; as regras são verificadas com mais frequência enquanto houver posições abertas",
    "mtmfunded.plataforma.brevemente": "Brevemente",
    "mtmfunded.plataforma.desde": "Desde",
    "mtmfunded.plataforma.maisBarata": "mais barata do que a conta na corretora",
  },
  en: {
    "mtmfunded.nav.programas": "Programs",
    "mtmfunded.nav.torneio": "Tournament",
    "mtmfunded.nav.faq": "FAQ",
    "mtmfunded.nav.area": "My area",

    "mtmfunded.hero.kicker": "More Than Money",
    "mtmfunded.hero.titulo": "Prove what you're worth on an evaluated account.",
    "mtmfunded.hero.sub":
      "You pick the size, you trade with the rules in plain sight, and the metrics update on their own. No small print and no promises of returns.",
    "mtmfunded.hero.ver": "See the programs",
    "mtmfunded.hero.torneio": "Free tournament",

    "mtmfunded.facto.simuladas": "Simulated accounts",
    "mtmfunded.facto.simuladasNota": "Virtual money. No participant funds are held anywhere.",
    "mtmfunded.facto.regras": "Published rules",
    "mtmfunded.facto.regrasNota": "Before you sign up, and they don't change mid-challenge.",
    "mtmfunded.facto.classificacao": "Public leaderboard",
    "mtmfunded.facto.classificacaoNota":
      "Updated hourly, and it says why anyone isn't counting yet.",

    "mtmfunded.escada.titulo": "Pick the size — and the path",
    "mtmfunded.escada.conta": "Account",
    "mtmfunded.escada.caminho": "Path",
    "mtmfunded.escada.objetivo": "Target",
    "mtmfunded.escada.perdaDiaria": "Daily loss",
    "mtmfunded.escada.perdaMaxima": "Max loss",
    "mtmfunded.escada.diasMin": "Min. days",
    "mtmfunded.escada.preco": "Price",
    "mtmfunded.escada.comecar": "Start",
    "mtmfunded.escada.brevemente": "Coming soon",
    "mtmfunded.escada.umaFase": "1 phase · hard",
    "mtmfunded.escada.duasFases": "2 phases",

    "mtmfunded.passos.titulo": "How it works",
    "mtmfunded.regras.titulo": "What you can and can't do",
    "mtmfunded.regras.titulo2": "Clear rules, no small print",
    "mtmfunded.certificados.titulo": "Certificates",
    "mtmfunded.certificados.verificar": "verify",
    "mtmfunded.certificados.exemplar": "sample",

    "mtmfunded.entrar.titulo": "Sign in",
    "mtmfunded.entrar.criar": "Create account",
    "mtmfunded.entrar.jaTenho": "I already have an account",
    "mtmfunded.entrar.naoTenho": "I don't have an account yet",
    "mtmfunded.entrar.email": "Email",
    "mtmfunded.entrar.password": "Password",

    "mtmfunded.conta.primeiroNome": "First name",
    "mtmfunded.conta.apelido": "Last name",
    "mtmfunded.conta.pais": "Country",
    "mtmfunded.conta.telemovel": "Mobile phone",
    "mtmfunded.conta.nascimento": "Date of birth",

    "mtmfunded.painel.dashboard": "Dashboard",
    "mtmfunded.painel.contas": "Trading Accounts",
    "mtmfunded.painel.contratos": "Contracts",
    "mtmfunded.painel.levantamentos": "Withdrawals",
    "mtmfunded.painel.competicoes": "Competitions",
    "mtmfunded.painel.classificacao": "Leaderboard",
    "mtmfunded.painel.terminal": "MTM Terminal",
    "mtmfunded.painel.certificados": "Certificates",
    "mtmfunded.painel.comunidade": "Community",
    "mtmfunded.painel.apoio": "Support",

    "mtmfunded.levantar.pedir": "Request withdrawal",
    "mtmfunded.levantar.disponivel": "Withdrawable",
    "mtmfunded.levantar.almofada": "Cushion (3%)",
    "mtmfunded.levantar.copiar": "copy",
    "mtmfunded.levantar.copiado": "copied",

    "mtmfunded.rodape.produto": "Product",
    "mtmfunded.rodape.legal": "Legal",
    "mtmfunded.rodape.risco": "Risk warning",

    // ── footer ──
    "mtmfunded.rodape.tagline": "Trader evaluation on simulated accounts. Published rules, visible metrics.",
    "mtmfunded.rodape.avisoTitulo": "Risk warning",
    "mtmfunded.rodape.aviso": "Every MTM Funded account — tournament, evaluation and funded — is a demo account with virtual money. There is no execution in a real market, no participant funds are deposited or managed, and nothing here is financial or investment advice. On funded accounts, the MTM Fund allocates real capital equal to 10% of the account's nominal value, and the profit split is 75% to the trader.",
    "mtmfunded.rodape.termos": "Terms and Conditions",
    "mtmfunded.rodape.privacidade": "Privacy",
    "mtmfunded.rodape.reembolsos": "Refunds",
    "mtmfunded.rodape.tt": "Trading Tournament",
    "mtmfunded.rodape.faq": "Frequently asked questions",

    // ── panel ──
    "mtmfunded.painel.ola": "Hello",
    "mtmfunded.painel.admin": "Admin",
    "mtmfunded.painel.inscrever": "Sign up",
    "mtmfunded.painel.aInscrever": "Signing up…",
    "mtmfunded.painel.mostrarCred": "Show credentials",
    "mtmfunded.painel.aLer": "Reading…",
    "mtmfunded.painel.esconder": "Hide",
    "mtmfunded.painel.login": "Login",
    "mtmfunded.painel.servidor": "Server",
    "mtmfunded.painel.palavraPasse": "Password",
    "mtmfunded.painel.investidor": "Investor (read only)",
    "mtmfunded.painel.qrToque": "Sign in to the app with one tap",
    "mtmfunded.painel.qrComo": "In MetaTrader 5 on your phone: New account → Sign in with QR code.",
    "mtmfunded.painel.semContas": "You don't have any accounts yet.",
    "mtmfunded.painel.aEmitir": "being issued",
    "mtmfunded.painel.saldoInicial": "Starting balance",
    "mtmfunded.painel.alavancagem": "Leverage",
    "mtmfunded.painel.estado": "Status",
    "mtmfunded.painel.equity": "Equity",
    "mtmfunded.painel.posicao": "Position",
    "mtmfunded.painel.resultado": "Result",
    "mtmfunded.painel.semTorneio": "No tournament running.",
    "mtmfunded.painel.credBloqueadas": "This account's credentials unlock the day before the tournament.",

    // ── withdrawals ──
    "mtmfunded.levantar.titulo": "How withdrawals work",
    "mtmfunded.levantar.quota": "75% of the profit is yours.",
    "mtmfunded.levantar.quotaNota": "The other 25% goes to MTM, which carries the real capital, the infrastructure and the risk.",
    "mtmfunded.levantar.almofadaNota": "Only what goes beyond 3% profit on the starting balance is withdrawable. The cushion stays in your account and remains yours to trade — it is not withheld.",
    "mtmfunded.levantar.pagamento": "Paid as a deposit into PU Prime.",
    "mtmfunded.levantar.pagamentoNota": "In USDC, Solana network, to the address the broker itself generates in your account.",
    "mtmfunded.levantar.semContrato": "The contract isn't signed yet",
    "mtmfunded.levantar.irContrato": "Go to the contract",
    "mtmfunded.levantar.enviar": "Send request",
    "mtmfunded.levantar.cancelar": "Cancel",

    // ── contract ──
    "mtmfunded.contrato.titulo": "Funded Trader Contract",
    "mtmfunded.contrato.assinado": "Signed",
    "mtmfunded.contrato.assinar": "Sign contract",
    "mtmfunded.contrato.aAssinar": "Signing…",
    "mtmfunded.contrato.nomeCompleto": "Full name",
    "mtmfunded.contrato.aviso": "Sign this so you can request withdrawals. It is the document that sets out the terms on which money leaves — worth reading before signing, not after.",

    // ── /mtmfunded page ──────────────────────────────────────────────────
    "mtmfunded.hero.tituloA": "Show what you are worth in an",
    "mtmfunded.hero.tituloB": "evaluated account",
    "mtmfunded.escada.sub1": "Two routes, the same account sizes.",
    "mtmfunded.escada.umaFaseB": "One phase",
    "mtmfunded.escada.sub2": "is the fast route: it asks for more profit and forgives less loss.",
    "mtmfunded.escada.duasFasesB": "Two phases",
    "mtmfunded.escada.sub3": "asks for less at a time, with more room to get there.",
    "mtmfunded.escada.fechadas":
      "Programme sign-ups open shortly. In the meantime, the quarterly tournament is free and runs on an evaluated account.",
    "mtmfunded.escada.aPreparar": "The programmes are being prepared.",
    "mtmfunded.escada.fase": "phase",
    "mtmfunded.escada.fases": "phases",
    "mtmfunded.escada.consistencia": "Consistency: max.",
    "mtmfunded.passos.p1t": "You choose, and the account arrives",
    "mtmfunded.passos.p1x":
      "You choose the platform: MTM Funded (account active instantly, WebTrader, credentials via a secure link) or MetaTrader 5 (broker demo account, created within 24 hours and sent by email).",
    "mtmfunded.passos.p2t": "You trade with the rules in plain sight",
    "mtmfunded.passos.p2x":
      "The dashboard shows how far you are from each limit. Everything is measured on equity — open positions count.",
    "mtmfunded.passos.p3t": "You pass, and the certificate is yours",
    "mtmfunded.passos.p3x":
      "Meet the targets and you leave with a verifiable certificate and the path open to an MTM funded account.",
    "mtmfunded.regras.sub": "Four rules. The same for every account — and they never change midway through your evaluation.",
    "mtmfunded.regras.r1t": "Daily loss",
    "mtmfunded.regras.r1x":
      "Measured against the equity the day opened with. Hit the limit and the account freezes where it stood — no surprise liquidation, no hidden margin.",
    "mtmfunded.regras.r2t": "Maximum total loss",
    "mtmfunded.regras.r2x":
      "Against the starting balance. It is the floor of the account. It is never larger than the daily one, by construction: a daily limit above the maximum would be a rule that never fired.",
    "mtmfunded.regras.r3t": "Minimum days",
    "mtmfunded.regras.r3x":
      "A result made in a single day proves nothing. Below the minimum days the result does not count, and the leaderboard tells you why instead of leaving you guessing.",
    "mtmfunded.regras.r4t": "Consistency",
    "mtmfunded.regras.r4x":
      "No single day may be worth more than a slice of the total profit. The ones who pass are the ones who repeat, not the ones who got it right once.",
    "mtmfunded.regras.negSub":
      "They apply to every account, during the evaluation and once funded. They are here before you buy — not buried in a page you only read when it is too late.",
    "mtmfunded.certificados.sub":
      "Each one carries a code anyone can verify, with no account and without asking anyone. That is what makes them worth something outside this site.",
    "mtmfunded.torneio.gratuito": "Free",
    "mtmfunded.torneio.subA": "Quarterly tournament with an evaluated account of",
    "mtmfunded.torneio.subB":
      "USD, at no cost. The same rules, a public leaderboard, and prizes for the podium.",
    "mtmfunded.torneio.abertas": "Sign-ups open",
    "mtmfunded.torneio.ver": "See the tournament",

    // ── tournament page ──────────────────────────────────────────────────
    "tt.kicker": "MoreThanMoney presents",
    "tt.lema": "Trade · Evolve · Earn",
    "tt.abertas": "Sign-ups open",
    "tt.fecham": "closing",
    "tt.semTorneioT": "The next tournament is being prepared",
    "tt.semTorneioX": "Tournaments are quarterly. As soon as sign-ups open, they show up here.",
    "tt.comeca": "Starts",
    "tt.termina": "Ends",
    "tt.conta": "Account",
    "tt.regras": "Rules",
    "tt.perdaDiaria": "Maximum daily loss:",
    "tt.perdaMaxima": "Maximum total loss:",
    "tt.diasMinimos": "Minimum trading days:",
    "tt.consistenciaA": "No single day above",
    "tt.consistenciaB": "of the profit",
    "tt.equityNota":
      "Everything is measured on equity — open positions count. Breaking a rule freezes the account exactly where it stood.",
    "tt.lugar": "place",
    "tt.inscrever": "Sign me up",
    "tt.minhaArea": "My area",
    "tt.p1t": "You sign up",
    "tt.p1x": "Free. We ask for the details the broker requires to issue the account.",
    "tt.p2t": "You get the account",
    "tt.p2x": "By email, with a QR code that signs you into the MetaTrader app with one tap.",
    "tt.p3t": "You compete",
    "tt.p3x": "The leaderboard updates hourly and always says why someone is not counting.",
    "tt.demoA": "The account is a",
    "tt.demoB": "demo",
    "tt.demoC":
      ", with virtual money. You deposit nothing and there is no live market execution. What is evaluated is how you trade.",
    "tt.classificacao": "Leaderboard",
    "tt.atualizadaAs": "Updated at",
    "tt.deHoraEmHora": "hourly",
    "tt.atualizaHora": "Updates hourly",
    "tt.semParticipantes": "No ranked participants yet.",
    "tt.participante": "Participant",
    "tt.email": "Email",
    "tt.resultado": "Result",
    "tt.estado": "Status",
    "tt.quebrada": "account breached",
    "tt.aContar": "counting",
    "tt.porClassificar": "unranked",

    // ── FAQ ──────────────────────────────────────────────────────────────
    "faq.titulo": "Frequently asked questions",
    "faq.subA": "About MTM Funded and the tournaments. For anything else,",
    "faq.q1p": "Is the money in the accounts real?",
    "faq.q1r":
      "No. Every MTM Funded account — tournament and evaluation alike — is a demo account with virtual money. Orders never reach a real market and nobody deposits funds into an account of ours. What is evaluated is how you trade.",
    "faq.q2p": "How much does entering the tournament cost?",
    "faq.q2r": "Nothing. Tournaments are free, with the account issued by us.",
    "faq.q3p": "When does the next tournament start?",
    "faq.q3r": "{nome} runs from {inicio} to {fim}, on a {saldo} USD account. {inscricoes}",
    "faq.q3abertas": "Sign-ups are open{ate}.",
    "faq.q3ate": " until {data}",
    "faq.q3decorrer": "Sign-ups are closed — the next one is quarterly.",
    "faq.q3embreve": "Sign-ups open shortly.",
    "faq.q3semP": "When is the next tournament?",
    "faq.q3semR":
      "Tournaments are quarterly. As soon as the next one opens, it shows up on this page and on the tournament page.",
    "faq.q4p": "How do I sign up?",
    "faq.q4r":
      "Go to [your area](/mtmfunded/tradingtournament/dashboard) and fill in the entry form. We ask for the name you want on the leaderboard, your mobile number and your date of birth — the last two because the broker requires them to issue the account.",
    "faq.q5p": "How long does the account take to arrive?",
    "faq.q5r":
      "It is not instant. Accounts are created one by one in MetaTrader and the credentials follow by email as soon as each one is ready. Meanwhile the dashboard shows the account as «being issued».",
    "faq.q6p": "What are the rules?",
    "faq.q6r": "Everything is measured on equity — open positions count:",
    "faq.q6diaria": "Maximum daily loss: {v}%",
    "faq.q6maxima": "Maximum total loss: {v}%",
    "faq.q6dias": "Minimum trading days: {v}",
    "faq.q6consistencia": "No single day above {v}% of total profit",
    "faq.q7p": "What happens if I break a rule?",
    "faq.q7r":
      "The account freezes exactly where it stood and the reason is visible on your dashboard. The account is not reopened — you join the next tournament. There is no other penalty.",
    "faq.q8p": "Why is my position not counting?",
    "faq.q8r":
      "The leaderboard shows the reason next to each participant. Usually it is because you do not yet have the minimum trading days, or concentration — a single day accounting for too much of the total profit. Both are solved by carrying on trading.",
    "faq.q9p": "How often does the leaderboard update?",
    "faq.q9r": "Hourly. The time of the last reading is at the bottom of the table.",
    "faq.q10p": "Does my email become public?",
    "faq.q10r":
      "No. The table shows it redacted, and the redaction happens on the server — the full email never reaches the browser of whoever is reading the leaderboard.",
    "faq.q11p": "Can I use bots or copy signals?",
    "faq.q11r":
      "Each programme's rules say what is allowed. What always means disqualification is in the [Terms](/mtmfunded/legal/termos): exploiting platform faults, coordinating opposite positions across accounts, and trading someone else's account.",
    "faq.q12p": "Do I get a certificate?",
    "faq.q12r":
      "Yes. Certificates are issued at the end of each tournament, stay in your area, and each one carries a code anyone can verify.",
    "faq.q13p": "What is the difference between the tournament and an evaluation programme?",
    "faq.q13r":
      "The tournament is free, quarterly and competitive: what counts is your position against the others. An evaluation programme is paid, individual and has no competition deadline — what counts is meeting the published targets.",
    "faq.q14p": "How does an MTM funded account work?",
    "faq.q14r":
      "The trading is **simulated from start to finish** — none of your orders reach the market. What is real is the capital the MTM Fund allocates to the account: **10% of the nominal value**. On a 10,000 USD funded account, that is 1,000 USD of real capital allocated by MTM. Your payouts come from that capital and from what it produces.",
    "faq.q15p": "How much of what I make do I get?",
    "faq.q15r":
      "**75% of the profit is yours**, 25% stays with MTM. That 25% pays for the real capital MTM puts up, the infrastructure and the risk — without it there would be no funded account to fund.",
    "faq.q16p": "What is the 3% cushion?",
    "faq.q16r":
      "Only what goes beyond **3% profit on the account's starting balance** can be withdrawn. The cushion is not a retention: it stays in your account and remains yours to trade. It exists so the account does not return to its starting point with every withdrawal — and so MTM builds the capital that funds the next traders.",
    "faq.q17p": "How do I get paid?",
    "faq.q17r":
      "By **deposit into your PU Prime account**, the partner broker, in USDC on the Solana network. In the request you give your account UID and attach the screenshot of the deposit menu, with the address and the amount visible. Nobody ever types the address by hand: it is the one the broker generated, exactly as it appears in the screenshot. A crypto payment sent to the wrong address cannot be recovered.",
    "faq.q18p": "Do I have to sign anything before withdrawing?",
    "faq.q18r":
      "Yes: the **funded trader contract**, in your area, under Contracts. There you confirm your full name and date of birth — you must be 18 or over. Without a signed contract the withdrawal request is not even accepted.",
    "faq.q19p": "Can I use bots, copytrading or trade the news?",
    "faq.q19r":
      "**News, yes** — we do not close windows around releases. **Bots (EA)**: you may use them to pass the evaluation, but not on the funded account — what gets funded is your judgement. **Copytrading**: only when synced with MTM Auto, because there the source and the management are known. Copying outside signals says nothing about whoever copies them.",
    "faq.q20p": "What other trading rules are there?",
    "faq.q20r":
      "A minimum of **2 minutes per trade**, maximum risk of **1.5% per trade**, at most **3 positions** on the same pair and direction, and **no hedging** — neither within an account nor across accounts.",
    "faq.q21p": "Is this financial advice?",
    "faq.q21r":
      "No. MTM Funded is neither a broker nor an investment firm and gives no advice. Read the [Risk Warning](/mtmfunded/legal/risco).",

    // ── forms (account details, sign in, checkout) ───────────────────────
    "mtmfunded.conta.primeiroNomeNota": "As it appears on your ID.",
    "mtmfunded.conta.apelidoNota": "The last surname is enough.",
    "mtmfunded.conta.paisNota": "Sets the dialling code.",
    "mtmfunded.conta.telemovelNota": "Without the dialling code — that comes from the country.",
    "mtmfunded.conta.nascimentoNota": "Required by the broker. You must be of age.",
    "mtmfunded.entrar.subEntrar": "If you already have a MoreThanMoney account, it is the same one.",
    "mtmfunded.entrar.subCriar":
      "An account for MTM Funded. It also works on morethanmoney.pt, should you ever want it.",
    "mtmfunded.entrar.passwordNota": "At least 8 characters.",
    "mtmfunded.entrar.momento": "One moment…",
    "mtmfunded.entrar.erroCredenciais": "Wrong email or password",
    "mtmfunded.entrar.erroCriar": "The account could not be created",
    "mtmfunded.entrar.erroGeral": "Could not continue",
    "mtmfunded.checkout.total": "Total",
    "mtmfunded.checkout.temCupao": "Got a coupon?",
    "mtmfunded.checkout.codigo": "CODE",
    "mtmfunded.checkout.aplicar": "Apply",
    "mtmfunded.checkout.cupaoInvalido": "Invalid coupon",
    "mtmfunded.checkout.aAbrir": "Opening the payment…",
    "mtmfunded.checkout.erroPagamento": "The payment could not be opened",

    "mtmfunded.entrar.dadosTitulo": "Trading account details",
    "mtmfunded.entrar.dadosNota":
      "Required by the broker to issue the account. They are saved — you will not fill them in again when entering a tournament or buying a challenge.",
    "mtmfunded.entrar.aceitasA": "By continuing you accept the MTM Funded",
    "mtmfunded.entrar.termos": "Terms",
    "mtmfunded.entrar.aceitasB": "and",
    "mtmfunded.entrar.privacidade": "Privacy Policy",
    "mtmfunded.entrar.aceitasC": ".",
    // ── platform (checkout + page) ──
    "mtmfunded.plataforma.titulo": "Platform",
    "mtmfunded.plataforma.recomendada": "Recommended",
    "mtmfunded.plataforma.simNota":
      "Our simulated server. The account is active as soon as payment is confirmed; you trade on the WebTrader and receive your credentials through a secure link (never the password by email).",
    "mtmfunded.plataforma.mt5Nota":
      "Broker demo account, to trade in the MetaTrader 5 app. It is created by our automated queue within {h} hours (usually under one) and the credentials arrive by email.",
    "mtmfunded.plataforma.igual":
      "Rules, price and targets are the same on both. On both, trading is simulated — virtual money. The platform carries over to the next phases and to the funded account.",
    "mtmfunded.plataforma.contaSimulada": "simulated account",
    "mtmfunded.plataforma.iosSemCheckout":
      "Programs cannot be purchased in the iOS app. Open morethanmoney.pt/mtmfunded in your browser to complete the purchase — the account then shows up in the app.",
    "mtmfunded.plataforma.nenhuma": "No platforms are available for purchase right now. Please try again later.",
    "mtmfunded.plataforma.secTitulo": "Two platforms, the same rules",
    "mtmfunded.plataforma.secSub":
      "You choose at checkout. On both the account is simulated, the rules are the ones published on this page and results are measured in percent and pips — we do not promise returns.",
    "mtmfunded.plataforma.simT": "MTM Funded",
    "mtmfunded.plataforma.simX1": "Account active as soon as payment is confirmed — and cheaper than the broker account",
    "mtmfunded.plataforma.simX2": "Browser WebTrader, with live rule metrics",
    "mtmfunded.plataforma.simX3": "Credentials via a secure link, no passwords in email",
    "mtmfunded.plataforma.mt5T": "MetaTrader 5",
    "mtmfunded.plataforma.mt5X1": "Broker demo account, in the MetaTrader 5 app you already know",
    "mtmfunded.plataforma.mt5X2": "Created within 24 hours (usually under one); credentials by email",
    "mtmfunded.plataforma.mt5X3": "Metrics read periodically; rules are checked more often while positions are open",
    "mtmfunded.plataforma.brevemente": "Coming soon",
    "mtmfunded.plataforma.desde": "From",
    "mtmfunded.plataforma.maisBarata": "cheaper than the broker account",
  },
}
