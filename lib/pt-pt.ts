/**
 * PORTUGUÊS DE PORTUGAL — a régua dos textos que a casa publica.
 *
 * Pedido do Ricardo (06/11/2026): os textos das capas, dos ganchos e das legendas dos reels
 * automáticos saíam «muito abrasileirados» e com gramática fraca. As IAs grátis (Groq, Gemini)
 * escrevem português do Brasil por defeito, mesmo quando o prompt pede PT-PT. Por isso há três
 * camadas, todas a partir desta fonte única:
 *
 *  1. `regrasPtPtParaPrompt()` — o glossário que vai no prompt (via `blocoFramework('conteudo')`).
 *  2. `corrigirPtPt()` — troca automática do que é seguro trocar sem mexer no sentido
 *     (celular → telemóvel, na tela → no ecrã, estou fazendo → estou a fazer, Comente → Comenta…).
 *  3. `verificarPtPt()` — o que sobra e pede reescrita (você, a gente, «Me diz» no início da
 *     frase…). Quem gera conteúdo pede outra versão à IA; o AG-OPERADOR não aprova.
 *
 * Só se aplica a texto escrito pela IA (gancho, capa, legenda, título). A fala transcrita de um
 * educador é dele e não se corrige. Nomes de produtos, scanners, educadores e cursos nunca se
 * traduzem — nenhuma regra daqui toca em nomes próprios da casa.
 *
 * Puro e sem dependências: a guarda `pt-pt.check.ts` prova-o sem rede.
 */

export type TipoPtPt = 'vocabulario' | 'tratamento' | 'gerundio' | 'grafia' | 'construcao'

export interface Troca {
  de: string
  para: string
  tipo: TipoPtPt
}

export interface Brasileirismo {
  trecho: string
  sugestao: string
  tipo: TipoPtPt
}

// Fronteiras de palavra que percebem acentos (o \b do JavaScript só conhece ASCII).
const A = '(?<![\\p{L}\\p{N}])'
const Z = '(?![\\p{L}\\p{N}])'
// Início de frase: início do texto, depois de pontuação final, quebra de linha, aspas ou emoji.
const INICIO = '(?<=(?:^|[\\n.!?:;»"“(]|\\p{Extended_Pictographic})[ \\t\\u00a0]*)'

const palavra = (p: string) => new RegExp(`${A}${p}${Z}`, 'giu')

/** Mantém a caixa do original: «CELULAR» → «TELEMÓVEL», «Celular» → «Telemóvel». */
function comCaixa(original: string, troca: string): string {
  const letras = original.replace(/[^\p{L}]/gu, '')
  if (letras.length > 1 && letras === letras.toUpperCase() && letras !== letras.toLowerCase()) return troca.toUpperCase()
  if (original[0] && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return troca[0].toUpperCase() + troca.slice(1)
  }
  return troca
}

interface RegraTroca {
  re: RegExp
  para: string | ((m: string, ...g: string[]) => string)
  tipo: TipoPtPt
}

