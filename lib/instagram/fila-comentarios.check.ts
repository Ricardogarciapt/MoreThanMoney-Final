/**
 * AS GUARDAS DA FILA DE COMENTÁRIOS.
 *
 * O que se prova, e porquê:
 *   1. Não há NENHUM caminho de código que publique o comentário — nem POST ao Instagram/Graph,
 *      nem automação de browser. Lê-se o código da fila e tudo o que ele importa (transitivo).
 *      Publicar em posts de terceiros não existe na API e por fora põe a conta em risco.
 *   2. O tecto diário de 20 é respeitado — no código e no trigger da migração 189.
 *   3. O comentário não tem links (nem a função de avaliação os deixa passar, nem o `check` da
 *      tabela, que usa o mesmo padrão).
 *   4. «Publiquei» regista o agente (AG-PROSPECTOR), a hora e o post.
 *
 * Sem rede e sem base: funções puras e leitura de ficheiros.
 *
 *   npx tsx lib/instagram/fila-comentarios.check.ts
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  AGENTE_DA_FILA,
  PADRAO_LINK,
  POR_PASSAGEM,
  TECTO_DIARIO,
  arrumarComentario,
  avaliarComentario,
  quantosPodeEscrever,
  registoDePublicado,
  taxaDeResposta,
} from './fila-comentarios'

const RAIZ = resolve(__dirname, '..', '..')
let passou = 0
function caso(nome: string, f: () => void) {
  f()
  passou++
  console.log(`  ok  ${nome}`)
}

// ── 1. Nenhum caminho publica ─────────────────────────────────────────────────────────────────

/**
 * As portas de entrada da FILA. Tudo o que importam entra na leitura (transitivo) e nada disso
 * pode escrever no Instagram — nem sequer publicar posts nossos.
 */
const ENTRADAS_FILA = [
  'lib/instagram/fila-comentarios.ts',
  'lib/instagram/fila-comentarios-servidor.ts',
  'app/api/cron/fila-comentarios/route.ts',
  'app/api/admin/social/fila-comentarios/route.ts',
  'components/admin/fila-comentarios.tsx',
]

/**
 * As do RADAR (onde vive o botão «Escrever comentário»). O radar importa `publish.ts` só para
 * ler o token da conta; esse ficheiro publica posts NOSSOS (edges `media`/`media_publish` na
 * nossa conta) e é verificado à parte, abaixo, para nunca ganhar um edge de comentar.
 */
const ENTRADAS_RADAR = [
  'app/api/admin/social/radar/route.ts',
  'components/admin/radar-leads.tsx',
  'lib/instagram/radar.ts',
]
const PUBLICA_POSTS_NOSSOS = join(RAIZ, 'lib/instagram/publish.ts')

function resolverImport(de: string, alvo: string): string | null {
  let base: string
  if (alvo.startsWith('@/')) base = join(RAIZ, alvo.slice(2))
  else if (alvo.startsWith('.')) base = resolve(dirname(de), alvo)
  else return null // pacote de node_modules: vê-se pelo nome, abaixo
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const f = base + ext
    if (!existsSync(f)) continue
    try {
      readFileSync(f, 'utf8')
      return f
    } catch { /* é pasta */ }
  }
  return null
}

function lerCaminho(entradas: string[]) {
  const lidos = new Map<string, string>()
  const pacotes = new Set<string>()
  const pilha = entradas.map((f) => join(RAIZ, f))
  while (pilha.length) {
    const f = pilha.pop()!
    if (lidos.has(f)) continue
    const src = readFileSync(f, 'utf8')
    lidos.set(f, src)
    for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const alvo = m[1] ?? m[2] ?? m[3]
      const r = resolverImport(f, alvo)
      if (r) pilha.push(r)
      else if (!alvo.startsWith('.') && !alvo.startsWith('@/')) pacotes.add(alvo)
    }
  }
  return { lidos, pacotes }
}

const semComentariosDeCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1')

const AUTOMACAO = /^(puppeteer|puppeteer-core|playwright|playwright-core|@playwright\/test|selenium-webdriver|webdriverio|chrome-remote-interface|@browserbasehq\/.*|instagram-private-api|instagrapi)$/

/** Cada `fetch(` com o pedaço que se segue — o suficiente para ver o URL e o método. */
function chamadasFetch(src: string): string[] {
  const out: string[] = []
  let i = src.indexOf('fetch(')
  while (i >= 0) {
    out.push(src.slice(i, i + 400).split(/\n\s*\}\s*\)|\)\s*;|\)\.then/)[0])
    i = src.indexOf('fetch(', i + 6)
  }
  return out
}

function semEscritaAoInstagram(lidos: Map<string, string>, excepto: string[] = []) {
  for (const [f, cru] of lidos) {
    if (excepto.includes(f)) continue
    const src = semComentariosDeCodigo(cru)
    for (const chamada of chamadasFetch(src)) {
      const vaiAoInstagram = /graph\.facebook\.com|graph\.instagram\.com|instagram\.com|\bGRAPH\b/.test(chamada)
      const escreve = /method\s*:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/i.test(chamada)
      assert.ok(!(vaiAoInstagram && escreve), `${f}: fetch com escrita ao Instagram:\n${chamada}`)
    }
    // Endpoint de comentar (/{media}/comments ou /replies) com escrita, em qualquer forma.
    assert.ok(
      !/[`'"][^`'"\n]*\/(comments|replies)\b[^`'"\n]*[`'"][\s\S]{0,300}method\s*:\s*['"`]POST/i.test(src),
      `${f}: POST a /comments ou /replies`,
    )
    assert.ok(!/\b(puppeteer|playwright|selenium|webdriver)\b/i.test(src), `${f} fala em automação de browser`)
  }
}

const FILA = lerCaminho(ENTRADAS_FILA)
const RADAR = lerCaminho(ENTRADAS_RADAR)

caso(`leu ${FILA.lidos.size} ficheiros do caminho da fila e ${RADAR.lidos.size} do radar (transitivo)`, () => {
  assert.ok(FILA.lidos.size >= ENTRADAS_FILA.length)
  assert.ok(RADAR.lidos.size >= ENTRADAS_RADAR.length)
})

caso('nenhuma biblioteca de automação de browser ou de API privada do Instagram', () => {
  const maus = [...FILA.pacotes, ...RADAR.pacotes].filter((p) => AUTOMACAO.test(p))
  assert.deepEqual(maus, [], `importa: ${maus.join(', ')}`)
})

caso('o caminho da fila não escreve no Instagram, nem chega ao publicador de posts', () => {
  assert.ok(!FILA.lidos.has(PUBLICA_POSTS_NOSSOS), 'a fila passou a importar lib/instagram/publish.ts')
  semEscritaAoInstagram(FILA.lidos)
})

caso('o radar não escreve no Instagram (fora o publicador de posts nossos, visto abaixo)', () => {
  semEscritaAoInstagram(RADAR.lidos, [PUBLICA_POSTS_NOSSOS])
})

caso('o publicador de posts nossos só conhece os edges media e media_publish', () => {
  const src = readFileSync(PUBLICA_POSTS_NOSSOS, 'utf8')
  const edges = [...src.matchAll(/graphPost\(\s*[^,]+,\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1])
  assert.ok(edges.length > 0)
  for (const e of edges) assert.ok(['media', 'media_publish'].includes(e), `edge novo no publicador: ${e}`)
  assert.ok(!/\/(comments|replies)\b/.test(semComentariosDeCodigo(src)), 'o publicador fala em comments/replies')
})

caso('o fetch do browser na fila só fala com o nosso servidor', () => {
  const src = FILA.lidos.get(join(RAIZ, 'components/admin/fila-comentarios.tsx'))!
  const urls = [...src.matchAll(/fetch\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1])
  assert.ok(urls.length > 0)
  for (const u of urls) assert.ok(u.startsWith('/api/admin/social/'), `fetch para fora: ${u}`)
  // O post abre-se num separador para o DONO publicar — é um window.open, não um pedido.
  assert.ok(/window\.open\(/.test(src))
})

caso('a migração não tem estado «a publicar» nem forma de a base publicar', () => {
  const sql = readFileSync(join(RAIZ, 'supabase/migrations/189_fila_comentarios.sql'), 'utf8')
  assert.ok(!/net\.http_post|pg_net|http_post|extensions\.http/i.test(sql))
  assert.match(sql, /check \(estado in \('pronto', 'aberto', 'publicado', 'saltado'\)\)/)
})

// ── 2. Tecto diário ───────────────────────────────────────────────────────────────────────────

caso('o tecto é 20', () => assert.equal(TECTO_DIARIO, 20))

caso('quantosPodeEscrever nunca deixa passar o tecto', () => {
  for (let feitos = 0; feitos <= 30; feitos++) {
    for (let por = 0; por <= 30; por++) {
      const n = quantosPodeEscrever(feitos, por)
      assert.ok(n >= 0)
      assert.ok(feitos + n <= Math.max(TECTO_DIARIO, feitos), `feitos=${feitos} por=${por} → ${n}`)
      if (feitos >= TECTO_DIARIO) assert.equal(n, 0)
    }
  }
  assert.equal(quantosPodeEscrever(-5, 3), 3)
  assert.equal(quantosPodeEscrever(19, 5), 1)
})

caso('um dia inteiro de passagens (16 × 30 min, mais cliques em «Preparar mais») pára nos 20', () => {
  let feitos = 0
  const passagens = 16 + 10
  for (let i = 0; i < passagens; i++) feitos += quantosPodeEscrever(feitos, POR_PASSAGEM)
  assert.equal(feitos, TECTO_DIARIO)
})

caso('o trigger da 189 tem o mesmo tecto, com fechadura e dia de Lisboa', () => {
  const sql = readFileSync(join(RAIZ, 'supabase/migrations/189_fila_comentarios.sql'), 'utf8')
  assert.match(sql, new RegExp(`if n >= ${TECTO_DIARIO} then`))
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /before insert on public\.ig_fila_comentarios/)
  assert.match(sql, /Europe\/Lisbon/)
})

caso('o servidor consulta o tecto antes de escrever e pára se o trigger recusar', () => {
  const src = readFileSync(join(RAIZ, 'lib/instagram/fila-comentarios-servidor.ts'), 'utf8')
  assert.match(src, /quantosPodeEscrever\(jaHoje/)
  assert.match(src, /if \(\/tecto\/i\.test\(error\.message\)\) break/)
})

// ── 3. Sem links ──────────────────────────────────────────────────────────────────────────────

caso('avaliarComentario recusa todas as formas de link', () => {
  const comLink = [
    'Vê isto https://exemplo.com',
    'passa em http://a.pt',
    'www.morethanmoney.pt tem isso',
    'está em morethanmoney.pt',
    'entra em t.me/grupo',
    'bit.ly/abc tem tudo',
    'fala em wa.me/351900000000',
    'linktr.ee/ricardo',
    'site.io/x é bom',
  ]
  for (const t of comLink) {
    const a = avaliarComentario(t)
    assert.ok(a.problemas.includes('tem link'), `passou com link: ${t}`)
  }
})

caso('o padrão do código e o check da tabela são o mesmo', () => {
  const sql = readFileSync(join(RAIZ, 'supabase/migrations/189_fila_comentarios.sql'), 'utf8')
  const m = sql.match(/comentario !~\* '([^']+)'/)
  assert.ok(m, 'check de links não encontrado na 189')
  const doSql = m![1]
  const doCodigo = PADRAO_LINK.source.replace(/\\\//g, '/')
  assert.equal(doSql, doCodigo)
})

caso('avaliarComentario recusa pitch, clichés, travessões, hashtags e números', () => {
  const maus: Array<[string, string]> = [
    ['Passa pela MoreThanMoney que explicamos isso.', 'pitch'],
    ['Manda DM que eu explico melhor.', 'pitch'],
    ['Ótimo post, faz todo o sentido.', 'cliché'],
    ['A gestão de risco é crucial nesta fase.', 'cliché'],
    ['Isso acontece a todos — o importante é parar.', 'travessão'],
    ['Faz sentido, começa pela conta demo #trading', 'hashtag'],
    ['Eu fiz +300 pips assim, vale a pena.', 'números'],
  ]
  for (const [t, tipo] of maus) assert.ok(!avaliarComentario(t).ok, `passou (${tipo}): ${t}`)
})

caso('um comentário humano e ajustado ao post passa', () => {
  const bons = [
    'Rebentar a primeira conta dói, mas ao menos agora sabes onde estava o stop. Que par estavas a negociar?',
    'Também me custou largar o gráfico de 1 minuto. Quando passei para o de 4 horas deixei de entrar por ansiedade.',
  ]
  for (const t of bons) {
    const a = avaliarComentario(t)
    assert.ok(a.ok, `recusado: ${t} → ${a.problemas.join('; ')}`)
  }
})

caso('arrumarComentario tira aspas, prefixos e travessões', () => {
  assert.equal(arrumarComentario('Comentário: "Isso acontece — e passa."'), 'Isso acontece, e passa.')
})

caso('o botão «Escrever comentário» e a fila usam a mesma função', () => {
  const rota = readFileSync(join(RAIZ, 'app/api/admin/social/radar/route.ts'), 'utf8')
  assert.match(rota, /escreverComentarioRadar\(/)
  assert.ok(!/sistema\s*:/.test(rota), 'a rota do radar voltou a ter um prompt próprio')
})

// ── 4. «Publiquei» regista o agente ───────────────────────────────────────────────────────────

caso('«Publiquei» grava AG-PROSPECTOR, a hora e o post', () => {
  assert.equal(AGENTE_DA_FILA, 'AG-PROSPECTOR')
  const agora = new Date('2026-10-06T14:03:00Z')
  const r = registoDePublicado({ estado: 'aberto', media_id: '1789', permalink: 'https://www.instagram.com/p/abc/' }, agora)
  assert.equal(r.estado, 'publicado')
  assert.equal(r.escrito_por, 'AG-PROSPECTOR')
  assert.equal(r.publicado_em, agora.toISOString())
  assert.equal(r.media_id, '1789')
  assert.equal(r.permalink, 'https://www.instagram.com/p/abc/')
})

caso('«Publiquei» não fecha duas vezes nem ressuscita um saltado', () => {
  assert.throws(() => registoDePublicado({ estado: 'publicado', media_id: 'x' }))
  assert.throws(() => registoDePublicado({ estado: 'saltado', media_id: 'x' }))
})

caso('o servidor grava o registo de registoDePublicado e a tabela exige o rasto', () => {
  const src = readFileSync(join(RAIZ, 'lib/instagram/fila-comentarios-servidor.ts'), 'utf8')
  assert.match(src, /const registo = registoDePublicado\(/)
  assert.match(src, /\.update\(registo\)/)
  const sql = readFileSync(join(RAIZ, 'supabase/migrations/189_fila_comentarios.sql'), 'utf8')
  assert.match(sql, /estado <> 'publicado' or \(publicado_em is not null and escrito_por is not null\)/)
})

caso('a taxa de resposta diz que não se mede quando não há ligação', () => {
  assert.equal(taxaDeResposta(10, 0, false), null)
  assert.equal(taxaDeResposta(0, 0, true), null)
  assert.equal(taxaDeResposta(8, 2, true), 25)
})

console.log(`\n${passou} guardas passaram.`)
