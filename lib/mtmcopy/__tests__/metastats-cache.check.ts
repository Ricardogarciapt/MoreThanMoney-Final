/** Prazo da cache de 24 h do MetaStats das contas provider. Correr: npx tsx lib/mtmcopy/__tests__/metastats-cache.check.ts */
import { metaStatsGuardadoValido, TTL_METASTATS_MS } from "../provider-metrics"

let ok = 0, mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (a === b) ok++
  else { mau++; console.error(`✗ ${nome}\n   obtido: ${String(a)}\n   esperado: ${String(b)}`) }
}

const agora = Date.parse("2026-09-15T12:00:00Z")
const ha = (ms: number) => ({ lidoEm: new Date(agora - ms).toISOString() })

eq("sem entrada não serve", metaStatsGuardadoValido(null, agora), false)
eq("sem data não serve", metaStatsGuardadoValido({}, agora), false)
eq("data inválida não serve", metaStatsGuardadoValido({ lidoEm: "ontem" }, agora), false)
eq("lido há 1 h serve", metaStatsGuardadoValido(ha(3_600_000), agora), true)
eq("lido há 23h59 serve", metaStatsGuardadoValido(ha(TTL_METASTATS_MS - 60_000), agora), true)
eq("lido há 24 h já não serve", metaStatsGuardadoValido(ha(TTL_METASTATS_MS), agora), false)
eq("data no futuro não serve", metaStatsGuardadoValido(ha(-60_000), agora), false)

console.log(`metastats-cache: ${ok} ok, ${mau} falhas`)
if (mau) process.exit(1)
