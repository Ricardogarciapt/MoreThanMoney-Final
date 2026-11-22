// Textos das páginas de venda dos e-books (/ebooks/<slug>). Sem promessas de lucro nem números
// de desempenho; os números que aparecem (páginas, gráficos, exercícios) contam o próprio livro.
import type { SlugEbook } from './acesso'
import { VENDAS_TRADUCOES, type TextosVenda } from './vendas-traducoes'

export type PaginaVenda = {
  slug: SlugEbook
  cor: string
  cor2: string
  fundo: string
  fonteTitulo: string
  titulo: string
  titulo2: string
  gancho: string
  sub: string
  autor: string
  autorBio: string
  autorFoto: string
  numeros: { v: string; r: string }[]
  capitulos: { t: string; d: string }[]
  paraQuem: string[]
  naoE: string[]
  faq: { p: string; r: string }[]
  aviso: string
}

type SlugBase = 'destrui-tudo-e-ainda-bem' | 'o-metodo-frio' | 'a-primeira-chave' | 'so-as-maos'
const VENDAS_PT: Record<SlugBase | 'a-decisao-que-adias', PaginaVenda> = {
  'a-decisao-que-adias': {
    slug: 'a-decisao-que-adias', cor: '#E9C46A', cor2: '#D2A63C', fundo: '#070b16', fonteTitulo: 'Anton, Oswald, Impact, sans-serif',
    titulo: 'A Decisão', titulo2: 'Que Adias',
    gancho: 'Se já sabes o que precisas de mudar, o que é que continuas a adiar?',
    sub: 'Crenças limitantes, identidade e o ciclo do evitamento, explicados com psicologia e sem frases feitas. Um livro para ler com caneta e um plano de 30 dias para passar do saber ao fazer.',
    autor: 'Liliana Salgueiro', autorFoto: '/marketplace/ebooks/liliana-retrato.jpg',
    autorBio: 'Educadora de desenvolvimento pessoal da MoreThanMoney e da She Is Faceless Academy. Criadora do Beyond the Mindset (@beyondthemindset.ls). O objetivo dela não é que penses como ela: é que questiones porque pensas como pensas.',
    numeros: [{ v: '87', r: 'páginas' }, { v: '12', r: 'capítulos' }, { v: '4', r: 'semanas de plano' }, { v: '30', r: 'dias' }],
    capitulos: [
      { t: 'Quantas vezes soubeste e não fizeste', d: 'A distância entre saber e fazer, e porque não é preguiça.' },
      { t: 'O que é uma crença', d: 'Acreditar não torna verdade. Sentir-se incapaz não é ser incapaz.' },
      { t: 'Limitação real ou conclusão aprendida', d: 'Separar a barreira que existe da conclusão que nunca testaste.' },
      { t: 'A frase que virou voz interior', d: 'Crenças nucleares na abordagem cognitiva de Aaron Beck.' },
      { t: 'Quem tiveste de ser', d: 'Identidade e mecanismos de defesa: o que te protegeu e já não serve.' },
      { t: 'O alívio que te prende', d: 'O ciclo do evitamento e o reforço negativo, explicados sem jargão.' },
      { t: 'O que ganhas em ficar igual', d: 'As quatro perguntas que mostram a função de um hábito.' },
      { t: 'Desejar não é construir', d: 'Alinhamento e a Lei da Atração vista mais a fundo.' },
      { t: 'Vibração e causa-efeito', d: 'Dois princípios herméticos como filosofia, sem obrigação de positividade.' },
      { t: 'Do saber ao fazer', d: 'O que estás disposta a construir, e não só o que queres receber.' },
      { t: 'Plano de 30 dias', d: 'Reconhecer, testar, quebrar o evitamento e decidir, dia a dia.' },
    ],
    paraQuem: ['Sabes exatamente o que precisas de mudar e continuas a adiar.', 'Estás a construir um negócio ou uma vida nova e a tua cabeça trava-te.', 'Queres compreender os teus padrões, não só motivação para a semana.'],
    naoE: ['Uma fórmula para viver a vida perfeita.', 'Um substituto de acompanhamento psicológico.', 'Pensamento positivo à força.'],
    faq: [
      { p: 'Quanto custa?', r: 'Nada. É a oferta dos webinars da Liliana: deixas o email, o WhatsApp e quatro respostas e recebes o link logo a seguir.' },
      { p: 'Em que formato recebo?', r: 'PDF (para ler e imprimir) e versão interativa no navegador. O link dá para abrir durante um ano.' },
      { p: 'Substitui terapia?', r: 'Não. É um livro educativo. Se estás em sofrimento intenso, procura um psicólogo ou um médico; em Portugal tens o SNS 24 (808 24 24 24).' },
      { p: 'Onde continuo com a Liliana?', r: 'Nas live sessions e nos webinars dela na MoreThanMoney, e no Instagram @beyondthemindset.ls.' },
    ],
    aviso: 'Conteúdo educativo. Não substitui acompanhamento psicológico, psiquiátrico ou médico. Em emergência liga 112.',
  },
  'destrui-tudo-e-ainda-bem': {
    slug: 'destrui-tudo-e-ainda-bem', cor: '#D2A63C', cor2: '#E9C46A', fundo: '#0b0b0c', fonteTitulo: 'Anton, Oswald, Impact, sans-serif',
    titulo: 'Destruí Tudo.', titulo2: 'E Ainda Bem.',
    gancho: 'Estável não é o mesmo que seguro.',
    sub: 'O sistema de disciplina, dinheiro e mercados que o Ricardo Garcia construiu depois de recomeçar do zero — num livro para ler como um plano de 10 semanas.',
    autor: 'Ricardo Garcia', autorFoto: '/ricardogarcia/foto-ricardo-estudio.jpg',
    autorBio: 'Adotado aos 17 meses, cresceu no Porto. Catorze anos de serviço (Exército, Fuzileiros, GNR) antes de largar o «emprego de sonho» numa das fases mais duras da vida da família. Fundou a MoreThanMoney para que ninguém tenha de pagar o preço de aprender sozinho.',
    numeros: [{ v: '148', r: 'páginas' }, { v: '10', r: 'gráficos animados' }, { v: '11', r: 'exercícios' }, { v: '30', r: 'dias de plano' }],
    capitulos: [
      { t: 'O dia em que deixei de fingir', d: 'A história, sem filtros, e a casa que se demole para fazer fundações.' },
      { t: 'Disciplina quando ninguém pergunta', d: 'O padrão mínimo diário que se transfere do serviço para a vida civil.' },
      { t: 'A armadilha das 40 horas', d: 'A conta das 168 horas e o teu salário por hora real.' },
      { t: 'O inventário', d: 'Dinheiro, energia, tempo e relações: o que fica e o que se demole.' },
      { t: 'Dinheiro com estrutura', d: 'Potes, fundo de emergência e a regra de não investir o que te faz falta.' },
      { t: 'Mercados sem fantasia', d: 'Forex, ouro, pips, lotes e alavancagem explicados com honestidade.' },
      { t: 'Como leio um gráfico', d: 'Regressão de tendência e o papel (e os limites) de um scanner.' },
      { t: 'Risco: o colete', d: 'Tamanho de posição passo a passo, risco:retorno e séries de perdas.' },
      { t: 'Quinze minutos por dia', d: 'Checklist pré-operação, diário de trading e regras de paragem.' },
      { t: 'Ninguém chega sozinho', d: 'Como escolher o próximo passo pela tua fase, sem promessas.' },
    ],
    paraQuem: ['Sentes que a rotina te come o tempo e o dinheiro não chega.', 'Queres aprender mercados com método, a começar pelo risco.', 'Precisas de um plano escrito, não de mais motivação.'],
    naoE: ['Um manual para enriquecer depressa.', 'Sinais prontos para copiar sem pensar.', 'Uma promessa de resultados.'],
    faq: [
      { p: 'Em que formato recebo?', r: 'PDF (para ler e imprimir) e versão interativa no navegador, com gráficos que se desenham enquanto lês. Ficam na tua Biblioteca do marketplace.' },
      { p: 'Preciso de saber trading?', r: 'Não. Os primeiros cinco capítulos são sobre tempo, disciplina e dinheiro. A parte de mercados começa do zero.' },
      { p: 'É o mesmo que «O Método Frio»?', r: 'Não. Este livro é sobre reconstrução e sistema: começa na tua semana e acaba numa rotina de 15 minutos com gestão de risco. «O Método Frio» é o manual técnico para começar no Forex.' },
      { p: 'Posso pedir reembolso?', r: 'Fala connosco pelo apoio do site. Cada pedido é analisado pela equipa.' },
    ],
    aviso: 'Conteúdo educativo. Não constitui aconselhamento financeiro. Negociar Forex, ouro ou CFD envolve risco elevado de perda, incluindo a totalidade do capital. Não há resultados garantidos.',
  },
  'o-metodo-frio': {
    slug: 'o-metodo-frio', cor: '#E9C46A', cor2: '#D2A63C', fundo: '#07080a', fonteTitulo: 'Anton, Oswald, Impact, sans-serif',
    titulo: 'O Método', titulo2: 'Frio',
    gancho: 'O mercado não sabe que existes.',
    sub: 'Forex: como iniciar. Regras, risco e método para quem começa. Os erros clássicos postos à frente, para não os pagares tu.',
    autor: 'Ricardo Garcia', autorFoto: '/ricardogarcia/foto-ricardo-estudio.jpg',
    autorBio: 'Catorze anos de serviço (Exército, Fuzileiros, GNR) antes de recomeçar do zero. Fundou a MoreThanMoney para que ninguém tenha de pagar o preço de aprender sozinho. Este é o manual técnico que acompanha «Destruí Tudo. E Ainda Bem.».',
    numeros: [{ v: '151', r: 'páginas' }, { v: '16', r: 'gráficos animados' }, { v: '12', r: 'regras frias' }, { v: '30', r: 'dias de plano' }],
    capitulos: [
      { t: 'Montar a bancada', d: 'Instalar o MetaTrader 4 ou 5 no telemóvel e no computador, abrir a demo, arrumar o gráfico e ligar os dois.' },
      { t: 'O mercado não sabe que existes', d: 'Pares, spread e sessões em hora de Lisboa, lidos nas tuas próprias Cotações.' },
      { t: 'Pips, lotes e o preço de um erro', d: 'Valor do pip, spread, swap e alavancagem, com o campo «Volume» à frente.' },
      { t: 'Ler o gráfico sem bola de cristal', d: 'Velas, períodos, zonas, Fibonacci e indicadores, com o dedo no gráfico da app.' },
      { t: 'O tamanho certo', d: 'A fórmula do lote pelo risco de 1 % e a prova em dinheiro no ecrã da ordem.' },
      { t: 'A ordem fria', d: 'Limit ou Stop, a ordem pendente passo a passo em ecrãs reais, Negociação e a checklist.' },
      { t: 'Notícias, horários e o calendário', d: 'O Tradays, a regra dos 30 minutos e alertas de preço que chegam ao telemóvel.' },
      { t: 'O plano numa página', d: 'Cinco partes, metas de processo e quando mudar.' },
      { t: 'O diário', d: 'Do separador Histórico ao diário, a revisão de domingo e os três números do mês.' },
      { t: 'A cabeça fria', d: 'Medo, ganância, FOMO e vingança, cada um com a sua regra.' },
      { t: 'O WebTrader e as ferramentas da casa', d: 'O WebTrader da MTM passo a passo: ordem por risco, Auto BE e trailing, diário, auditoria, TradeLocker. E DEFY, Golden Zone, Momentum e Aurum Flow, com playlists e bootcamps.' },
      { t: 'Do demo ao real', d: 'Seis critérios de passagem e como começar sem pressa.' },
      { t: 'Plano de 30 dias', d: 'Dia a dia na demo, com o MetaTrader e o caderno, e um glossário.' },
      ],
    paraQuem: ['Queres começar no Forex sem te queimares nos primeiros meses.', 'Queres aprender com a história real de quem recomeçou do zero, do Porto aos Fuzileiros e à GNR.', 'Já abriste o MetaTrader 5 e não sabes por onde pegar.', 'Precisas de regras escritas, não de mais um sinal para copiar.'],
    naoE: ['Uma estratégia que nunca perde.', 'Sinais prontos para copiar.', 'Uma promessa de rendimento.'],
    faq: [
      { p: 'Em que formato recebo?', r: 'PDF (para ler e imprimir) e versão interativa no navegador, com gráficos animados. Ficam na tua Biblioteca do marketplace.' },
      { p: 'Preciso de saber trading?', r: 'Não. Começa do zero e faz-se todo em conta demo.' },
      { p: 'Substitui o «Investir sem Emoções»?', r: 'Sim. É a edição refeita do zero: mais prática, com o MetaTrader instalado logo no capítulo 1 e usado capítulo a capítulo, com ecrãs reais da app e os erros clássicos de quem começa.' },
      { p: 'É só técnico?', r: 'Não. Cada capítulo traz um pedaço da vida do Ricardo (a infância no Porto, os paraquedistas, os Fuzileiros, os 14 anos de GNR, o ano de 2021) e a regra que aprendeu com ele. E traz o WebTrader da MTM passo a passo.' },
      { p: 'E o «Destruí Tudo. E Ainda Bem.»?', r: 'São complementares. O «Destruí Tudo» é a história, a disciplina e o sistema completo; «O Método Frio» é a bancada de trabalho técnica.' },
    ],
    aviso: 'Conteúdo educativo. Não constitui aconselhamento financeiro. Negociar Forex e CFD com alavancagem envolve risco elevado de perda, incluindo a totalidade do capital; a maioria das contas de retalho perde dinheiro com CFD. Não há resultados garantidos.',
  },
  'a-primeira-chave': {
    slug: 'a-primeira-chave', cor: '#D9A93A', cor2: '#F3CF73', fundo: '#0a0806', fonteTitulo: 'Anton, Oswald, Impact, sans-serif',
    titulo: 'A Primeira', titulo2: 'Chave',
    gancho: 'Em cripto, quem tem a chave tem o dinheiro.',
    sub: 'Do «não percebo nada» à tua primeira carteira segura e a um plano de 30 dias. Sem hype, sem medo e sem promessas.',
    autor: 'Ruben Pereira', autorFoto: '/educadores/ruben/retrato.jpg',
    autorBio: 'Educador de cripto na MoreThanMoney. «Simplificar o complexo. Mais do que dinheiro, é um plano.» Conduz as Salas DCA com MTM, o Império Cripto e o Live Trading Cripto.',
    numeros: [{ v: '114', r: 'páginas' }, { v: '6', r: 'gráficos animados' }, { v: '11', r: 'exercícios' }, { v: '10', r: 'pontos anti-burla' }],
    capitulos: [
      { t: 'O que é dinheiro', d: 'Da troca ao euro, a inflação e porque nasceu o Bitcoin em 2008.' },
      { t: 'O caderno que ninguém apaga', d: 'A blockchain explicada sem jargão.' },
      { t: 'O mapa das moedas', d: 'Bitcoin, Ethereum, stablecoins e 7 perguntas para avaliar um projeto.' },
      { t: 'Comprar pela primeira vez', d: 'Plataforma regulada, verificação, taxas e o primeiro euro.' },
      { t: 'A tua chave', d: 'Carteiras quentes e frias e como guardar a seed phrase.' },
      { t: 'Escudo anti-burla', d: 'Os padrões das burlas e uma checklist de 10 pontos.' },
      { t: 'DCA', d: 'Comprar com método, com um exemplo ilustrativo honesto.' },
      { t: 'Impostos em Portugal', d: 'A regra dos 365 dias e como registar as operações.' },
      { t: 'Perpétuos e alavancagem', d: 'O que são e porque não começar por aqui.' },
    ],
    paraQuem: ['Tens curiosidade mas medo de burlas.', 'Queres comprar e guardar cripto com segurança.', 'Preferes método a palpites.'],
    naoE: ['Uma lista de moedas para ficares rico.', 'Aconselhamento financeiro ou fiscal.', 'Um curso de trading alavancado.'],
    faq: [
      { p: 'Em que formato recebo?', r: 'PDF e versão interativa no navegador, na tua Biblioteca do marketplace.' },
      { p: 'Preciso de dinheiro para começar?', r: 'Não para ler. O livro ensina a começar com valores pequenos e só com dinheiro que podes perder.' },
      { p: 'Fala de impostos?', r: 'Sim, das regras gerais em Portugal, com o aviso de confirmares sempre com um contabilista certificado.' },
    ],
    aviso: 'Conteúdo educativo. Não constitui aconselhamento financeiro nem fiscal. Criptoativos são muito voláteis e podes perder a totalidade do valor investido.',
  },
  'so-as-maos': {
    slug: 'so-as-maos', cor: '#C9A97E', cor2: '#E6D3B5', fundo: '#1b1714', fonteTitulo: '"Cormorant Garamond", Georgia, serif',
    titulo: 'Só as', titulo2: 'Mãos',
    gancho: 'O que vende não é a cara. É o que as tuas mãos constroem.',
    sub: 'Vender nas redes sem mostrar a cara: do cliente ideal ao teu primeiro produto digital, com guiões de stories e mensagens prontos a adaptar.',
    autor: 'Maria Costa', autorFoto: '/educadores/mafalda/retrato.jpg',
    autorBio: 'Especialista em infoprodutos e fundadora da She Is Faceless Academy. No marketing desde 2013, ensina homens e mulheres em Portugal a vender sem aparecer.',
    numeros: [{ v: '125', r: 'páginas' }, { v: '6', r: 'gráficos animados' }, { v: '12', r: 'exercícios' }, { v: '5', r: 'stories-modelo' }],
    capitulos: [
      { t: 'Porque a cara não é o produto', d: 'Mitos, vantagens e a mentalidade faceless.' },
      { t: 'O cliente que te procura', d: 'Dor, desejo e linguagem, com mapa de empatia.' },
      { t: 'Marca sem rosto', d: 'Paleta, voz e uma assinatura visual que se reconhece.' },
      { t: 'O primeiro produto digital', d: 'Validar antes de criar e a escada de valor.' },
      { t: 'Conteúdo com IA', d: 'A IA como assistente, não como autora.' },
      { t: 'Formatos que vendem sem cara', d: 'Mãos, voz-off, texto no ecrã, carrosséis, POV.' },
      { t: 'Stories que vendem', d: 'Uma sequência de 5 stories, passo a passo.' },
      { t: 'A DM que não parece venda', d: 'Conversas éticas, guiões e seguimento.' },
      { t: 'Mais fontes de rendimento', d: 'Etsy, Amazon KDP, UGC e serviços digitais.' },
    ],
    paraQuem: ['Queres vender online sem aparecer em vídeo.', 'Tens conhecimento que podia ser um produto digital.', 'Precisas de um método prático, não de teoria solta.'],
    naoE: ['Uma promessa de rendimento.', 'Um atalho sem trabalho.', 'Spam de mensagens automáticas.'],
    faq: [
      { p: 'Em que formato recebo?', r: 'PDF e versão interativa no navegador, na tua Biblioteca do marketplace.' },
      { p: 'Serve para homens?', r: 'Sim. O método é o mesmo para qualquer pessoa que queira vender sem aparecer.' },
      { p: 'E se quiser ir mais a fundo?', r: 'O livro é a porta de entrada. Quem quer acompanhamento continua na She Is Faceless Academy.' },
    ],
    aviso: 'Os resultados dependem do trabalho e das decisões de cada pessoa; não há rendimentos garantidos.',
  },
}

