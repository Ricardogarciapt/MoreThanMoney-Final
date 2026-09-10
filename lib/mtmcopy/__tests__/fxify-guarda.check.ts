/**
 * FXIFY: 8% de perda diária e 8% de drawdown máximo — e o dia que vira às 17:00 EST.
 *
 * A guarda contava o dia em UTC. A FXIFY conta das 17:00 EST às 17:00 EST: com o contador a
 * reiniciar à meia-noite UTC dava para perder 8% antes da meia-noite e outros 8% depois —
 * dois dias para nós, um só para eles, e a conta rebentava com a guarda a dizer que estava
 * tudo bem. Estas verificações existem para isso não voltar.
 */
import { propFirmRules, diaDeNegociacao, FXIFY_RULES, EQUITY_EDGE_RULES } from '../prop-firm-guard'
import { getPropFirmPreset } from '../prop-firm-presets'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

// ── as regras existem ──────────────────────────────────────────────────────
eq('fxify é reconhecida', propFirmRules('fxify') !== null, true)
eq('perda diária 8%', FXIFY_RULES.dailyDrawdownPct, 0.08)
eq('drawdown máximo 8%', FXIFY_RULES.maxDrawdownPct, 0.08)
eq('sem regra de consistência inventada', FXIFY_RULES.consistencyMaxDayShare, 1)
eq('preset existe', getPropFirmPreset('fxify')?.label, 'FXIFY')
eq('preset arrisca 0,25%', getPropFirmPreset('fxify')?.lotValue, 0.25)
eq('tecto 0,25%', getPropFirmPreset('fxify')?.maxRiskPercent, 0.25)

// ── o dia vira às 17:00 EST, não à meia-noite UTC ──────────────────────────
// Verão (EDT = UTC-4): 17:00 EST = 21:00 UTC.
eq('20:59 UTC de verão ainda é dia 10', diaDeNegociacao(FXIFY_RULES, new Date('2026-09-10T20:59:00Z')), '2026-09-10')
eq('21:00 UTC de verão já é dia 11', diaDeNegociacao(FXIFY_RULES, new Date('2026-09-10T21:00:00Z')), '2026-09-11')
eq('23:00 UTC continua dia 11', diaDeNegociacao(FXIFY_RULES, new Date('2026-09-10T23:00:00Z')), '2026-09-11')
// A meia-noite UTC NÃO pode virar o dia: é o bug que isto tranca.
eq('00:30 UTC ainda é o mesmo dia FXIFY', diaDeNegociacao(FXIFY_RULES, new Date('2026-09-11T00:30:00Z')), '2026-09-11')
eq('meio-dia UTC é o mesmo dia', diaDeNegociacao(FXIFY_RULES, new Date('2026-09-11T12:00:00Z')), '2026-09-11')

// Inverno (EST = UTC-5): 17:00 EST = 22:00 UTC.
eq('21:59 UTC de inverno ainda é dia 15', diaDeNegociacao(FXIFY_RULES, new Date('2026-01-15T21:59:00Z')), '2026-01-15')
eq('22:00 UTC de inverno já é dia 16', diaDeNegociacao(FXIFY_RULES, new Date('2026-01-15T22:00:00Z')), '2026-01-16')

// Vira o mês e o ano sem partir.
eq('fim do mês', diaDeNegociacao(FXIFY_RULES, new Date('2026-09-30T21:00:00Z')), '2026-10-01')
eq('fim do ano', diaDeNegociacao(FXIFY_RULES, new Date('2026-12-31T22:00:00Z')), '2027-01-01')

// ── quem não tem fronteira própria continua em dia UTC ─────────────────────
eq('equity edge fica em UTC', diaDeNegociacao(EQUITY_EDGE_RULES, new Date('2026-09-10T23:00:00Z')), '2026-09-10')
eq('sem regras nenhumas', diaDeNegociacao(null, new Date('2026-09-10T23:00:00Z')), '2026-09-10')

// ── as outras prop firms não foram alteradas ───────────────────────────────
eq('equity edge continua 6%', EQUITY_EDGE_RULES.maxDrawdownPct, 0.06)
eq('ftmo continua 5% diário', propFirmRules('ftmo')?.dailyDrawdownPct, 0.05)
eq('tipo desconhecido não inventa regras', propFirmRules('seja-o-que-for'), null)

console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
process.exit(mau === 0 ? 0 : 1)
