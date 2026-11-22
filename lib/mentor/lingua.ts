/**
 * LÍNGUA DO ALUNO, decidida no servidor (22/11).
 *
 * O teste de população de 18/11 mostrou o Mentor a responder em português a alunos que escreveram em
 * italiano, alemão e polaco: as instruções estão em português e os modelos grátis «escorregam» para
 * a língua do prompt. A regra escrita não chega; por isso o servidor adivinha a língua da última
 * mensagem, diz-la ao modelo pelo nome (e em inglês, que os modelos pequenos obedecem melhor) e
 * confirma a resposta. Heurística barata, sem dependências: palavras frequentes + alfabeto.
 * Quando não tem a certeza devolve null e vale a regra escrita.
 */

const PALAVRAS: Record<string, string[]> = {
  pt: ["não", "estou", "tenho", "isto", "obrigado", "também", "porque", "então", "está", "você", "uma", "com", "para", "mas", "já", "muito", "dinheiro", "quero", "sei", "fazer", "conta", "perdi", "agora", "aqui", "como", "isso", "estás", "tu"],
  en: ["the", "and", "is", "are", "you", "this", "that", "what", "how", "want", "have", "don't", "dont", "not", "with", "for", "but", "just", "money", "lost", "know", "can", "my", "it's", "i'm", "im"],
  es: ["que", "estoy", "tengo", "pero", "esto", "cómo", "dinero", "quiero", "también", "porque", "muy", "ahora", "perdí", "sé", "hacer", "cuenta", "usted", "eso", "aquí", "nada", "algo", "puedo"],
  fr: ["je", "suis", "pas", "est", "les", "des", "une", "pour", "mais", "avec", "c'est", "j'ai", "argent", "veux", "comment", "très", "aussi", "ça", "vous", "perdu", "faire", "compte"],
  de: ["ich", "nicht", "und", "ist", "das", "mit", "aber", "habe", "wie", "geld", "will", "auch", "sehr", "jetzt", "verloren", "kann", "mein", "sicher", "warum", "bin", "net", "ned", "des", "is"],
  it: ["non", "sono", "che", "ho", "per", "una", "con", "ma", "come", "soldi", "voglio", "anche", "molto", "adesso", "perso", "posso", "questo", "sta", "roba", "nn", "fidarmi", "capire"],
  nl: ["ik", "niet", "het", "een", "en", "maar", "heb", "wil", "hoe", "geld", "ook", "nu", "verloren", "kan", "mijn", "graag", "weet", "met", "voor", "dat", "nog", "zijn"],
  pl: ["nie", "jest", "się", "mam", "ale", "jak", "chcę", "chce", "pieniądze", "kasę", "kase", "też", "teraz", "straciłem", "moje", "czy", "co", "to", "na", "już", "wiem", "bardzo"],
  ro: ["nu", "este", "și", "si", "am", "dar", "cum", "bani", "vreau", "acum", "pierdut", "pot", "foarte", "asta", "sunt", "mai", "ce", "știu", "stiu", "pentru"],
}

const BR = /\b(você|voce|vc|vcs|tá|ta |tô|to |a gente|grana|legal|cara|né|beleza|ônibus|celular|tela)\b/i

/** Código da língua dominante da mensagem, ou null se for curta/ambígua. */
export function detetarLingua(texto: string): string | null {
  const t = (texto || "").toLowerCase()
  if (/[؀-ۿ]/.test(t)) return "ar"
  if ((t.match(/[Ѐ-ӿ]/g) || []).length > 3) return "ru"
  const palavras = t.replace(/[^\p{L}'\s]/gu, " ").split(/\s+/).filter(Boolean)
  if (palavras.length < 3) return null
  const pontos: Record<string, number> = {}
  for (const [lingua, lista] of Object.entries(PALAVRAS)) {
    const s = new Set(lista)
    pontos[lingua] = palavras.reduce((n, p) => n + (s.has(p) ? 1 : 0), 0)
  }
  // Diacríticos que só uma língua tem desempatam.
  if (/[ąęłńśźż]/.test(t)) pontos.pl += 3
  if (/[ăâîșşțţ]/.test(t)) pontos.ro += 2
  if (/[ãõç]/.test(t)) pontos.pt += 2
  if (/[ñ¿¡]/.test(t)) pontos.es += 2
  if (/[äöüß]/.test(t)) pontos.de += 2
  if (/[èàù]/.test(t) && /\b(je|les|des|est)\b/.test(t)) pontos.fr += 1
  const ordem = Object.entries(pontos).sort((a, b) => b[1] - a[1])
  const [melhor, segundo] = ordem
  if (!melhor || melhor[1] < 2 || melhor[1] - (segundo?.[1] || 0) < 1) return null
  if (melhor[0] === "pt" && BR.test(t)) return "pt-BR"
  return melhor[0]
}

export const NOME_LINGUA_EN: Record<string, string> = {
  pt: "European Portuguese", "pt-BR": "Brazilian Portuguese", en: "English", es: "Spanish", fr: "French",
  de: "German", it: "Italian", nl: "Dutch", pl: "Polish", ro: "Romanian", ar: "Arabic", ru: "Russian",
}

/** A resposta está na língua pedida? (pt e pt-BR contam como a mesma; sem certeza conta como sim.) */
export function respostaNaLingua(resposta: string, esperada: string): boolean {
  const vista = detetarLingua(resposta)
  if (!vista) return true
  const base = (l: string) => (l.startsWith("pt") ? "pt" : l)
  return base(vista) === base(esperada)
}

/**
 * Alguns modelos grátis devolvem o raciocínio em vez da resposta («The user is speaking Dutch…»,
 * listas de «* Draft 1:»). Tira blocos <think> e diz se o que sobra continua a parecer raciocínio.
 */
export function limparRaciocinio(texto: string): { texto: string; pareceRaciocinio: boolean } {
  const limpo = (texto || "").replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim()
  const inicio = limpo.slice(0, 160)
  const pareceRaciocinio =
    /^(the user|user is|user's|okay,? (so|the user|let)|we need to|let me|i need to|analy[sz]|thinking|\*\s*(goal|draft|status|tone|concept)\b)/i.test(inicio) ||
    /\*\s*(Draft \d|Option \d|Status:|Goal:|Blocker:)/.test(limpo.slice(0, 600))
  return { texto: limpo, pareceRaciocinio }
}
