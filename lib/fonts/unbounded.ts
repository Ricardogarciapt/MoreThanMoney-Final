import localFont from "next/font/local"

/**
 * Unbounded (OFL-1.1, via @fontsource/unbounded 5.3.0), servida pelo próprio site.
 *
 * Antes vinha de `next/font/google`, que descarrega as fontes do Google em cada build: a 04/11/2026
 * o Google respondeu mal ao builder da Vercel e todos os builds falharam. Com os ficheiros no repo,
 * o build não depende de ninguém. Só latin, pesos 600 e 800 — os que as páginas usavam.
 */
export const unbounded = localFont({
  src: [
    { path: "./unbounded-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./unbounded-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
})
