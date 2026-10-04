/**
 * GUARDA — a IA que a app `/app-mobile` toca entra TODA pela porta única (`lib/ia/chamar.ts`).
 *
 * A 04/10 a Anthropic e a OpenAI ficaram sem crédito e o dono mandou: «a IA de todos os
 * componentes de app-mobile deve estar 100% funcional». A resposta foi a cadeia
 * groq → gemini → ollama → openai → anthropic em `chamarIA`. Esta guarda impede o regresso:
 * FALHA se alguma rota alcançável a partir da app voltar a importar `@anthropic-ai/sdk`/`openai`
 * ou a ler `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` à mão.
 *
 * Como segue o caminho (em código, não à mão):
 *   1. parte de `app/app-mobile/` e segue os imports `@/components|hooks|contexts|lib` do lado
 *      do cliente (transitivo) — é o conjunto de componentes que a app pode montar;
 *   2. nesses ficheiros apanha os `fetch('/api/…')` literais (também com `${…}` nos segmentos) e
 *      resolve cada um ao `app/api/…/route.ts`, incluindo segmentos dinâmicos `[id]`;
 *   3. de cada rota segue os imports do servidor (transitivo, só ficheiros do projecto);
 *   4. em cada ficheiro alcançado, SEM comentários, procura importação directa dos SDK ou leitura
 *      directa das chaves. `lib/ia/` é o único sítio onde isso é permitido.
 *
 * Também imprime o mapa componente → rota → usa IA → migrada, para a auditoria ler.
 *
 *   npx tsx lib/__tests__/app-mobile-ia.check.ts
 */
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..', '..')
const EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

// ───────────────────────────── utilitários de ficheiros ─────────────────────────────

function existe(p: string) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/** Resolve um import `@/x/y` ou relativo a um ficheiro do projecto; `null` se for pacote externo. */
function resolverImport(deFicheiro: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(RAIZ, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(deFicheiro), spec)
  else return null
  if (existe(base)) return base
  for (const e of EXT) if (existe(base + e)) return base + e
  for (const e of EXT) if (existe(path.join(base, 'index' + e))) return path.join(base, 'index' + e)
  return null
}

/** Tira comentários de linha e de bloco — a guarda não deve apanhar explicações. Mantém strings. */
export function semComentarios(src: string): string {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && d === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      out += c
      i++
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        out += src[i]
        i++
      }
      out += src[i] ?? ''
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

const cacheSrc = new Map<string, string>()
function ler(p: string): string {
  let s = cacheSrc.get(p)
  if (s === undefined) {
    s = semComentarios(fs.readFileSync(p, 'utf8'))
    cacheSrc.set(p, s)
  }
  return s
}

const RE_IMPORT = /(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g

function importsDe(p: string): string[] {
  const src = ler(p)
  const out: string[] = []
  for (const m of src.matchAll(RE_IMPORT)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (!spec) continue
    const r = resolverImport(p, spec)
    if (r) out.push(r)
  }
  return out
}

function listarRecursivo(dir: string, filtro: (p: string) => boolean): string[] {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...listarRecursivo(p, filtro))
    else if (filtro(p)) out.push(p)
  }
  return out
}

// ───────────────────────────── 1. componentes da app ─────────────────────────────