/** Troca palavra a palavra, por um termo PT-PT do mesmo género e número. */
const VOCABULARIO: [string, string][] = [
  ['celular', 'telemóvel'],
  ['celulares', 'telemóveis'],
  ['usuário', 'utilizador'],
  ['usuários', 'utilizadores'],
  ['usuária', 'utilizadora'],
  ['registro', 'registo'],
  ['registros', 'registos'],
  ['cadastro', 'registo'],
  ['cadastros', 'registos'],
  ['cadastre-se', 'regista-te'],
  ['cadastrar', 'registar'],
  ['equipe', 'equipa'],
  ['equipes', 'equipas'],
  ['contato', 'contacto'],
  ['contatos', 'contactos'],
  ['de fato', 'de facto'],
  ['seção', 'secção'],
  ['seções', 'secções'],
  ['compartilhar', 'partilhar'],
  ['compartilha', 'partilha'],
  ['compartilhe', 'partilha'],
  ['compartilhado', 'partilhado'],
  ['compartilhada', 'partilhada'],
  ['comente', 'comenta'],
  ['iniciante', 'principiante'],
  ['iniciantes', 'principiantes'],
  ['estresse', 'stress'],
  ['estressado', 'stressado'],
  ['estressada', 'stressada'],
  ['grana', 'dinheiro'],
  ['galera', 'malta'],
  ['bacana', 'fixe'],
  ['ônibus', 'autocarro'],
  ['trem', 'comboio'],
  ['banheiro', 'casa de banho'],
  ['geladeira', 'frigorífico'],
  ['café da manhã', 'pequeno-almoço'],
  ['esporte', 'desporto'],
  ['esportes', 'desportos'],
  ['planilha', 'folha de cálculo'],
  ['planilhas', 'folhas de cálculo'],
  ['mídias sociais', 'redes sociais'],
  ['pra', 'para'],
  ['tô', 'estou'],
  ['oi', 'olá'],
]

/** «a tela» → «o ecrã», «o app» → «a app»: o artigo muda de género com a palavra. */
const ARTIGOS_FEM_MASC: Record<string, string> = {
  a: 'o', na: 'no', da: 'do', pela: 'pelo', uma: 'um', numa: 'num', duma: 'dum',
  esta: 'este', essa: 'esse', nesta: 'neste', nessa: 'nesse', desta: 'deste', dessa: 'desse',
  tua: 'teu', sua: 'seu', minha: 'meu', nossa: 'nosso', toda: 'todo', mesma: 'mesmo', própria: 'próprio',
  as: 'os', nas: 'nos', das: 'dos', pelas: 'pelos', estas: 'estes', essas: 'esses', tuas: 'teus', suas: 'seus', todas: 'todos',
}
const ARTIGOS_MASC_FEM: Record<string, string> = Object.fromEntries(Object.entries(ARTIGOS_FEM_MASC).map(([f, m]) => [m, f]))
const ARTS_F = Object.keys(ARTIGOS_FEM_MASC).sort((x, y) => y.length - x.length).join('|')
const ARTS_M = Object.keys(ARTIGOS_MASC_FEM).sort((x, y) => y.length - x.length).join('|')

function regraGenero(palavraBr: string, pluralBr: string, singPt: string, plurPt: string, de: 'fem' | 'masc'): RegraTroca {
  const arts = de === 'fem' ? ARTS_F : ARTS_M
  const mapa = de === 'fem' ? ARTIGOS_FEM_MASC : ARTIGOS_MASC_FEM
  return {
    re: new RegExp(`${A}(?:(${arts})(\\s+))?(${palavraBr}|${pluralBr})${Z}`, 'giu'),
    para: (m: string, artigo?: string, espaco?: string, nome?: string) => {
      const plural = (nome ?? '').toLowerCase() === pluralBr
      const novo = comCaixa(nome ?? m, plural ? plurPt : singPt)
      if (!artigo) return novo
      return `${comCaixa(artigo, mapa[artigo.toLowerCase()] ?? artigo)}${espaco}${novo}`
    },
    tipo: 'vocabulario',
  }
}

const REGRAS_GENERO: RegraTroca[] = [
  regraGenero('tela', 'telas', 'ecrã', 'ecrãs', 'fem'),
  regraGenero('aplicativo', 'aplicativos', 'aplicação', 'aplicações', 'masc'),
  regraGenero('app', 'apps', 'app', 'apps', 'masc'),
]

