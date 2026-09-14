/** Cache das leituras da MetaApi (prazo, releitura quando falha, pedidos em curso). Correr: npx tsx lib/mtmcopy/__tests__/metaapi-cache.check.ts */
import { criarCacheTtl, simbolosDaContaCache, specDoSimboloCache, invalidarLeiturasDeSimbolos, __limparCachesMetaApi } from "../metaapi-cache"

let ok = 0, mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++
  else { mau++; console.error(`✗ ${nome}\n   obtido: ${JSON.stringify(a)}\n   esperado: ${JSON.stringify(b)}`) }
}

async function main() {
  // ── prazo: dentro do prazo não relê; passado o prazo relê ──
  let relogio = 1_000
  const c = criarCacheTtl<string>(100, () => relogio)
  let leituras = 0
  const ler = async () => { leituras++; return `v${leituras}` }
  eq("1ª leitura vai à fonte", await c.obter("a", ler), "v1")
  relogio += 99
  eq("dentro do prazo usa o guardado", await c.obter("a", ler), "v1")
  eq("só leu uma vez", leituras, 1)
  relogio += 2
  eq("passado o prazo relê", await c.obter("a", ler), "v2")

  // ── falhas e vazios não ficam guardados ──
  let n = 0
  const c2 = criarCacheTtl<string>(1_000, () => relogio)
  eq("null não se guarda", await c2.obter("x", async () => { n++; return null }), null)
  eq("…e a seguir relê", await c2.obter("x", async () => { n++; return "ok" }), "ok")
  eq("duas leituras", n, 2)
  let lancou = false
  try { await c2.obter("y", async () => { throw new Error("timeout") }) } catch { lancou = true }
  eq("erro é relançado", lancou, true)
  eq("erro não fica guardado", c2.tamanho(), 1)

  // ── pedidos em simultâneo: uma só leitura ──
  let emSimultaneo = 0
  const c3 = criarCacheTtl<number>(1_000, () => relogio)
  const lenta = () => new Promise<number>((r) => { emSimultaneo++; setTimeout(() => r(42), 20) })
  const res = await Promise.all([c3.obter("k", lenta), c3.obter("k", lenta), c3.obter("k", lenta)])
  eq("todos recebem o valor", res, [42, 42, 42])
  eq("uma só leitura em curso", emSimultaneo, 1)

  // ── não serve → relê UMA vez; o fresco volta mesmo que também não sirva ──
  let lidas = 0
  const c4 = criarCacheTtl<string[]>(1_000, () => relogio)
  await c4.obter("conta", async () => { lidas++; return ["EURUSD"] })
  const temXau = (s: string[]) => s.includes("XAUUSD")
  eq("símbolo novo força releitura", await c4.obter("conta", async () => { lidas++; return ["EURUSD", "XAUUSD"] }, temXau), ["EURUSD", "XAUUSD"])
  eq("releu uma vez", lidas, 2)
  eq("guardado serve → não relê", await c4.obter("conta", async () => { lidas++; return [] }, temXau), ["EURUSD", "XAUUSD"])
  eq("continua em 2", lidas, 2)
  const temNas = (s: string[]) => s.includes("NAS100")
  await c4.obter("conta", async () => { lidas++; return ["EURUSD"] }, temNas)
  eq("fresco que não serve não entra em ciclo", lidas, 3)

  // ── helpers de símbolos/specs por conta ──
  __limparCachesMetaApi()
  let simb = 0
  const lerSimb = async () => { simb++; return ["EURUSD", "XAUUSD.s"] }
  await simbolosDaContaCache("A", lerSimb)
  await simbolosDaContaCache("A", lerSimb)
  await simbolosDaContaCache("B", lerSimb)
  eq("cache por conta", simb, 2)
  let vazios = 0
  eq("lista vazia devolve []", await simbolosDaContaCache("C", async () => { vazios++; return [] }), [])
  await simbolosDaContaCache("C", async () => { vazios++; return [] })
  eq("lista vazia não se guarda", vazios, 2)

  let specs = 0
  const lerSpec = async () => { specs++; return { point: 0.01, digits: 2 } }
  await specDoSimboloCache("A", "XAUUSD.s", lerSpec)
  await specDoSimboloCache("A", "XAUUSD.s", lerSpec)
  await specDoSimboloCache("A", "EURUSD", lerSpec)
  eq("spec por conta+símbolo", specs, 2)
  eq("spec sem point não se guarda", await specDoSimboloCache("A", "X", async () => ({ digits: 2 })), null)

  invalidarLeiturasDeSimbolos("A")
  await simbolosDaContaCache("A", lerSimb)
  await specDoSimboloCache("A", "XAUUSD.s", lerSpec)
  eq("invalidar a conta relê símbolos", simb, 3)
  eq("invalidar a conta relê specs", specs, 3)
  await simbolosDaContaCache("B", lerSimb)
  eq("invalidar A não mexe em B", simb, 3)

  console.log(`metaapi-cache: ${ok} ok, ${mau} falhas`)
  if (mau) process.exit(1)
}

main()