/** Ficheiros do lado do cliente alcançáveis a partir de app/app-mobile (transitivo). */
export function componentesDaApp(): string[] {
  const inicio = listarRecursivo(path.join(RAIZ, 'app', 'app-mobile'), (p) => /\.(tsx?|jsx?)$/.test(p))
  const vistos = new Set<string>()
  const fila = [...inicio]
  while (fila.length) {
    const f = fila.pop()!
    if (vistos.has(f)) continue
    vistos.add(f)
    for (const imp of importsDe(f)) {
      // Do lado do cliente só interessa o que pode montar ecrãs ou fazer fetch: components, hooks,
      // contexts e lib. O resto (app/api) é servidor e trata-se no passo 3.
      const rel = path.relative(RAIZ, imp)
      if (/^(components|hooks|contexts|lib)\//.test(rel) || (rel.startsWith('app/') && !rel.startsWith('app/api/'))) fila.push(imp)
    }
    // Páginas EMBUTIDAS na app (iframe no separador Apps: `url: "/mtmsocial"`, `src="/x"`) fazem
    // parte do que o utilizador vê dentro da app — seguem-se como raiz de cliente. Um `href` para
    // outra página é navegação para fora e NÃO se segue (puxaria o site inteiro).
    for (const pag of paginasEmbutidas(f)) fila.push(pag)
  }
  return [...vistos].sort()
}

const RE_EMBUTIDA = /(?:\burl\s*:|\bsrc\s*=)\s*['"`](\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)['"`]/gi
function paginasEmbutidas(p: string): string[] {
  const out: string[] = []
  for (const m of ler(p).matchAll(RE_EMBUTIDA)) {
    for (const e of ['.tsx', '.ts', '.jsx', '.js']) {
      const pag = path.join(RAIZ, 'app', m[1], 'page' + e)
      if (existe(pag)) out.push(pag)
    }
  }
  return out
}

// ───────────────────────────── 2. fetch → rota ─────────────────────────────

// Qualquer literal `/api/…` no cliente conta: não só `fetch('/api/…')` directo, também os que
// passam por helpers (`apiFetch`, ternários, `${base}/api/…`). Superconjunto de propósito — mais
// vale seguir uma rota a mais do que deixar escapar uma com IA.
const RE_FETCH = /(['"`])(?:\$\{[^}]*\})?(\/api\/[^'"`\s]*?)\1|(['"`])(?:\$\{[^}]*\})?(\/api\/[^'"`\s?]*)/g
// `/api/x/${id}/y?z` vira `/api/x/·/y` com `·` = `*` (um `${…}` conta como um segmento dinâmico).
export function normalizarCaminho(c: string): string {
  const semQuery = c.split('?')[0]
  return semQuery
    .split('/')
    .map((s) => (s.includes('${') ? '*' : s))
    .join('/')
    .replace(/\/$/, '')
}

export function fetchesDe(p: string): string[] {
  const src = ler(p)
  const out = new Set<string>()
  for (const m of src.matchAll(RE_FETCH)) {
    const c = m[2] ?? m[4]
    if (c) out.add(normalizarCaminho(c))
  }
  return [...out]
}

// `/api/a/·/b` (· = segmento dinâmico) resolve a `app/api/a/[qualquer]/b/route.ts`, ou null se não existir.
export function ficheiroDaRota(caminho: string): string | null {
  const segs = caminho.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  function desce(dir: string, i: number): string | null {
    if (i === segs.length) {
      for (const e of ['.ts', '.js']) if (existe(path.join(dir, 'route' + e))) return path.join(dir, 'route' + e)
      return null
    }
    const seg = segs[i]
    if (!fs.existsSync(dir)) return null
    const filhos = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())
    if (seg !== '*') {
      const exacto = filhos.find((d) => d.name === seg)
      if (exacto) {
        const r = desce(path.join(dir, exacto.name), i + 1)
        if (r) return r
      }
    }
    // segmento dinâmico `[x]` apanha qualquer valor (incluindo um literal, se não houver exacto)
    for (const d of filhos) {
      if (/^\[.+\]$/.test(d.name)) {
        const r = desce(path.join(dir, d.name), i + 1)
        if (r) return r
      }
    }
    return null
  }
  return desce(path.join(RAIZ, 'app', 'api'), 0)
}

// ───────────────────────────── 3. rota → ficheiros do servidor ─────────────────────────────

export function alcancaveisDoServidor(rota: string): string[] {
  const vistos = new Set<string>()
  const fila = [rota]
  while (fila.length) {
    const f = fila.pop()!
    if (vistos.has(f)) continue
    vistos.add(f)
    for (const imp of importsDe(f)) fila.push(imp)
  }
  return [...vistos]
}

// ───────────────────────────── 4. detectar IA ─────────────────────────────

const RE_SDK_DIRECTO = /from\s+['"](@anthropic-ai\/sdk|openai)['"]|require\(\s*['"](@anthropic-ai\/sdk|openai)['"]\s*\)/
const RE_CHAVE_DIRECTA = /\b(ANTHROPIC_API_KEY|OPENAI_API_KEY)\b/
const RE_HTTP_DIRECTO = /api\.anthropic\.com|api\.openai\.com/
// Gemini/Groq/Ollama à mão também saltam a cadeia (sem reserva, sem livro): ficam marcados como
// «usa IA» e como violação — a porta única é a única porta.
const RE_OUTRA_IA_DIRECTA = /\b(GEMINI_API_KEY|GROQ_API_KEY|OLLAMA_URL)\b|generativelanguage\.googleapis\.com|api\.groq\.com/
const RE_PORTA = /from\s+['"]@\/lib\/ia\/chamar['"]|lib\/ia\/chamar/

function ehNucleo(p: string) {
  return path.relative(RAIZ, p).startsWith('lib/ia/')
}

export type Achado = { ficheiro: string; motivo: string }

/** Devolve a lista de violações num conjunto de ficheiros do servidor (fora de lib/ia). */
export function violacoes(ficheiros: string[]): Achado[] {
  const out: Achado[] = []
  for (const f of ficheiros) {
    if (ehNucleo(f)) continue
    const src = ler(f)
    const rel = path.relative(RAIZ, f)
    const sdk = src.match(RE_SDK_DIRECTO)
    if (sdk) out.push({ ficheiro: rel, motivo: `importa ${sdk[1] ?? sdk[2]} directamente` })
    const chave = src.match(RE_CHAVE_DIRECTA)
    if (chave) out.push({ ficheiro: rel, motivo: `lê ${chave[1]} directamente` })
    const http = src.match(RE_HTTP_DIRECTO)
    if (http) out.push({ ficheiro: rel, motivo: `chama ${http[0]} directamente` })
    const outra = src.match(RE_OUTRA_IA_DIRECTA)
    if (outra) out.push({ ficheiro: rel, motivo: `usa ${outra[0]} fora da cadeia` })
  }
  return out
}

export function usaPorta(ficheiros: string[]): boolean {
  return ficheiros.some((f) => !ehNucleo(f) && RE_PORTA.test(ler(f)))
}

// ───────────────────────────── relatório + veredicto ─────────────────────────────

export type LinhaMapa = {
  componente: string
  rota: string
  ficheiroRota: string | null
  usaIA: boolean
  migrada: boolean
  violacoes: Achado[]
}

export function mapa(): LinhaMapa[] {
  const linhas: LinhaMapa[] = []
  for (const comp of componentesDaApp()) {
    for (const rota of fetchesDe(comp)) {
      const fr = ficheiroDaRota(rota)
      if (!fr) {
        linhas.push({ componente: path.relative(RAIZ, comp), rota, ficheiroRota: null, usaIA: false, migrada: false, violacoes: [] })
        continue
      }
      const alc = alcancaveisDoServidor(fr)
      const viol = violacoes(alc)
      const porta = usaPorta(alc) || alc.some(ehNucleo)
      linhas.push({
        componente: path.relative(RAIZ, comp),
        rota,
        ficheiroRota: path.relative(RAIZ, fr),
        usaIA: porta || viol.length > 0,
        migrada: porta && viol.length === 0,
        violacoes: viol,
      })
    }
  }
  return linhas
}

if (require.main === module) {
  const linhas = mapa()
  const comps = new Set(linhas.map((l) => l.componente))
  const rotas = new Map<string, LinhaMapa>()
  for (const l of linhas) if (l.ficheiroRota && !rotas.has(l.ficheiroRota)) rotas.set(l.ficheiroRota, l)
  const comIA = [...rotas.values()].filter((l) => l.usaIA)
  const semFicheiro = linhas.filter((l) => !l.ficheiroRota).map((l) => `${l.rota} (${l.componente})`)

  console.log(`componentes com fetch: ${comps.size} · rotas distintas: ${rotas.size} · rotas com IA: ${comIA.length}`)
  if (process.argv.includes('--mapa')) {
    for (const l of linhas) console.log(`${l.componente} → ${l.rota} → ${l.ficheiroRota ?? '(sem ficheiro)'} → IA:${l.usaIA ? 'sim' : 'não'} → migrada:${l.migrada ? 'sim' : l.usaIA ? 'NÃO' : '-'}`)
  }
  console.log('\n— rotas com IA —')
  for (const l of comIA) {
    const quem = linhas.filter((x) => x.ficheiroRota === l.ficheiroRota).map((x) => path.basename(x.componente))
    console.log(`  ${l.rota} → ${l.ficheiroRota} · ${l.migrada ? 'migrada' : 'NÃO MIGRADA'} · ${[...new Set(quem)].join(', ')}`)
  }
  if (semFicheiro.length) {
    console.log('\n— rotas chamadas sem ficheiro (aviso, não falha) —')
    for (const s of semFicheiro) console.log(`  ${s}`)
  }

  const todas = new Map<string, Achado>()
  for (const l of linhas) for (const v of l.violacoes) todas.set(`${v.ficheiro}|${v.motivo}`, v)
  if (todas.size) {
    console.log('\n✗ FALHA — rotas da app-mobile com IA fora da porta única:')
    for (const v of todas.values()) console.log(`  ${v.ficheiro}: ${v.motivo}`)
    process.exit(1)
  }
  console.log('\n✓ guarda app-mobile-ia: nenhuma rota da app chama Anthropic/OpenAI à mão.')
}
