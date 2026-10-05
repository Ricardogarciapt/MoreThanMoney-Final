/**
 * GUARDA — a app-mobile NÃO tem separador «T2T» (Tap to Trade) desde 05/10/2026.
 *
 * O dono decidiu que o Tap to Trade vive só na app MTM Auto. Na app-mobile o botão «T2T» da barra
 * inferior deu lugar a «Alertas» (abre o separador `trading-alerts` já existente), o TapToTradeFeed
 * deixou de ser montado, o item saiu do menu lateral e os links/notificações antigos com
 * ?tab=tap-to-trade caem no Chat. O backend (lib/mtmcopy/*, /api/mtmcopy/*) continua vivo.
 *
 * Esta guarda FALHA se:
 *   1. app/app-mobile/page.tsx voltar a ter `data-tutorial-tab="tap-to-trade"`,
 *      `TabsContent value="tap-to-trade"` ou `import TapToTradeFeed`;
 *   2. components/mobile/mobile-sidebar.tsx voltar a ter o item `id: 'tap-to-trade'`;
 *   3. a barra inferior deixar de ter o botão `data-tutorial-tab="trading-alerts"`;
 *   4. normalizarTab('tap-to-trade') deixar de dar 'chat' (ou 'funded' deixar de dar 'scanner').
 *
 * Caso MAU provado: um ficheiro de página fabricado com o botão T2T faz o mesmo detector disparar.
 *
 *   npx tsx lib/__tests__/app-mobile-sem-t2t.check.ts
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { TABS_VALIDAS, ehTabValida, normalizarTab } from '../app-mobile/tabs'

const RAIZ = path.resolve(__dirname, '..', '..')
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')

// Tira comentários (de linha e de bloco) para só o código vivo contar — os comentários podem contar a história.
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const PROIBIDO_NA_PAGINA = [
  'data-tutorial-tab="tap-to-trade"',
  'TabsContent value="tap-to-trade"',
  'import TapToTradeFeed',
]
const PROIBIDO_NO_SIDEBAR = ["id: 'tap-to-trade'", 'id: "tap-to-trade"']

function violacoes(src: string, padroes: string[]): string[] {
  const codigo = semComentarios(src)
  return padroes.filter((p) => codigo.includes(p))
}

let falhas = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`)
  if (!cond) falhas++
}

// ── 1/2. Página e sidebar reais ─────────────────────────────────────────────────────────
const pagina = ler('app/app-mobile/page.tsx')
const sidebar = ler('components/mobile/mobile-sidebar.tsx')

const vPagina = violacoes(pagina, PROIBIDO_NA_PAGINA)
ok(vPagina.length === 0, `app/app-mobile/page.tsx sem T2T ${vPagina.length ? `(encontrado: ${vPagina.join(' | ')})` : ''}`)

const vSidebar = violacoes(sidebar, PROIBIDO_NO_SIDEBAR)
ok(vSidebar.length === 0, `components/mobile/mobile-sidebar.tsx sem item tap-to-trade ${vSidebar.length ? `(encontrado: ${vSidebar.join(' | ')})` : ''}`)

// ── 3. A barra inferior tem «Alertas» no lugar do T2T ──────────────────────────────────
const codigoPagina = semComentarios(pagina)
ok(codigoPagina.includes('data-tutorial-tab="trading-alerts"'), 'barra inferior tem o botão data-tutorial-tab="trading-alerts" (Alertas)')
ok(codigoPagina.includes('handleTabChange("trading-alerts")'), 'o botão Alertas abre o separador trading-alerts')
ok(codigoPagina.includes('TabsContent value="trading-alerts"'), 'o separador trading-alerts continua montado na página')
ok(codigoPagina.includes('from "@/lib/app-mobile/tabs"'), 'a página importa normalizarTab do módulo puro lib/app-mobile/tabs.ts')

// ── 4. Normalização dos ids antigos ─────────────────────────────────────────────────────
ok(normalizarTab('tap-to-trade') === 'chat', "normalizarTab('tap-to-trade') === 'chat'")
ok(normalizarTab('funded') === 'scanner', "normalizarTab('funded') === 'scanner'")
ok(normalizarTab('portfolio') === 'portfolio', 'ids vivos passam intactos')
ok(ehTabValida('tap-to-trade') && ehTabValida('trading-alerts'), 'tap-to-trade (legado) e trading-alerts são aceites no URL')
ok(!ehTabValida('inventado') && !ehTabValida(null), 'ids desconhecidos/null são rejeitados')
ok(TABS_VALIDAS.includes('trading-alerts'), 'trading-alerts está em TABS_VALIDAS')

// ── Caso MAU: o detector dispara numa página fabricada com o botão T2T ─────────────────
const paginaMa = `
import TapToTradeFeed from "@/components/mobile/tap-to-trade-feed"
// comentário a falar de data-tutorial-tab="tap-to-trade" não conta
<TabsContent value="tap-to-trade">{activeTab === "tap-to-trade" && <TapToTradeFeed />}</TabsContent>
<button data-tutorial-tab="tap-to-trade" />
`
const vMa = violacoes(paginaMa, PROIBIDO_NA_PAGINA)
ok(vMa.length === 3, `caso MAU: página com T2T dispara os 3 padrões (disparou ${vMa.length})`)
const sidebarMau = `{ id: 'tap-to-trade', label: 'T2T', icon: Zap, href: '/app-mobile?tab=tap-to-trade' }`
ok(violacoes(sidebarMau, PROIBIDO_NO_SIDEBAR).length === 1, 'caso MAU: sidebar com o item tap-to-trade dispara')
ok(violacoes('// id: \'tap-to-trade\' só em comentário', PROIBIDO_NO_SIDEBAR).length === 0, 'comentários a contar a história não disparam')

assert.equal(falhas, 0, `${falhas} verificação(ões) falharam`)
console.log('\nGUARDA OK — app-mobile sem separador T2T; Alertas no lugar; links antigos caem no Chat.')