/** Imperativo de «você» no início da frase → imperativo de «tu». */
const IMPERATIVOS: [string, string][] = [
  ['Clique', 'Clica'], ['Salve', 'Guarda'], ['Siga', 'Segue'], ['Confira', 'Vê'], ['Veja', 'Vê'],
  ['Assista', 'Vê'], ['Aprenda', 'Aprende'], ['Descubra', 'Descobre'], ['Faça', 'Faz'], ['Comece', 'Começa'],
  ['Proteja', 'Protege'], ['Invista', 'Investe'], ['Acesse', 'Acede a'], ['Baixe', 'Descarrega'],
  ['Envie', 'Envia'], ['Mande', 'Manda'], ['Deixe', 'Deixa'], ['Marque', 'Marca'], ['Saiba', 'Fica a saber'],
  ['Pense', 'Pensa'], ['Imagine', 'Imagina'], ['Esqueça', 'Esquece'], ['Lembre-se', 'Lembra-te'],
  ['Inscreva-se', 'Inscreve-te'], ['Junte-se', 'Junta-te'], ['Prepare-se', 'Prepara-te'],
  ['Pare', 'Para'], ['Experimente', 'Experimenta'],
  ['Garanta', 'Garante'], ['Aproveite', 'Aproveita'], ['Responda', 'Responde'], ['Escreva', 'Escreve'],
]

/**
 * Gerúndio depois de auxiliar (estou fazendo, vai ficando) → «a + infinitivo».
 * O infinitivo sai de trocar «-ndo» por «-r»: fazendo → fazer, indo → ir, vendo → ver.
 */
const AUXILIARES =
  'estou|estás|está|estamos|estão|estava|estavas|estávamos|estavam|esteve|estive|estar|' +
  'fico|ficas|fica|ficamos|ficam|ficar|continuo|continuas|continua|continuam|continuar|' +
  'ando|andas|anda|andam|andar|vive|vives|vivem|passa|passas|passam|tá|tô'
const NAO_SAO_GERUNDIO = new Set([
  'quando', 'lindo', 'linda', 'mundo', 'segundo', 'fundo', 'comando', 'bando', 'brando', 'tremendo',
  'estupendo', 'horrendo',
])
const GERUNDIO = new RegExp(`${A}(${AUXILIARES})(\\s+)([\\p{L}]*?)([aei])ndo${Z}`, 'giu')

/** Acentos do Brasil antes de m/n (econômico, prêmio, bônus) → acento de Portugal. */
const ACENTO_BR = new RegExp(`${A}[\\p{L}]*[êôÊÔ](?=[mnMN][aeiouáéíóúAEIOU])[\\p{L}]*${Z}`, 'gu')
const ACENTO_IGUAL_NOS_DOIS = new Set(['ênfase', 'fêmea', 'fêmeas', 'êmbolo'])

const REGRAS_TROCA: RegraTroca[] = [
  ...VOCABULARIO.map(([br, pt]): RegraTroca => ({
    re: palavra(br.replace(/ /g, '\\s+')),
    para: (m: string) => comCaixa(m, pt),
    tipo: 'vocabulario',
  })),
  ...REGRAS_GENERO,
  ...IMPERATIVOS.map(([br, pt]): RegraTroca => ({
    re: new RegExp(`${INICIO}${br}${Z}`, 'giu'),
    para: (m: string) => comCaixa(m, pt),
    tipo: 'tratamento',
  })),
  {
    re: GERUNDIO,
    para: (m: string, aux: string, esp: string, raiz: string, vogal: string) => {
      const ger = `${raiz}${vogal}ndo`
      if (NAO_SAO_GERUNDIO.has(ger.toLowerCase())) return m
      const auxPt = aux.toLowerCase() === 'tá' ? comCaixa(aux, 'está') : aux.toLowerCase() === 'tô' ? comCaixa(aux, 'estou') : aux
      const caps = `${raiz}${vogal}` === `${raiz}${vogal}`.toUpperCase()
      const inf = `${raiz}${vogal}r`
      return `${auxPt}${esp}${caps ? 'A' : 'a'} ${caps ? inf.toUpperCase() : inf}`
    },
    tipo: 'gerundio',
  },
  {
    re: ACENTO_BR,
    para: (m: string) => (ACENTO_IGUAL_NOS_DOIS.has(m.toLowerCase()) ? m : m.replace(/ê/g, 'é').replace(/ô/g, 'ó').replace(/Ê/g, 'É').replace(/Ô/g, 'Ó')),
    tipo: 'grafia',
  },
]

