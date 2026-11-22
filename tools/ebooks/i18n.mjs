// Línguas dos e-books. O livro em PT é a fonte; as versões EN/ES vivem em
// conteudo-privado/ebooks/<slug>-en/ e <slug>-es/ (mesmos nomes de ficheiro) e herdam tema, fotos e
// marca do PT. Sempre que um capítulo PT muda, a tradução correspondente muda também.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const LINGUAS = ['en', 'es']

/** 'o-metodo-frio-en' → { base: 'o-metodo-frio', lingua: 'en' } */
export function partes(slug) {
  const m = slug.match(/^(.*)-(en|es)$/)
  return m ? { base: m[1], lingua: m[2] } : { base: slug, lingua: 'pt' }
}

// textos fixos do livro (capa, ficha, índice, blocos)
export const UI = {
  pt: {
    html: 'pt-PT', indice: 'Índice', capitulo: 'Capítulo', anexo: 'Anexo', edicao1: '1.ª edição',
    direitos: (autor, marca) => `© 2026 ${autor} e ${marca}. Todos os direitos reservados. Esta cópia é pessoal e intransmissível: não a partilhes nem a revendas.`,
    produzida: 'Edição produzida por MoreThanMoney.pt', aviso: 'Aviso importante.', sobre: 'Sobre o autor.', obrigado: 'Obrigado por leres até aqui.',
    rotulos: { destaque: 'Ideia-chave', exercicio: 'Exercício', alerta: 'Atenção', historia: 'História' },
    pergunta: 'Pergunta', mensagens: 'Mensagens', recorta: 'Recorta e guarda', espreitadela: 'Espreitadela do curso', ferramenta: 'Ferramenta MTM',
    ficha: { estilo: 'Estilo', ativos: 'Ativos', tempo: 'Gráfico' }, novaVenda: 'Nova venda ♥', semImpulso: 'SEM IMPULSO',
    carimbo: { rg: ['Disciplina · Dinheiro · Mercados ·', '10', 'semanas'], frio: ['Forex · MetaTrader 5 · Sem impulso ·', '1 %', 'por operação'], mente: ['Crenças · Identidade · Decisão ·', '30', 'dias'], cripto: ['Cripto para iniciantes · Sem hype ·', '1.º', 'euro'], faceless: ['Vender sem mostrar a cara · Só as mãos ·', '30', 'dias'] },
    colecao: 'Coleção MTM',
    fechoMtm: 'Continua o caminho com a comunidade MoreThanMoney: aulas ao vivo, ferramentas e pessoas que estão a fazer o mesmo percurso.',
  },
  en: {
    html: 'en-GB', indice: 'Contents', capitulo: 'Chapter', anexo: 'Appendix', edicao1: '1st edition',
    direitos: (autor, marca) => `© 2026 ${autor} and ${marca}. All rights reserved. This copy is personal and non-transferable: please do not share or resell it.`,
    produzida: 'Edition produced by MoreThanMoney.pt', aviso: 'Important notice.', sobre: 'About the author.', obrigado: 'Thank you for reading this far.',
    rotulos: { destaque: 'Key idea', exercicio: 'Exercise', alerta: 'Warning', historia: 'Story' },
    pergunta: 'Question', mensagens: 'Messages', recorta: 'Cut out and keep', espreitadela: 'A peek inside the course', ferramenta: 'MTM tool',
    ficha: { estilo: 'Style', ativos: 'Assets', tempo: 'Chart' }, novaVenda: 'New sale ♥', semImpulso: 'NO IMPULSE',
    carimbo: { rg: ['Discipline · Money · Markets ·', '10', 'weeks'], frio: ['Forex · MetaTrader 5 · No impulse ·', '1%', 'per trade'], mente: ['Beliefs · Identity · Decision ·', '30', 'days'], cripto: ['Crypto for beginners · No hype ·', '1st', 'euro'], faceless: ['Sell without showing your face ·', '30', 'days'] },
    colecao: 'MTM Collection',
    fechoMtm: 'Keep going with the MoreThanMoney community: live classes, tools and people walking the same road.',
  },
  es: {
    html: 'es-ES', indice: 'Índice', capitulo: 'Capítulo', anexo: 'Anexo', edicao1: '1.ª edición',
    direitos: (autor, marca) => `© 2026 ${autor} y ${marca}. Todos los derechos reservados. Esta copia es personal e intransferible: no la compartas ni la revendas.`,
    produzida: 'Edición producida por MoreThanMoney.pt', aviso: 'Aviso importante.', sobre: 'Sobre el autor.', obrigado: 'Gracias por leer hasta aquí.',
    rotulos: { destaque: 'Idea clave', exercicio: 'Ejercicio', alerta: 'Atención', historia: 'Historia' },
    pergunta: 'Pregunta', mensagens: 'Mensajes', recorta: 'Recorta y guarda', espreitadela: 'Un vistazo al curso', ferramenta: 'Herramienta MTM',
    ficha: { estilo: 'Estilo', ativos: 'Activos', tempo: 'Gráfico' }, novaVenda: 'Nueva venta ♥', semImpulso: 'SIN IMPULSO',
    carimbo: { rg: ['Disciplina · Dinero · Mercados ·', '10', 'semanas'], frio: ['Forex · MetaTrader 5 · Sin impulso ·', '1 %', 'por operación'], mente: ['Creencias · Identidad · Decisión ·', '30', 'días'], cripto: ['Cripto para principiantes · Sin hype ·', '1.º', 'euro'], faceless: ['Vender sin mostrar la cara · Solo manos ·', '30', 'días'] },
    colecao: 'Colección MTM',
    fechoMtm: 'Sigue el camino con la comunidad MoreThanMoney: clases en directo, herramientas y personas que están haciendo el mismo recorrido.',
  },
}

