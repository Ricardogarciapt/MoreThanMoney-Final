/**
 * GUARDA do guião do pipeline.
 *
 * O que se prova aqui é uma coisa só, e é a que o dono pôs como limite: NINGUÉM ESCREVE UM NÚMERO
 * À MÃO. Hoje encontrámos promessas antigas de «50% recorrente» e «20 000 €/mês» em texto público,
 * que nunca fecharam contas nenhumas. Um guião com um preço escrito dentro é a mesma avaria à
 * espera de acontecer: sobrevive à campanha que o criou e continua a ser dito.
 *
 * Por isso a guarda é literal — procura dígitos no texto. Se um passo precisar da escada, chama
 * `escadaNumaLinha()`, que lê de `lib/escada-precos.ts`.
 *
 *   npx tsx lib/backoffice-playbook.check.ts
 */
import { readFileSync } from 'node:fs'
import { ESTADOS_PIPELINE } from './backoffice-vista'
import { sugestaoPara, diasParado, avisoParado, DIAS_PARA_ESTAR_PARADO, regraDoBonus } from './backoffice-playbook'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

// ── Há guião para todos os estados ──────────────────────────────────────────
// Um estado sem sugestão deixava a pessoa sem passo seguinte exactamente na coluna onde estivesse
// presa — e seria o estado novo, o que ninguém se lembrou de acrescentar.
for (const e of ESTADOS_PIPELINE) {
  const s = sugestaoPara(e)
  teste(`${e}: tem passo, porquê e abertura`, !!s && !!s.passo && !!s.porque && !!s.abrir)
  teste(`${e}: o porquê é uma explicação, não uma etiqueta`, (s?.porque ?? '').length > 40)
}

// ── A REGRA QUE NÃO SE QUEBRA: nada de números escritos à mão ───────────────
{
  const fonte = readFileSync('lib/backoffice-playbook.ts', 'utf8')
  // Só o corpo do guião interessa: os comentários explicam o porquê (e citam o incidente dos
  // 20 000 €/mês de propósito), e a constante dos dias é uma decisão declarada, não um preço.
  const corpo = fonte
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/export const DIAS_PARA_ESTAR_PARADO = \d+/, '')
  const textos = [...corpo.matchAll(/'([^']{20,})'|`([^`]{20,})`/g)].map((m) => m[1] || m[2] || '')
  const comNumero = textos.filter((t) => /\d/.test(t) && !/\$\{/.test(t))
  teste(
    `nenhum texto do guião tem um número escrito à mão (${comNumero.length} encontrado(s): ${comNumero.slice(0, 2).join(' | ').slice(0, 120)})`,
    comNumero.length === 0,
  )
  // E nada de promessas de ganho, em nenhuma das formas em que elas aparecem.
  teste(
    'nada de promessas de ganho no guião',
    !/garantid|lucro certo|recorrente\s*%|por m[êe]s garantid/i.test(corpo),
  )
}

// A escada, quando é preciso, vem da fonte — e sai por ordem de venda, o topo antes da corretora.
{
  const s = sugestaoPara('apresentado')
  teste('o passo de fechar traz a escada lida da fonte', /Membro/.test(s.abrir) && /Premium/.test(s.abrir))
  teste('e a escada não abre pela rota da corretora', s.abrir.indexOf('Membro') < s.abrir.indexOf('PU Prime'))
  // O bónus só vale com as três regras juntas: acumula, dois caminhos, mais nada.
  const b = regraDoBonus()
  teste('a regra do bónus sai inteira', /ACUMULA/.test(b) && /dois caminhos/i.test(b))
}

// ── Negócio parado ─────────────────────────────────────────────────────────
{
  const agora = new Date('2026-09-25T12:00:00.000Z')
  teste('sem data não se inventa um atraso', diasParado(null, agora) === null && avisoParado(null) === null)
  teste('mexeu hoje: zero dias', diasParado('2026-09-25T09:00:00.000Z', agora) === 0)
  teste('mexeu há dez dias', diasParado('2026-09-15T12:00:00.000Z', agora) === 10)
  teste('uma data futura não dá dias negativos', diasParado('2026-10-01T00:00:00.000Z', agora) === 0)
  teste('lixo na data não inventa atraso', diasParado('ontem', agora) === null)
  teste('abaixo do limite não há aviso', avisoParado(DIAS_PARA_ESTAR_PARADO - 1) === null)
  teste('no limite já há aviso, e diz quantos dias', (avisoParado(DIAS_PARA_ESTAR_PARADO) ?? '').includes(String(DIAS_PARA_ESTAR_PARADO)))
}

if (falhas.length) {
  console.error(`backoffice/playbook: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice/playbook: há passo seguinte para todos os estados, e nenhum número escrito à mão ✓')
