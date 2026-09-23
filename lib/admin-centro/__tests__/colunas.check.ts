/**
 * TODAS as colunas que o Centro de Controlo pede existem mesmo na base.
 *
 *   npx tsx lib/admin-centro/__tests__/colunas.check.ts
 *
 * Porquê um teste só para isto: pedir uma coluna que não existe não dá erro nenhum no ecrã — dá
 * uma LISTA VAZIA. Foi assim que `balance` em `mtmcopy_connections` (coluna que nunca existiu)
 * fez desaparecer todas as contas T2T/site do painel, com o resto da página a funcionar. O
 * `ler()` passou a distinguir coluna de tabela (lib/admin-centro/servidor/base.ts), mas o erro
 * só aparece depois de alguém abrir o ecrã: este teste apanha-o antes.
 *
 * Lê o `information_schema` com a service role e não escreve nada. Sem SUPABASE_SERVICE_ROLE_KEY
 * salta com aviso (não trava quem só quer correr os testes puros).
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = process.cwd()
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

/** Pastas do servidor que o Centro lê — todas as `.from(...).select(...)` daqui são verificadas. */
const PASTAS = ['lib/admin-centro/servidor', 'lib/mestres/servidor']

/** Colunas que o PostgREST aceita mas não são colunas de uma tabela. */
const NAO_E_COLUNA = new Set(['*', 'count'])

interface Pedido { ficheiro: string; linha: number; tabela: string; colunas: string[] }

function ficheirosTs(dir: string, out: string[] = []): string[] {
  let entradas: string[]
  try { entradas = readdirSync(dir) } catch { return out }
  for (const f of entradas) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) ficheirosTs(p, out)
    else if (f.endsWith('.ts') && !f.endsWith('.check.ts')) out.push(p)
  }
  return out
}

/**
 * Separa a lista de um `.select()` por vírgulas de topo — os embeds `tabela(a,b)` e os castes
 * `col::text` não podem partir a lista ao meio.
 */
export function partirSelect(s: string): string[] {
  const out: string[] = []
  let nivel = 0
  let actual = ''
  for (const ch of s) {
    if (ch === '(') nivel++
    if (ch === ')') nivel--
    if (ch === ',' && nivel === 0) { out.push(actual); actual = ''; continue }
    actual += ch
  }
  out.push(actual)
  return out.map((x) => x.trim()).filter(Boolean)
}

/** `alias:coluna::text` → `coluna`; `tabela(...)` → null (embed, não é coluna desta tabela). */
export function nomeDaColuna(pedaco: string): string | null {
  const p = pedaco.trim()
  if (p.includes('(')) return null
  const semCaste = p.split('::')[0].trim()
  const depoisDoAlias = semCaste.includes(':') ? semCaste.slice(semCaste.indexOf(':') + 1).trim() : semCaste
  const limpo = depoisDoAlias.replace(/^["']|["']$/g, '').trim()
  if (!limpo || NAO_E_COLUNA.has(limpo)) return null
  // `${cols}` e afins: interpolação que não conseguimos resolver aqui — ver TEMPLATES abaixo.
  if (limpo.includes('${') || limpo.includes('...')) return null
  return /^[a-z_][a-z0-9_]*$/i.test(limpo) ? limpo : null
}

/**
 * Constantes de colunas declaradas no próprio ficheiro (`const cols = '...'`), para resolver
 * os selects escritos como `` `${cols}, conta_casa` ``.
 */
function constantesDeColunas(src: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const x of src.matchAll(/const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*'([^']*)'/g)) m.set(x[1], x[2])
  return m
}

export function pedidosDoFicheiro(caminho: string, src: string): Pedido[] {
  const consts = constantesDeColunas(src)
  const linhasDoSrc = src.split('\n')
  const out: Pedido[] = []
  const re = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)\s*\.select\(\s*(['"`])([\s\S]*?)\2/g
  for (const m of src.matchAll(re)) {
    const tabela = m[1]
    let lista = m[3]
    for (const [nome, valor] of consts) lista = lista.split('${' + nome + '}').join(valor)
    const linha = linhasDoSrc.length - src.slice(m.index ?? 0).split('\n').length + 1
    const colunas = partirSelect(lista).map(nomeDaColuna).filter((c): c is string => Boolean(c))
    if (colunas.length) out.push({ ficheiro: caminho.replace(`${RAIZ}/`, ''), linha, tabela, colunas })
  }
  return out
}

async function main() {
  const pedidos: Pedido[] = []
  for (const pasta of PASTAS) for (const f of ficheirosTs(join(RAIZ, pasta))) pedidos.push(...pedidosDoFicheiro(f, readFileSync(f, 'utf8')))
  assert.ok(pedidos.length >= 20, `esperava ≥20 selects, encontrei ${pedidos.length} — o leitor deixou de apanhar os selects?`)

  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!chave) {
    console.warn('⚠ sem SUPABASE_SERVICE_ROLE_KEY: só a leitura estática correu (%d selects, %d tabelas)', pedidos.length, new Set(pedidos.map((p) => p.tabela)).size)
    return
  }

  const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
  const db = getSupabaseAdmin()
  const tabelas = [...new Set(pedidos.map((p) => p.tabela))]
  const porTabela = new Map<string, Set<string>>()
  // O `information_schema` não vem pelo PostgREST: uma leitura de 0 linhas por tabela devolve
  // o erro certo se a coluna não existir, e é barato (`limit(0)`).
  const faltas: string[] = []
  for (const p of pedidos) {
    const r = await db.from(p.tabela).select(p.colunas.join(',')).limit(0)
    if (!r.error) { porTabela.set(p.tabela, new Set(p.colunas)); continue }
    const c = String(r.error.code ?? '')
    const msg = String(r.error.message ?? '')
    if (c === 'PGRST205' || c === '42P01' || /could not find the table/i.test(msg)) continue // migração por aplicar
    faltas.push(`${p.ficheiro}:${p.linha} → ${p.tabela}: ${msg}`)
  }
  assert.deepEqual(faltas, [], `\n\nSELECTS COM COLUNAS INEXISTENTES:\n  ${faltas.join('\n  ')}\n`)
  console.log('✓ %d selects · %d tabelas · todas as colunas existem', pedidos.length, tabelas.length)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
