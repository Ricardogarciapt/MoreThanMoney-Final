/**
 * A GUARDA DA FECHADURA.   npx tsx lib/supabase-fechadura.check.ts
 * Prova o caso MAU de 05/10/2026: com a fechadura presa por outro separador, o pedido de auth
 * ficava pendurado para sempre. Com o tecto, corre na mesma.
 */
import { fechaduraComTecto, ehErroDeFechadura, TECTO_MS } from "./supabase-fechadura"

let falhas = 0
const certo = (c: boolean, o: string) => { if (!c) { falhas++; console.error("  ✗ " + o) } }

// Um navigator.locks FALSO em que a fechadura nunca se liberta: o pedido só termina pelo sinal de abort.
// (No Node o `navigator` só tem getter: redefine-se a propriedade em vez de a atribuir.)
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    locks: {
      request: (_name: string, opts: { signal?: AbortSignal }, _fn: unknown) =>
        new Promise((_, rej) => opts.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))),
    },
  },
})

async function main() {
  certo(ehErroDeFechadura(Object.assign(new Error("x"), { name: "NavigatorLockAcquireTimeoutError" })), "timeout da fechadura é erro de fechadura")
  certo(ehErroDeFechadura(Object.assign(new Error("aborted"), { name: "AbortError" })), "abort também")
  certo(!ehErroDeFechadura(new Error("network down")), "um erro de rede NÃO é")

  // Caso MAU: supabase-js pede sem tecto (-1) com a fechadura presa.
  const t0 = Date.now()
  let correu = false
  const r = await Promise.race([
    fechaduraComTecto("lock:sb-teste", -1, async () => { correu = true; return "ok" }),
    new Promise<string>((res) => setTimeout(() => res("PENDURADO"), TECTO_MS + 3_000)),
  ])
  certo(r === "ok" && correu, `com a fechadura presa o pedido corre na mesma (veio «${r}»)`)
  const dt = Date.now() - t0
  certo(dt >= TECTO_MS - 50 && dt < TECTO_MS + 2_000, `espera ~${TECTO_MS} ms antes de seguir (esperou ${dt} ms)`)

  // Um tecto explícito e curto é respeitado.
  const t1 = Date.now()
  await fechaduraComTecto("lock:sb-teste", 300, async () => 1)
  certo(Date.now() - t1 < 1_500, "tecto explícito curto respeitado")

  // Um erro do próprio fn passa tal e qual (não se engole).
  let passou = false
  try { await fechaduraComTecto("lock:sb-teste", 100, async () => { throw new Error("network down") }) } catch (e) { passou = /network/.test(String((e as Error).message)) }
  certo(passou, "erros do pedido passam intactos")

  if (falhas) { console.error(`fechadura: ${falhas} falha(s)`); process.exit(1) }
  console.log("fechadura: uma fechadura presa noutro separador já não pendura o login nem o feed ✓")
}
void main()
