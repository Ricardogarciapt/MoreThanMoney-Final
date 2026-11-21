// Textos das páginas de venda dos e-books (/ebooks/<slug>). Sem promessas de lucro nem números
// de desempenho; os números que aparecem (páginas, gráficos, exercícios) contam o próprio livro.
import type { SlugEbook } from './acesso'

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

export const VENDAS: Record<SlugEbook, PaginaVenda> = {
  'destrui-tudo-e-ainda-bem': {
    slug: 'destrui-tudo-e-ainda-bem', cor: '#D2A63C', cor2: '#E9C46A', fundo: '#0b0b0c', fonteTitulo: 'Anton, Oswald, Impact, sans-serif',
    titulo: 'Destruí Tudo.', titulo2: 'E Ainda Bem.',
    gancho: 'Estável não é o mesmo que seguro.',
    sub: 'O sistema de disciplina, dinheiro e mercados que o Ricardo Garcia construiu depois de recomeçar do zero — num livro para ler como um plano de 10 semanas.',
    autor: 'Ricardo Garcia', autorFoto: '/ricardogarcia/foto-ricardo-estudio.jpg',
    autorBio: 'Adotado aos 17 meses, cresceu no Porto. Catorze anos de serviço (Exército, Fuzileiros, GNR) antes de largar o «emprego de sonho» numa das fases mais duras da vida da família. Fundou a MoreThanMoney para que ninguém tenha de pagar o preço de aprender sozinho.',
    numeros: [{ v: '94', r: 'páginas' }, { v: '10', r: 'gráficos animados' }, { v: '11', r: 'exercícios' }, { v: '30', r: 'dias de plano' }],
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
      { p: 'É o mesmo que o «Investe sem Emoção»?', r: 'Não. Este livro é sobre reconstrução e sistema: começa na tua semana e acaba numa rotina de 15 minutos com gestão de risco.' },
      { p: 'Posso pedir reembolso?', r: 'Fala connosco pelo apoio do site. Cada pedido é analisado pela equipa.' },
    ],
    aviso: 'Conteúdo educativo. Não constitui aconselhamento financeiro. Negociar Forex, ouro ou CFD envolve risco elevado de perda, incluindo a totalidade do capital. Não há resultados garantidos.',
  },
  'a-primeira-chave': {
    slug: 'a-primeira-chave', cor: '#19d3c5', cor2: '#7c5cff', fundo: '#060a14', fonteTitulo: '"Space Grotesk", system-ui, sans-serif',
    titulo: 'A Primeira', titulo2: 'Chave',
    gancho: 'Em cripto, quem tem a chave tem o dinheiro.',
    sub: 'Do «não percebo nada» à tua primeira carteira segura e a um plano de 30 dias. Sem hype, sem medo e sem promessas.',
    autor: 'Ruben Pereira', autorFoto: '/reels/educadores/fotos/ruben-pereira.jpg',
    autorBio: 'Educador de criptomoedas e perpétuos na MoreThanMoney. Conduz as Salas DCA com MTM, o Império Cripto e o Live Trading Cripto.',
    numeros: [{ v: '75', r: 'páginas' }, { v: '6', r: 'gráficos animados' }, { v: '11', r: 'exercícios' }, { v: '10', r: 'pontos anti-burla' }],
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
    slug: 'so-as-maos', cor: '#b5737e', cor2: '#d9a5a0', fundo: '#1a1416', fonteTitulo: '"Cormorant Garamond", Georgia, serif',
    titulo: 'Só as', titulo2: 'Mãos',
    gancho: 'O que vende não é a cara. É o que as tuas mãos constroem.',
    sub: 'Vender nas redes sem mostrar a cara: do cliente ideal ao teu primeiro produto digital, com guiões de stories e mensagens prontos a adaptar.',
    autor: 'Maria Costa', autorFoto: '',
    autorBio: 'Especialista em infoprodutos e fundadora da She Is Faceless Academy. No marketing desde 2013, ensina homens e mulheres em Portugal a vender sem aparecer.',
    numeros: [{ v: '89', r: 'páginas' }, { v: '6', r: 'gráficos animados' }, { v: '12', r: 'exercícios' }, { v: '5', r: 'stories-modelo' }],
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
