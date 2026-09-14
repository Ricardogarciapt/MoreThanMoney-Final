"use client"

/**
 * A BIBLIOTECA LICENCIADA DO TRADINGVIEW (Advanced Charts / Trading Platform) — existe ou não?
 *
 * O widget gratuito do TradingView não tem API para desenhar linhas de ordens. As linhas
 * arrastáveis de posição, SL/TP e pendentes (como no paper trading do TradingView) só existem
 * na biblioteca `charting_library`, que o TradingView cede grátis a empresas mas que não se pode
 * pôr num repositório público nem descarregar de um CDN: tem de ser pedida e copiada para
 * public/charting_library/ (ver docs/webtrader-tradingview-library.md).
 *
 * Por isso o WebTrader PERGUNTA ao arrancar: um HEAD ao ficheiro principal. Se responde, o gráfico
 * de negociação é o do TradingView; se não, é o nosso (grafico-leve.tsx). A resposta guarda-se na
 * sessão do browser para não repetir o pedido a cada troca de separador — quem copiar a biblioteca
 * vê-a na próxima sessão (ou já, com `?grafico=tv`).
 *
 * `?grafico=leve` força o nosso gráfico (útil para comparar ou se a biblioteca der problemas).
 */

export const TV_LIB_PASTA = "/charting_library/"
export const TV_LIB_SCRIPT = "/charting_library/charting_library.standalone.js"
const CHAVE = "mtm_tv_charting_library"

let emCurso: Promise<boolean> | null = null

export function bibliotecaTvDisponivel(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  const forcar = new URLSearchParams(window.location.search).get("grafico")
  if (forcar === "leve") return Promise.resolve(false)
  if (forcar !== "tv") {
    try {
      const guardado = sessionStorage.getItem(CHAVE)
      if (guardado === "1") return Promise.resolve(true)
      if (guardado === "0") return Promise.resolve(false)
    } catch { /* sem sessionStorage: pergunta sempre */ }
  }
  if (emCurso) return emCurso
  emCurso = (async () => {
    let ok = false
    try {
      const r = await fetch(TV_LIB_SCRIPT, { method: "HEAD", cache: "no-store" })
      // Um 404 do Next responde HTML; só conta um ficheiro JavaScript a sério.
      const tipo = r.headers.get("content-type") ?? ""
      ok = r.ok && !/text\/html/i.test(tipo)
    } catch {
      ok = false
    }
    try { sessionStorage.setItem(CHAVE, ok ? "1" : "0") } catch { /* ok */ }
    emCurso = null
    return ok
  })()
  return emCurso
}

/** A biblioteca carregou mas não arrancou: não voltar a tentar nesta sessão. */
export function marcarBibliotecaTvFalhada() {
  try { sessionStorage.setItem(CHAVE, "0") } catch { /* ok */ }
}

let promessaLib: Promise<any> | null = null

/**
 * Carrega o charting_library.standalone.js e devolve o construtor `widget` DELE.
 *
 * Cuidado: a biblioteca e o tv.js gratuito (scanner, «Análise TradingView») escrevem AMBOS em
 * `window.TradingView`. Guarda-se a referência da biblioteca e repõe-se o global que lá estava,
 * senão o próximo widget gratuito seria construído com a biblioteca (e vice-versa).
 */
export function carregarBibliotecaTv(): Promise<{ widget: any; version?: () => string }> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"))
  if (promessaLib) return promessaLib
  const w = window as any
  promessaLib = new Promise((ok, falha) => {
    const antes = w.TradingView
    const s = document.createElement("script")
    s.src = TV_LIB_SCRIPT
    s.async = true
    s.onload = () => {
      const lib = w.TradingView
      if (antes) w.TradingView = antes
      else {
        // Sem tv.js carregado antes: deixa-se o global vazio para o tv.js se instalar à vontade.
        try { delete w.TradingView } catch { w.TradingView = undefined }
      }
      if (lib?.widget) ok(lib)
      else { promessaLib = null; falha(new Error("biblioteca do TradingView inválida")) }
    }
    s.onerror = () => { promessaLib = null; falha(new Error("não foi possível carregar a biblioteca do TradingView")) }
    document.head.appendChild(s)
  })
  return promessaLib
}
