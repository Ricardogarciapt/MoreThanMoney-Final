/**
 * AS FONTES QUE SAÍRAM NÃO VOLTAM A ENTRAR POR UMA PORTA LATERAL.
 *
 * Decisão do dono (2026-10-04): o gmi-relay (Signal Master Elite → MTM Premium) é o relay activo do
 * Premium. Saíram, como FONTES de sinais:
 *  · Gold Did e Golden Astro/Golden Moves (ids -1003812659078, -1003452689502, -1004428793414) — a 15/09;
 *  · JAMES TRADING GROUP (-1001374090428) via fs-relay — parado e desligado a 04/10;
 *  · PrimeVerse «PѴ TRADE INSIGHTS» (-1003615007236, trader `kingfkg`) via pv-relay — parado e desligado a 04/10.
 *
 * Esta guarda lê o CÓDIGO EXECUTÁVEL (comentários e docstrings excluídos) de lib/mtmcopy, lib/mestres e
 * app/api/telegram e falha se um desses ids/nomes voltar a aparecer. E prende o contrário: a rota do
 * Premium (-1002424441843) e a fonte SME (-1003671953091) têm de continuar referidas onde o sistema as lê.
 *
 * O que NÃO se proíbe, de propósito: «Gold Did»/«Forex Swings» em comentários (a casa guarda o porquê dos
 * incidentes); a palavra «gold» (é o OURO, o que o SME publica); o grupo da casa «MTM Auto FOREX swings»
 * (-1004362819270) em lib/telegram-channel-ids.ts e no gate da corretora — é um grupo NOSSO, não a fonte.
 * Em lib/mtmcopy esse id também não pode aparecer: lá só entrava como «grupo copiável», e isso saiu.
 *
 * Correr: npx tsx lib/mtmcopy/__tests__/fontes-em-desuso.check.ts
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = join(__dirname, '..', '..', '..')
const PASTAS = ['lib/mtmcopy', 'lib/mestres', 'app/api/telegram']

/** Ids de chat e nomes das fontes que saíram. Qualquer um destes em código executável é regressão. */
const PROIBIDOS: { padrao: RegExp; porque: string }[] = [
  { padrao: /-?1003812659078/, porque: 'id antigo do Gold Did (fonte saiu a 15/09)' },
  { padrao: /-?1003452689502/, porque: 'id antigo do Gold Did (fonte saiu a 15/09)' },
  { padrao: /-?1004428793414/, porque: 'id do Golden Astro (fonte saiu a 15/09)' },
  { padrao: /-?1001374090428/, porque: 'id do JAMES TRADING GROUP (fs-relay desligado a 04/10)' },
  { padrao: /-?1003615007236/, porque: 'id do PV TRADE INSIGHTS (pv-relay desligado a 04/10)' },
  { padrao: /kingfkg/i, porque: 'trader da fonte PrimeVerse (saiu a 29/09; a fonte toda a 04/10)' },
  { padrao: /james\s+trading/i, porque: 'nome do canal James (fs-relay desligado a 04/10)' },
]

/** Só em lib/mtmcopy: o grupo da casa não é fonte copiável. */
const PROIBIDOS_SO_MTMCOPY: { padrao: RegExp; porque: string }[] = [
  { padrao: /-?1004362819270/, porque: 'grupo «MTM Auto FOREX swings» voltou a ser oferecido como fonte copiável — a fonte saiu a 04/10' },
]

/** O que TEM de continuar referido, e onde. */
const OBRIGATORIOS: { ficheiro: string; padrao: RegExp; porque: string }[] = [
  { ficheiro: 'lib/mtmcopy/copy-methods.ts', padrao: /-1002424441843/, porque: 'o grupo Premium é a fonte copiável do Premium' },
  { ficheiro: 'lib/telegram-channel-ids.ts', padrao: /-1002424441843/, porque: 'o grupo Premium é um canal oficial da casa' },
  { ficheiro: 'lib/mtmcopy/intake-channels.ts', padrao: /Signal Master Elite/i, porque: 'o interruptor do Premium tem de dizer de onde vem o sinal' },
  // A fonte SME é lida no VPS (gmi-relay, RELAY_ROUTES); o site não a consome directamente. O sítio onde o
  // site a NOMEIA é o catálogo de recepção — é o que o admin lê quando pergunta «de onde vem o Premium?».
  { ficheiro: 'lib/mtmcopy/intake-channels.ts', padrao: /-1003671953091/, porque: 'a fonte Signal Master Elite tem de estar nomeada no catálogo de recepção do Premium' },
  { ficheiro: 'lib/mtmcopy/intake-channels.ts', padrao: /-1002424441843/, porque: 'o destino do relay (grupo Premium) tem de estar nomeado ao lado da fonte' },
]

function ficheiros(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) {
      if (nome === '__tests__' || nome === 'node_modules') continue
      ficheiros(p, out)
    } else if (/\.(ts|tsx)$/.test(nome)) {
      out.push(p)
    }
  }
  return out
}

/** Tira comentários de bloco e de linha (não é um parser, mas chega para texto que não está em strings). */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1')
}

let falhas = 0
const regista = (msg: string) => { falhas++; console.error('  FALHA  ' + msg) }

for (const pasta of PASTAS) {
  for (const f of ficheiros(join(RAIZ, pasta))) {
    const rel = relative(RAIZ, f)
    const codigo = semComentarios(readFileSync(f, 'utf-8'))
    const lista = pasta === 'lib/mtmcopy' ? [...PROIBIDOS, ...PROIBIDOS_SO_MTMCOPY] : PROIBIDOS
    for (const { padrao, porque } of lista) {
      const m = padrao.exec(codigo)
      if (m) {
        const linha = codigo.slice(0, m.index).split('\n').length
        regista(`${rel}:${linha} — «${m[0]}» em código executável: ${porque}`)
      }
    }
  }
}

for (const { ficheiro, padrao, porque } of OBRIGATORIOS) {
  const src = readFileSync(join(RAIZ, ficheiro), 'utf-8')
  if (!padrao.test(src)) regista(`${ficheiro} deixou de referir ${padrao} — ${porque}`)
}

// As rotas das fontes que saíram ficam a devolver 410 (não desaparecem em silêncio nem voltam a executar).
for (const rota of ['app/api/telegram/primeverse-exec/route.ts', 'app/api/telegram/forex-swings-exec/route.ts']) {
  const src = semComentarios(readFileSync(join(RAIZ, rota), 'utf-8'))
  if (!/status:\s*410/.test(src)) regista(`${rota} já não devolve 410 — ou voltou a executar, ou desapareceu sem explicar`)
  if (/placeOrder|computeRiskLot|encaminharPrimeverse/.test(src)) regista(`${rota} voltou a ter caminho de execução`)
}

assert.equal(falhas, 0, `${falhas} regressão(ões) às fontes em desuso — ver acima`)
console.log('fontes-em-desuso: OK (ids/nomes das fontes que saíram ausentes do código executável; Premium e SME referidos onde devem)')
