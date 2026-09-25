/**
 * GUARDA: um preço só é «fresco» pela IDADE, nunca por ter chegado pela WebSocket.
 *
 * 25/09: o webtrader mostrava o forex congelado a branco, com o bilhete activo, porque o `snap`
 * inicial da WS vinha marcado `fresco: true` fosse qual fosse a idade do tick — nesse dia o
 * EURUSD tinha 5 minutos. O ecrã já sabe pintar a cinzento e bloquear a ordem quando o preço não
 * é fresco; faltava dizer-lhe a verdade. Isto impede que a mentira volte.
 *
 *   npx tsx components/funded/use-precos.check.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const bruto = readFileSync(join(process.cwd(), 'components/funded/use-precos.ts'), 'utf8')
// Sem comentários: este ficheiro EXPLICA o defeito de 25/09 citando `fresco: true`, e a guarda
// apanhava-se a si mesma.
const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const falhas: string[] = []

if (/fresco:\s*true/.test(fonte)) {
  falhas.push('há um `fresco: true` fixo — a frescura tem de sair da idade do tick (ehFresco)')
}
if (!/function ehFresco\s*\(/.test(fonte)) {
  falhas.push('falta a função ehFresco: é ela que compara a idade do tick com o limite da execução')
}
// O limite tem de ser o MESMO que a execução usa (PRECO_FRESCO_MS em lib/mtmfunded/simulado/ordens.ts):
// mostrar como vivo um preço que a execução recusaria é prometer uma ordem que não entra.
const limiteExec = /PRECO_FRESCO_MS\s*=\s*([\d_]+)/.exec(
  readFileSync(join(process.cwd(), 'lib/mtmfunded/simulado/ordens.ts'), 'utf8'),
)
const limiteEcra = /const FRESCO_MS\s*=\s*([\d_]+)/.exec(fonte)
if (!limiteExec || !limiteEcra) {
  falhas.push('não consegui ler os dois limites de frescura para os comparar')
} else if (limiteExec[1].replace(/_/g, '') !== limiteEcra[1].replace(/_/g, '')) {
  falhas.push(`o ecrã usa ${limiteEcra[1]} ms e a execução ${limiteExec[1]} ms — têm de ser iguais`)
}
// Um símbolo que a WS não publica não pode ficar minutos sem ninguém o ir buscar.
const buraco = /const BURACO_MS\s*=\s*([\d_]+)/.exec(fonte)
if (!buraco || Number(buraco[1].replace(/_/g, '')) > 5_000) {
  falhas.push('BURACO_MS acima de 5 s — um símbolo parado fica demasiado tempo sem ser pedido')
}
if (!/relogioFrescura/.test(fonte)) {
  falhas.push('falta o relógio da frescura: sem ele um preço que PÁRA nunca se apaga sozinho')
}

if (falhas.length) {
  console.error('use-precos: ' + falhas.length + ' falha(s)')
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('use-precos: frescura pela idade, limite igual ao da execução, buraco tapado a tempo ✓')
