// Os livros da casa: identidade, tema e textos de capa. Os capítulos vivem em
// conteudo-privado/ebooks/<slug>/NN-*.md (fora de public/: só saem pela rota com acesso).

export const LIVROS = {
  'destrui-tudo-e-ainda-bem': {
    titulo: 'Destruí Tudo.',
    titulo2: 'E Ainda Bem.',
    subtitulo: 'Disciplina, dinheiro e mercados: o sistema que construí depois de recomeçar do zero.',
    autor: 'Ricardo Garcia',
    autorBio: 'Fundador da MoreThanMoney. Catorze anos de serviço (Exército, Fuzileiros, GNR) antes de recomeçar do zero. Hoje ensina mercados com método: regressão de tendências, scanners e gestão de risco, sem promessas.',
    selo: 'rg.png',
    foto: 'ricardo-pb.jpg',
    fotoInterior: 'rg-mesquita.jpg',
    aberturas: ['rg-macbook.jpg', null, null, null, null, null, null, null, null, null, null, null, null],
    tema: 'rg',
    edicao: '1.ª edição · novembro de 2026',
    aviso: 'Conteúdo educativo. Não constitui aconselhamento financeiro nem recomendação de investimento. Negociar Forex, ouro ou CFD envolve risco elevado de perda, incluindo a totalidade do capital. Resultados passados não garantem resultados futuros. Não há resultados garantidos.',
  },
  'o-metodo-frio': {
    titulo: 'O Método',
    titulo2: 'Frio',
    subtitulo: 'Forex: como iniciar. Regras, risco e método para quem começa.',
    autor: 'Ricardo Garcia',
    autorBio: 'Fundador da MoreThanMoney. Catorze anos de serviço (Exército, Fuzileiros, GNR) antes de recomeçar do zero. Hoje ensina Forex com método: regras escritas, risco medido e um diário que não mente.',
    selo: 'rg.png',
    tema: 'rg',
    variante: 'frio',
    foto: 'rg-abudhabi.jpg',
    funcao: 'Forex · Como iniciar',
    fotoInterior: 'rg-telefone.jpg',
    aberturas: ['rg-trading-lisboa.jpg'],
    // nada de ecrãs do MetaTrader desenhados: os capítulos 1 (instalar) e 6 (ordem) abrem sem ilustração.
    semIlustra: [1, 6, 11],
    edicao: '1.ª edição · novembro de 2026 · substitui «Investir sem Emoções»',
    aviso: 'Conteúdo educativo. Não constitui aconselhamento financeiro nem recomendação de investimento. Negociar Forex e CFD com alavancagem envolve risco elevado de perda, incluindo a totalidade do capital. A maioria das contas de retalho perde dinheiro com CFD. Resultados passados não garantem resultados futuros.',
  },
  'a-primeira-chave': {
    titulo: 'A Primeira',
    titulo2: 'Chave',
    subtitulo: 'Cripto para iniciantes, sem hype e sem medo. Do primeiro euro à carteira segura.',
    autor: 'Ruben Pereira',
    autorBio: 'Educador de criptomoedas e perpétuos na MoreThanMoney. Conduz as Salas DCA com MTM, o Império Cripto e o Live Trading Cripto.',
    selo: 'mtm.png',
    tema: 'cripto',
    foto: 'ruben-capa-foto.jpg',
    funcao: 'Educador de cripto',
    academia: 'Bootcamp A Primeira Chave',
    fotoInterior: 'ruben-retrato.jpg',
    aberturas: ['ruben-capa-foto.jpg'],
    edicao: '1.ª edição · novembro de 2026',
    aviso: 'Conteúdo educativo. Não constitui aconselhamento financeiro nem fiscal. Os criptoativos são muito voláteis e podes perder a totalidade do valor investido. As regras fiscais mudam: confirma sempre com um contabilista certificado.',
  },
  'so-as-maos': {
    titulo: 'Só as',
    titulo2: 'Mãos',
    subtitulo: 'Vender nas redes sem mostrar a cara. Do zero ao teu primeiro produto digital.',
    autor: 'Maria Costa',
    autorBio: 'Especialista em infoprodutos e fundadora da She Is Faceless Academy. No marketing desde 2013, ensina a vender sem aparecer.',
    selo: 'mtm.png',
    tema: 'faceless',
    foto: 'maria-telemoveis.jpg',
    academia: 'She Is Faceless Academy',
    // 21/11 (Ricardo): o livro da Maria sai com a marca She Is e serve de porta para os produtos dela.
    marca: { logo: 'sheis.svg', nome: 'She Is', url: 'sheis.pt', colecao: 'Coleção She Is', copyright: 'She Is',
      fecho: 'Queres ajuda para pôr isto em prática? Na She Is tens o planner She Is Daily, o estúdio de design She Is Studio, consultoria e mentoria 1:1 e a She Is Faceless Academy. Começa em sheis.pt.' },
    fotoInterior: 'maria-maos.jpg',
    aberturas: [],
    edicao: '1.ª edição · novembro de 2026',
    aviso: 'Conteúdo educativo. Os resultados dependem do trabalho, do mercado e das decisões de cada pessoa; não há rendimentos garantidos. Respeita sempre as regras das plataformas e o RGPD.',
  },
  'a-decisao-que-adias': {
    titulo: 'A Decisão',
    titulo2: 'Que Adias',
    subtitulo: 'Crenças limitantes, identidade e o ciclo do evitamento. Do saber ao fazer, em 30 dias.',
    autor: 'Liliana Salgueiro',
    autorBio: 'Educadora de desenvolvimento pessoal da MoreThanMoney e da She Is Faceless Academy. Criadora do Beyond the Mindset (@beyondthemindset.ls).',
    selo: 'mtm.png',
    tema: 'rg',
    variante: 'mente',
    foto: 'liliana-retrato.jpg',
    funcao: 'Beyond the Mindset',
    academia: 'Academia Mindset MTM',
    fotoInterior: 'liliana-retrato.jpg',
    aberturas: [],
    edicao: '1.ª edição · novembro de 2026 · oferta dos webinars',
    aviso: 'Conteúdo educativo. Não substitui acompanhamento psicológico, psiquiátrico ou médico. Se estás em sofrimento intenso, procura um profissional de saúde ou liga para o SNS 24 (808 24 24 24); em emergência, 112.',
  },
}

// Versões EN/ES: herdam tudo do livro PT e trocam só os textos (tools/ebooks/i18n.mjs).
import { LIVROS_TRAD, LINGUAS } from './i18n.mjs'
for (const [base, tr] of Object.entries(LIVROS_TRAD)) {
  for (const l of LINGUAS) {
    if (!tr[l] || !LIVROS[base]) continue
    const pt = LIVROS[base]
    LIVROS[`${base}-${l}`] = { ...pt, ...tr[l], lingua: l, base, marca: pt.marca || tr[l].marca ? { ...(pt.marca || {}), ...(tr[l].marca || {}) } : undefined }
  }
}