// Versões EN/ES: mesmas cores, fontes e foto; textos de vendas-traducoes.ts.
const traduzida = (base: SlugBase, l: 'en' | 'es' | 'fr'): PaginaVenda => ({ ...VENDAS_PT[base], ...(VENDAS_TRADUCOES[base][l] as TextosVenda), slug: `${base}-${l}` as SlugEbook })
export const VENDAS: Record<SlugEbook, PaginaVenda> = {
  ...VENDAS_PT,
  'destrui-tudo-e-ainda-bem-en': traduzida('destrui-tudo-e-ainda-bem', 'en'),
  'destrui-tudo-e-ainda-bem-es': traduzida('destrui-tudo-e-ainda-bem', 'es'),
  'o-metodo-frio-en': traduzida('o-metodo-frio', 'en'),
  'o-metodo-frio-es': traduzida('o-metodo-frio', 'es'),
  'a-primeira-chave-en': traduzida('a-primeira-chave', 'en'),
  'a-primeira-chave-es': traduzida('a-primeira-chave', 'es'),
  'a-primeira-chave-fr': traduzida('a-primeira-chave', 'fr'),
  'so-as-maos-en': traduzida('so-as-maos', 'en'),
  'so-as-maos-es': traduzida('so-as-maos', 'es'),
}
