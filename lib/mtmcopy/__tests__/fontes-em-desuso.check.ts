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
 * incidentes); a palavra «gold» (é o OURO, o que o SME publica).
 *
 * 04/10/2026 — o dono FECHOU o grupo da casa «MTM Auto FOREX swings» (-1004362819270) e o canal da app
 * `ideias-e-sinais` («fecham e retira o grupo»; «retira a fonte MTM Auto Forex completamente, mesmo de
 * MTM Auto»). O canal fica na BD com hidden=true (432 mensagens de histórico). A secção CATÁLOGOS VIVOS
 * abaixo prende que o id, o slug e a chave `forex_swings` não voltam a nenhuma lista que ofereça, liste
 * ou deixe escolher — leitores de histórico (rótulos, desfechos, posições antigas) ficam de fora.
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

/**
 * CATÁLOGOS VIVOS (04/10/2026): ficheiros que OFERECEM/LISTAM/DEIXAM ESCOLHER canais, grupos e fontes.
 * Nenhum pode conter, em código executável, o canal fechado, o grupo fechado ou a chave da fonte.
 * Leitores de histórico (rotulos-canais, signal-outcomes, t2t-price-monitor SEM_GESTAO, regras.ts,
 * copy-methods rótulos/tipo, t2t-source chave `james`) NÃO estão nesta lista de propósito.
 */
// 07/10/2026 — o dono REABRIU o Forex Swings só como FONTE DE PUBLICAÇÃO (chat da app + notificações).
// Saíram desta lista os catálogos de PUBLICAÇÃO (canais por omissão, ids Telegram, intake, permissões,
// notificações, push, metadados do chat). Ficam os de EXECUÇÃO e de oferta (cópia, T2T, gate da
// corretora, Centro, estratégias) — e a secção «FOREX SWINGS SEM EXECUÇÃO» no fim prova o resto.
const CATALOGOS_VIVOS = [
  'lib/telegram-broker-gate.ts',
  'app/api/cron/broker-gate-renew/route.ts',
  'lib/mtmcopy/tap-to-trade-channels.ts',
  'lib/admin-centro/servidor/sinais.ts',
  'app/api/admin/mtmcopy/t2t-controls/route.ts',
  // os canais T2T extra mudaram-se para a regra da camada única de escrita (05/10)
  'lib/admin-centro/estrategia-escrita-plano.ts',
  'lib/copia-contas/estrategias.ts',
  'lib/admin-centro/servidor/estrategias.ts',
]
const PASTAS_MTMAUTO = ['lib/mtmauto', 'lib/mestres', 'app/api/mtm-auto', 'app/mtmauto']
const FECHADOS_04_10: { padrao: RegExp; porque: string }[] = [
  { padrao: /ideias-e-sinais/, porque: 'canal `ideias-e-sinais` fechou a 04/10/2026 (hidden=true) — não volta a catálogo vivo' },
  { padrao: /-?1004362819270/, porque: 'grupo «MTM Auto FOREX swings» fechou a 04/10/2026 — não se lista, não se convida, não se roteia' },
  { padrao: /forex_swings|forexswings|mtm-auto-forex-swings/i, porque: 'a fonte Forex Swings saiu a 04/10/2026 — não se oferece nem se selecciona' },
]
// Casos sem regra textual: as listas EXPORTADAS que a app e o admin lêem.
import { MTMCOPY_TELEGRAM_GROUP_IDS } from '../copy-methods'
import { T2T_SOURCES } from '../t2t-source'
import { INTAKE_CHANNELS, intakeKeyDoEspelhoTelegram } from '../intake-channels'
import { T2T_SIGNAL_CHANNELS, CANAIS_ACOMPANHADOS } from '../tap-to-trade-channels'
import { DEFAULT_CHAT_CHANNELS } from '../../default-chat-channels'

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

for (const ficheiro of CATALOGOS_VIVOS) {
  const codigo = semComentarios(readFileSync(join(RAIZ, ficheiro), 'utf-8'))
  for (const { padrao, porque } of FECHADOS_04_10) {
    const m = padrao.exec(codigo)
    if (m) regista(`${ficheiro}:${codigo.slice(0, m.index).split('\n').length} — «${m[0]}» em catálogo vivo: ${porque}`)
  }
}
for (const pasta of PASTAS_MTMAUTO) {
  for (const f of ficheiros(join(RAIZ, pasta))) {
    const codigo = semComentarios(readFileSync(f, 'utf-8'))
    for (const { padrao, porque } of FECHADOS_04_10) {
      const m = padrao.exec(codigo)
      if (m) regista(`${relative(RAIZ, f)}:${codigo.slice(0, m.index).split('\n').length} — «${m[0]}» na MTM Auto: ${porque}`)
    }
  }
}
if ((MTMCOPY_TELEGRAM_GROUP_IDS as readonly string[]).includes('forex_swings')) regista('copy-methods: `forex_swings` voltou aos grupos copiáveis oferecidos')
if (T2T_SOURCES.some((s) => (s.key as string) === 'james')) regista('t2t-source: `james` voltou ao catálogo de fontes T2T')
// 07/10: o interruptor de publicação do Forex Swings VOLTOU (reaberto pelo dono) — tem de existir e de
// gatear o espelho do canal; é o que permite calá-lo sem tocar no VPS.
if (!INTAKE_CHANNELS.some((c) => (c.key as string) === 'forex_swings')) regista('intake-channels: falta o interruptor `forex_swings` (publicação do Forex Swings)')
if (intakeKeyDoEspelhoTelegram('ideias-e-sinais') !== 'forex_swings') regista('intake-channels: `ideias-e-sinais` tem de mapear para `forex_swings`')
if (T2T_SIGNAL_CHANNELS.includes('ideias-e-sinais') || CANAIS_ACOMPANHADOS.includes('ideias-e-sinais')) regista('tap-to-trade-channels: `ideias-e-sinais` voltou aos canais negociáveis/acompanhados')
if (!DEFAULT_CHAT_CHANNELS.some((c) => c.slug === 'ideias-e-sinais')) regista('default-chat-channels: falta o canal `ideias-e-sinais` (Forex Swings reaberto a 07/10)')

