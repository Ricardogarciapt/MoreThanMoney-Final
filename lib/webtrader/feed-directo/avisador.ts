/**
 * Ouvintes + coalescência: os ticks chegam vários por segundo e o React não precisa de ir atrás
 * de cada um. `avisar()` junta tudo o que chegou e acorda os ouvintes no máximo uma vez por
 * `intervaloMs` (~1/s no feed directo); `avisarJa()` é para o que não pode esperar (posição nova).
 */
export function criarAvisador(intervaloMs = 1000) {
  const ouvintes = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let ultimo = 0
  const correr = () => { timer = null; ultimo = Date.now(); ouvintes.forEach((o) => { try { o() } catch { /* um ouvinte partido não derruba o feed */ } }) }
  return {
    aoMudar(cb: () => void) { ouvintes.add(cb); return () => { ouvintes.delete(cb) } },
    avisar() {
      if (timer) return
      const espera = Math.max(0, intervaloMs - (Date.now() - ultimo))
      timer = setTimeout(correr, espera)
    },
    avisarJa() { if (timer) { clearTimeout(timer); timer = null } correr() },
    fechar() { if (timer) clearTimeout(timer); timer = null; ouvintes.clear() },
  }
}

/** Semáforo simples: no máximo `n` promessas em curso (a MetaApi aceita 5 pedidos históricos por conta). */
export function criarSemaforo(n: number) {
  let emCurso = 0
  const fila: Array<() => void> = []
  return async function correr<T>(fn: () => Promise<T>): Promise<T> {
    if (emCurso >= n) await new Promise<void>((r) => fila.push(r))
    emCurso++
    try { return await fn() } finally { emCurso--; fila.shift()?.() }
  }
}

/** Fila com espaçamento mínimo entre saídas (a TradeLocker aceita 3 históricos/s, 10 cotações/s). */
export function criarFilaRitmada(intervaloMs: number) {
  let proximo = 0
  let cadeia: Promise<unknown> = Promise.resolve()
  return function correr<T>(fn: () => Promise<T>): Promise<T> {
    const p = cadeia.then(async () => {
      const espera = proximo - Date.now()
      if (espera > 0) await new Promise((r) => setTimeout(r, espera))
      proximo = Date.now() + intervaloMs
      return fn()
    })
    cadeia = p.catch(() => {})
    return p
  }
}
