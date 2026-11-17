/** Lista, em JSON, os textos que falta traduzir em cada idioma. Uso: npx tsx lib/site-solucoes/i18n/falta.ts [en|de|fr|it] */
import { DICIONARIOS } from './dicionarios'
import { textosParaTraduzir } from './textos'

const todos = textosParaTraduzir()
const pedido = process.argv[2] as keyof typeof DICIONARIOS | undefined
const idiomas = pedido ? [pedido] : (Object.keys(DICIONARIOS) as (keyof typeof DICIONARIOS)[])
const out: Record<string, string[]> = {}
for (const l of idiomas) out[l] = todos.filter((x) => !DICIONARIOS[l][x]?.trim())
console.log(JSON.stringify(pedido ? out[pedido] : out, null, 1))