// ── 07/10: FOREX SWINGS = SÓ PUBLICAÇÃO. Nem estratégia, nem mestre, nem rota, nem execução. ──────
{
  const { FONTES_SO_PUBLICACAO, FONTE_DA_MESTRE, ESTRATEGIA_DA_CHAVE, fonteSoPublicacaoDoCanal } = require('../../sinais/identidade') as typeof import('../../sinais/identidade')
  const { ESTRATEGIA_DO_WEBHOOK } = require('../../mestres/servidor/sinal-mestre') as typeof import('../../mestres/servidor/sinal-mestre')
  const { resolveAppChannelSlug } = require('../../telegram-app-channels') as typeof import('../../telegram-app-channels')
  if (fonteSoPublicacaoDoCanal('ideias-e-sinais') !== 'forex-swings') regista('identidade: o canal ideias-e-sinais tem de ser da fonte só-publicação forex-swings')
  if (resolveAppChannelSlug({ id: -1004362819270 }) !== 'ideias-e-sinais') regista('o grupo «MTM Auto FOREX swings» tem de espelhar para ideias-e-sinais (e não para «Ideias de Forex»)')
  const mestres = [...Object.values(FONTE_DA_MESTRE), ...Object.keys(FONTE_DA_MESTRE), ...Object.values(ESTRATEGIA_DA_CHAVE), ...Object.keys(ESTRATEGIA_DO_WEBHOOK), ...Object.values(ESTRATEGIA_DO_WEBHOOK).map((a) => a.slug)]
  for (const f of Object.keys(FONTES_SO_PUBLICACAO)) {
    if (mestres.some((m) => /forex.?swing|james/i.test(String(m)) || String(m) === f)) regista(`fonte só-publicação «${f}» apareceu nas fontes/estratégias com mestre`)
  }
  if ((MTMCOPY_TELEGRAM_GROUP_IDS as readonly string[]).some((g) => /forex.?swing/i.test(g))) regista('o Forex Swings voltou aos grupos copiáveis')
  // O espelho do relay-post para estas fontes NÃO chama o processador nem executor nenhum.
  const relay = semComentarios(readFileSync(join(RAIZ, 'app/api/telegram/relay-post/route.ts'), 'utf-8'))
  const bloco = relay.slice(relay.indexOf('fonteSoPublicacaoDoCanal(slug)'), relay.lastIndexOf('return NextResponse.json'))
  if (!bloco || /processMtmcopy|executeSignal|encaminhar|placeOrder|abrirSinal/.test(bloco)) regista('relay-post: o espelho das fontes só-publicação ganhou um caminho de execução')
  console.log('fontes-em-desuso (07/10): Forex Swings publica em ideias-e-sinais, sem mestre/rota/execução; forex-swings-exec 410')
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
console.log('fontes-em-desuso: OK (ids/nomes das fontes que saíram ausentes do código executável; canal/grupo/fonte Forex Swings fora dos catálogos vivos; Premium e SME referidos onde devem)')

// ── 05/10: o mapa canal→estratégia derivado (lib/mestres/canal-t2t.ts) não conhece fontes mortas,
//    e o parser PrimeVerse está marcado como histórico (não volta a ser fonte) ──────────────────
{
  const { CANAL_POR_FONTE_MTM, CANAIS_FIXOS_HISTORICOS } = require('../../mestres/canal-t2t') as typeof import('../../mestres/canal-t2t')
  const { PARSER_PRIMEVERSE_HISTORICO } = require('../../mtmfunded/estrategias-sinais/calculo') as typeof import('../../mtmfunded/estrategias-sinais/calculo')
  for (const morta of ['james', 'primeverse', 'forexideas', 'goldenmoves', 'gold-did']) {
    assert.ok(!(morta in CANAL_POR_FONTE_MTM), `fonte morta «${morta}» voltou a CANAL_POR_FONTE_MTM`)
  }
  assert.ok(!Object.keys(CANAIS_FIXOS_HISTORICOS).includes('ideias-e-sinais'), 'canal do Forex Swings nos fixos')
  assert.ok(!Object.keys(CANAIS_FIXOS_HISTORICOS).includes('sinais-scanner-mtm'), 'canal PrimeVerse/Edge nos fixos (Edge só entra pelo provider)')
  assert.equal(PARSER_PRIMEVERSE_HISTORICO, true, 'parser PrimeVerse deixou de estar marcado como histórico')
  console.log('fontes-em-desuso (05/10): mapa canal→estratégia sem fontes mortas; parser PrimeVerse histórico')
}