/** Troca o que é seguro trocar. Devolve o texto novo e a lista do que mudou. */
export function corrigirPtPt(texto: string): { texto: string; trocas: Troca[] } {
  let t = String(texto ?? '')
  const trocas: Troca[] = []
  for (const r of REGRAS_TROCA) {
    t = t.replace(r.re, (...args: unknown[]) => {
      const m = args[0] as string
      const grupos = args.slice(1).filter((x) => typeof x === 'string' || x === undefined) as string[]
      const novo = typeof r.para === 'function' ? r.para(m, ...grupos) : r.para
      if (novo !== m) trocas.push({ de: m, para: novo, tipo: r.tipo })
      return novo
    })
  }
  return { texto: t, trocas }
}

/** O que não se troca sozinho: pede outra frase. */
const SINAIS: { re: RegExp; sugestao: string; tipo: TipoPtPt; aceita?: (m: RegExpExecArray) => boolean }[] = [
  { re: palavra('você'), sugestao: 'trata por «tu» (e o verbo na 2.ª pessoa: tu fazes, tu tens)', tipo: 'tratamento' },
  { re: palavra('a gente'), sugestao: '«nós» (com o verbo na 1.ª do plural)', tipo: 'tratamento' },
  { re: new RegExp(`${INICIO}(?:Me|Te)\\s+[\\p{L}]+`, 'gu'), sugestao: 'pronome depois do verbo: «Diz-me», «Mostro-te»', tipo: 'construcao' },
  {
    re: GERUNDIO,
    sugestao: '«a + infinitivo»: «estás a perder», não «estás perdendo»',
    tipo: 'gerundio',
    aceita: (m) => !NAO_SAO_GERUNDIO.has(`${m[3]}${m[4]}ndo`.toLowerCase()),
  },
  { re: palavra('né'), sugestao: '«certo?», «não é?»', tipo: 'vocabulario' },
  { re: palavra('bilhão|bilhões|bilhao|bilhoes'), sugestao: '«mil milhões» (o bilião português é um milhão de milhões)', tipo: 'vocabulario' },
  { re: palavra('trilhão|trilhões'), sugestao: '«bilião» (escala longa)', tipo: 'vocabulario' },
  { re: palavra('mídia|mídias'), sugestao: '«media», «redes sociais» ou «meios»', tipo: 'vocabulario' },
  { re: palavra('acessar|acesse|acessa'), sugestao: '«aceder a» / «entra em»', tipo: 'vocabulario' },
  { re: palavra('baixar|baixe|baixa o app|baixa a app'), sugestao: '«descarregar» (quando é instalar)', tipo: 'vocabulario' },
  { re: palavra('arquivo|arquivos'), sugestao: '«ficheiro»', tipo: 'vocabulario' },
  { re: palavra('na real|valeu|beleza\\?|moleza|cara,'), sugestao: 'calão do Brasil: diz como se diz em Portugal', tipo: 'vocabulario' },
  { re: palavra('se cadastrar|se registrar|registrar'), sugestao: '«registar-te»', tipo: 'vocabulario' },
]

/** Lista o que ainda soa a Brasil depois da correcção automática. Vazio = passa. */
export function verificarPtPt(texto: string): Brasileirismo[] {
  const t = String(texto ?? '')
  const out: Brasileirismo[] = []
  for (const s of SINAIS) {
    const re = new RegExp(s.re.source, s.re.flags)
    for (const m of t.matchAll(re)) {
      if (s.aceita && !s.aceita(m)) continue
      out.push({ trecho: m[0], sugestao: s.sugestao, tipo: s.tipo })
      break
    }
  }
  // Uma troca que a correcção não fez porque a regra a deixou passar (ex.: gerúndio sem auxiliar
  // conhecido) não entra aqui de propósito: «Fazendo isto, ganhas tempo» é português de Portugal.
  return out
}