// textos de capa e ficha de cada livro, por língua (o resto vem do livro PT)
export const LIVROS_TRAD = {
  'destrui-tudo-e-ainda-bem': {
    en: {
      titulo: 'I Destroyed It All.', titulo2: "And I'm Glad.",
      subtitulo: 'Discipline, money and markets: the system I built after starting again from zero.',
      autorBio: 'Founder of MoreThanMoney. Fourteen years of service (Army, Marines, Portuguese National Guard) before starting again from zero. Today he teaches markets with a method: trend regression, scanners and risk management, without promises.',
      edicao: '1st edition · November 2026',
      aviso: 'Educational content. It is not financial advice or an investment recommendation. Trading Forex, gold or CFDs carries a high risk of loss, including all of your capital. Past results do not guarantee future results. There are no guaranteed results.',
    },
    es: {
      titulo: 'Lo Destruí Todo.', titulo2: 'Y Menos Mal.',
      subtitulo: 'Disciplina, dinero y mercados: el sistema que construí después de empezar de cero.',
      autorBio: 'Fundador de MoreThanMoney. Catorce años de servicio (Ejército, Infantería de Marina, Guardia Nacional Republicana) antes de empezar de cero. Hoy enseña mercados con método: regresión de tendencias, escáneres y gestión del riesgo, sin promesas.',
      edicao: '1.ª edición · noviembre de 2026',
      aviso: 'Contenido educativo. No constituye asesoramiento financiero ni recomendación de inversión. Operar Forex, oro o CFD conlleva un riesgo elevado de pérdida, incluida la totalidad del capital. Los resultados pasados no garantizan resultados futuros. No hay resultados garantizados.',
    },
  },
  'o-metodo-frio': {
    en: {
      titulo: 'The Cold', titulo2: 'Method', tamTitulo2: '27cqw',
      subtitulo: 'Forex without impulse: rules, risk and MetaTrader 5 for beginners.',
      autorBio: 'Founder of MoreThanMoney. Fourteen years of service (Army, Marines, Portuguese National Guard) before starting again from zero. Today he teaches Forex with a method: written rules, measured risk and a journal that does not lie.',
      funcao: 'Forex · MetaTrader 5',
      edicao: '1st edition · November 2026',
      aviso: 'Educational content. It is not financial advice or an investment recommendation. Trading leveraged Forex and CFDs carries a high risk of loss, including all of your capital. Most retail accounts lose money with CFDs. Past results do not guarantee future results.',
    },
    es: {
      titulo: 'El Método', titulo2: 'Frío',
      subtitulo: 'Forex sin impulso: reglas, riesgo y MetaTrader 5 para quien empieza.',
      autorBio: 'Fundador de MoreThanMoney. Catorce años de servicio (Ejército, Infantería de Marina, Guardia Nacional Republicana) antes de empezar de cero. Hoy enseña Forex con método: reglas escritas, riesgo medido y un diario que no miente.',
      funcao: 'Forex · MetaTrader 5',
      edicao: '1.ª edición · noviembre de 2026',
      aviso: 'Contenido educativo. No constituye asesoramiento financiero ni recomendación de inversión. Operar Forex y CFD con apalancamiento conlleva un riesgo elevado de pérdida, incluida la totalidad del capital. La mayoría de las cuentas minoristas pierden dinero con CFD. Los resultados pasados no garantizan resultados futuros.',
    },
  },
  'a-primeira-chave': {
    en: {
      titulo: 'The First', titulo2: 'Key',
      subtitulo: 'Crypto for beginners, without hype and without fear. From your first euro to a secure wallet.',
      autorBio: 'Crypto and perpetuals educator at MoreThanMoney. He runs the DCA with MTM rooms, Império Cripto and Live Crypto Trading.',
      funcao: 'Crypto educator',
      edicao: '1st edition · November 2026',
      aviso: 'Educational content. It is not financial or tax advice. Crypto-assets are very volatile and you can lose all the money you invest. The tax rules described are Portugal\'s and they change: always check with a certified accountant.',
    },
    es: {
      titulo: 'La Primera', titulo2: 'Llave',
      subtitulo: 'Cripto para principiantes, sin hype y sin miedo. Del primer euro a la cartera segura.',
      autorBio: 'Educador de criptomonedas y perpetuos en MoreThanMoney. Dirige las Salas DCA con MTM, Império Cripto y el Live Trading Cripto.',
      funcao: 'Educador de cripto',
      edicao: '1.ª edición · noviembre de 2026',
      aviso: 'Contenido educativo. No constituye asesoramiento financiero ni fiscal. Los criptoactivos son muy volátiles y puedes perder la totalidad del valor invertido. Las reglas fiscales descritas son las de Portugal y cambian: consulta siempre con un asesor fiscal.',
    },
  },
  'so-as-maos': {
    en: {
      titulo: 'Just the', titulo2: 'Hands',
      subtitulo: 'Selling on social media without showing your face. From zero to your first digital product.',
      autorBio: 'Digital products specialist and founder of She Is Faceless Academy. In marketing since 2013, she teaches people to sell without being on camera.',
      edicao: '1st edition · November 2026',
      aviso: 'Educational content. Results depend on each person\'s work, the market and their decisions; there is no guaranteed income. Always follow the platforms\' rules and data-protection law (GDPR).',
      marca: { colecao: 'She Is Collection', fecho: 'Want help putting this into practice? At She Is you\'ll find the She Is Daily planner, the She Is Studio design studio, 1:1 consulting and mentoring, and She Is Faceless Academy. Start at sheis.pt.' },
    },
    es: {
      titulo: 'Solo las', titulo2: 'Manos',
      subtitulo: 'Vender en redes sin mostrar la cara. De cero a tu primer producto digital.',
      autorBio: 'Especialista en infoproductos y fundadora de She Is Faceless Academy. En el marketing desde 2013, enseña a vender sin salir en cámara.',
      edicao: '1.ª edición · noviembre de 2026',
      aviso: 'Contenido educativo. Los resultados dependen del trabajo, del mercado y de las decisiones de cada persona; no hay ingresos garantizados. Respeta siempre las reglas de las plataformas y el RGPD.',
      marca: { colecao: 'Colección She Is', fecho: '¿Quieres ayuda para ponerlo en práctica? En She Is tienes el planner She Is Daily, el estudio de diseño She Is Studio, consultoría y mentoría 1:1 y She Is Faceless Academy. Empieza en sheis.pt.' },
    },
  },
}

// textos dentro dos gráficos e ilustrações SVG: tradução por nó de texto exato
const SVG = {}
function dicSvg(lingua) {
  if (!(lingua in SVG)) {
    const f = path.join(AQUI, 'i18n', `svg-${lingua}.json`)
    SVG[lingua] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}
  }
  return SVG[lingua]
}
export function traduzirSvg(html, lingua) {
  if (!html || !lingua || lingua === 'pt') return html
  const d = dicSvg(lingua)
  const tr = (t) => { const k = t.trim(); return d[k] ? t.replace(k, d[k]) : t }
  return html
    .replace(/>([^<>]+)</g, (m, t) => `>${tr(t)}<`)
    .replace(/aria-label="([^"]+)"/g, (m, t) => `aria-label="${tr(t)}"`)
}