/** Corrige todas as strings de um objecto (um roteiro, um guião) sem mexer na forma. */
export function corrigirObjectoPtPt<T>(obj: T, trocas: Troca[] = []): { valor: T; trocas: Troca[] } {
  const passar = (x: unknown): unknown => {
    if (typeof x === 'string') {
      const r = corrigirPtPt(x)
      trocas.push(...r.trocas)
      return r.texto
    }
    if (Array.isArray(x)) return x.map(passar)
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, passar(v)]))
    return x
  }
  return { valor: passar(obj) as T, trocas }
}

/** Todos os brasileirismos de um objecto, sem repetidos. */
export function verificarObjectoPtPt(obj: unknown): Brasileirismo[] {
  const out: Brasileirismo[] = []
  const vistos = new Set<string>()
  const andar = (x: unknown) => {
    if (typeof x === 'string') {
      for (const b of verificarPtPt(x)) {
        const k = b.trecho.toLowerCase()
        if (!vistos.has(k)) { vistos.add(k); out.push(b) }
      }
    } else if (Array.isArray(x)) x.forEach(andar)
    else if (x && typeof x === 'object') Object.values(x).forEach(andar)
  }
  andar(obj)
  return out
}

/**
 * Parece português? A correcção só corre em texto em português: um flyer em inglês não tem nada
 * a ganhar com isto e não deve ser tocado.
 */
export function parecePortugues(texto: string): boolean {
  const t = ` ${String(texto ?? '').toLowerCase()} `
  const pistas = [' não ', ' que ', ' de ', ' para ', ' com ', ' tu ', ' teu ', ' tua ', ' é ', ' uma ', ' os ', ' as ', ' você ', ' está ']
  return pistas.filter((p) => t.includes(p)).length >= 2
}

/** O glossário para o prompt. Sem algarismos: entra no bloco do framework, que os proíbe. */
export function regrasPtPtParaPrompt(): string {
  const exemplos = [
    'tela → ecrã', 'celular → telemóvel', 'aplicativo → aplicação ou app (feminino: a app)', 'usuário → utilizador',
    'cadastro → registo', 'equipe → equipa', 'contato → contacto', 'compartilhar → partilhar', 'baixar → descarregar',
    'acessar → aceder a', 'arquivo → ficheiro', 'iniciante → principiante', 'galera → malta', 'grana → dinheiro',
    'bilhão → mil milhões', 'ônibus → autocarro', 'econômico → económico', 'prêmio → prémio', 'bônus → bónus',
  ]
  return [
    'PORTUGUÊS DE PORTUGAL (regra do dono; o texto é verificado por código e devolvido se falhar):',
    '· Trata sempre por «tu», com o verbo na segunda pessoa: «tu fazes», «o teu dinheiro», «Comenta», «Clica», «Guarda este post». Nunca «você», «seu dinheiro», «Comente», «Clique».',
    '· Nada de gerúndio depois de auxiliar: «estou a fazer», «continua a subir», «anda a perder», nunca «estou fazendo», «continua subindo».',
    '· Pronome depois do verbo no início da frase: «Diz-me», «Mostro-te», «Lembra-te». Nunca «Me diz», «Te mostro».',
    '· «nós» em vez de «a gente»; «certo?» em vez de «né?»; sem calão do Brasil (valeu, beleza, na real, cara).',
    `· Vocabulário: ${exemplos.join('; ')}.`,
    '· Gramática cuidada: concordância de género e número, acentos e pontuação certos, frases completas mesmo quando curtas. Lê o texto como um português o leria antes de o devolver.',
    '· Os nomes de produtos, scanners, educadores e cursos ficam como estão — não se traduzem nem se aportuguesam.',
  ].join('\n')
}
