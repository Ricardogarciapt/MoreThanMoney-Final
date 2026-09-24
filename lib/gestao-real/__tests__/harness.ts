/**
 * BANCO DE PARIDADE — corre um monitor (o ORIGINAL tirado do git, ou o actual do disco) com os
 * módulos de IO trocados por falsos, e devolve o registo de TUDO o que ele fez: ordens, escritas
 * na base, anúncios. Dois registos iguais para os mesmos cenários = mesmo comportamento.
 *
 * Como: esbuild empacota o ficheiro com um plugin que substitui os imports listados por módulos
 * virtuais que leem `globalThis.__P` (o «mundo»: tabelas, contas, preços, interruptores).
 * Tudo o resto (regras de pip, parser, trailing…) entra REAL.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

export const RAIZ = path.resolve(__dirname, '../../..')
const requerer = createRequire(path.join(RAIZ, 'package.json'))

/** Commit de produção (main) antes da extracção para lib/gestao-real. */
export const REF_ORIGINAL = process.env.PARIDADE_REF || '8a81044'

export function fonteDoGit(ficheiro: string, ref = REF_ORIGINAL): string {
  return execFileSync('git', ['show', `${ref}:${ficheiro}`], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
}

export type Registo = Record<string, unknown>

/** Base de dados em memória com os filtros que os monitores usam. */
export const FALSO_SUPABASE = `
const P = () => globalThis.__P
function limpar(o) {
  if (!o || typeof o !== 'object') return o
  const c = { ...o }
  delete c.updated_at
  return c
}
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.payload = null; this.um = null }
  select() { return this }
  order() { return this }
  limit() { return this }
  eq(c, v) { this.f.push((r) => r[c] === v); this.fs = [...(this.fs || []), ['eq', c, v]]; return this }
  neq(c, v) { this.f.push((r) => r[c] !== v); return this }
  ilike(c, v) {
    // Faltava: lib/mestres chama .ilike() e o falso rebentava («ilike is not a function»).
    // O erro era apanhado pelo catch de quem chama, que so registava «leitura de
    // mestres_estrategias falhou» — ou seja, o teste corria com esse caminho morto.
    const alvo = String(v).toLowerCase()
    const partes = alvo.split('%')
    this.f.push((r) => {
      if (r[c] == null) return false
      const txt = String(r[c]).toLowerCase()
      let i = 0
      for (let k = 0; k < partes.length; k++) {
        const parte = partes[k]
        if (parte === '') continue
        const j = txt.indexOf(parte, i)
        if (j < 0) return false
        if (k === 0 && !alvo.startsWith('%') && j !== 0) return false
        i = j + parte.length
      }
      if (!alvo.endsWith('%') && i !== txt.length) return false
      return true
    })
    this.fs = [...(this.fs || []), ['ilike', c, v]]
    return this
  }
  in(c, vs) { this.f.push((r) => vs.includes(r[c])); return this }
  gte(c, v) { this.f.push((r) => r[c] == null || String(r[c]) >= String(v)); return this }
  not(c, op, v) { this.f.push((r) => !(op === 'is' && v === null ? r[c] == null : r[c] === v)); return this }
  update(p) { this.op = 'update'; this.payload = p; return this }
  upsert(p, o) { this.op = 'upsert'; this.payload = p; this.conf = o && o.onConflict; return this }
  insert(p) { this.op = 'insert'; this.payload = p; return this }
  maybeSingle() { this.um = 'maybe'; return this }
  single() { this.um = 'single'; return this }
  tabela() { const w = P(); w.db[this.t] = w.db[this.t] || []; return w.db[this.t] }
  correr() {
    const w = P()
    const linhas = this.tabela()
    if (this.op === 'update') {
      w.log.push({ k: 'db', t: this.t, op: 'update', p: limpar(this.payload), onde: this.fs || [] })
      for (const r of linhas.filter((r) => this.f.every((f) => f(r)))) Object.assign(r, this.payload)
      return { data: null, error: w.erroUpdate ? { message: 'falso' } : null }
    }
    if (this.op === 'upsert') {
      w.log.push({ k: 'db', t: this.t, op: 'upsert', p: limpar(this.payload) })
      if (this.conf === 'key') {
        const i = linhas.findIndex((r) => r.key === this.payload.key)
        if (i >= 0) linhas[i] = { ...this.payload }; else linhas.push({ ...this.payload })
      }
      return { data: null, error: null }
    }
    if (this.op === 'insert') {
      w.log.push({ k: 'db', t: this.t, op: 'insert', p: limpar(this.payload) })
      const id = 'ins-' + (++w.seq)
      linhas.push({ id, ...this.payload })
      return { data: this.um ? { id } : [{ id }], error: null }
    }
    const res = JSON.parse(JSON.stringify(linhas.filter((r) => this.f.every((f) => f(r)))))
    if (this.um) return { data: res[0] ?? null, error: null }
    return { data: res, error: null }
  }
  then(ok, ko) { try { return Promise.resolve(this.correr()).then(ok, ko) } catch (e) { return Promise.reject(e).then(ok, ko) } }
}
const cliente = { from: (t) => new Q(t) }
export function getSupabaseAdmin() { return cliente }
export function admin() { return cliente }
`

/** Corretora falsa: posições por conta; modificar/fechar mexem nelas. */
export const FALSA_CORRETORA = `
const P = () => globalThis.__P
function contas() { return P().contas }
export function posicoesDe(acc) {
  const w = P()
  if (w.ilegivel && w.ilegivel.includes(acc)) return null
  return JSON.parse(JSON.stringify(contas()[acc] || []))
}
export function modificarReal(acc, id, sl, tp) {
  const p = (contas()[acc] || []).find((x) => String(x.id) === String(id))
  if (p) { if (sl != null && sl > 0) p.stopLoss = sl; if (tp != null && tp > 0) p.takeProfit = tp }
  return !!p && !(P().falhaModificar)
}
export function fecharReal(acc, id, vol) {
  const w = P()
  if (w.falhaFechar) return false
  const l = contas()[acc] || []
  const i = l.findIndex((x) => String(x.id) === String(id))
  if (i < 0) return false
  if (vol != null && vol > 0 && vol < (l[i].volume || 0) - 1e-9) l[i].volume = Math.round((l[i].volume - vol) * 100) / 100
  else l.splice(i, 1)
  return true
}
`

export interface OpcoesEmpacotar {
  /** Código TS do ficheiro de entrada. */
  codigo: string
  /** Pasta onde o ficheiro vive (para resolver imports relativos). */
  pasta: string
  /**
   * especificador exacto → código JS do módulo falso (pode importar 'corretora-falsa'), ou um
   * módulo TS de substituição com a pasta onde resolver os imports dele (ex.: a versão do git).
   */
  falsos: Record<string, string | { codigo: string; pasta: string }>
  raiz?: string
}

let n = 0
/** Empacota e carrega. Devolve os exports do módulo. */
export async function empacotar<T = Record<string, unknown>>(o: OpcoesEmpacotar): Promise<T> {
  const esbuild = requerer('esbuild') as typeof import('esbuild')
  const raiz = o.raiz ?? RAIZ
  const saida = path.join(mkdtempSync(path.join(tmpdir(), 'paridade-')), `m${++n}.cjs`)
  const falsos: OpcoesEmpacotar['falsos'] = { ...o.falsos, 'corretora-falsa': FALSA_CORRETORA }
  const especificadores = Object.keys(falsos)
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const filtro = new RegExp(`^(${especificadores.map(esc).join('|')})$`)
  const r = await esbuild.build({
    stdin: { contents: o.codigo, resolveDir: o.pasta, sourcefile: 'entrada.ts', loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    write: false,
    tsconfig: path.join(raiz, 'tsconfig.json'),
    logLevel: 'silent',
    plugins: [{
      name: 'falsos',
      setup(b) {
        b.onResolve({ filter: filtro }, (a) => ({ path: a.path, namespace: 'falso' }))
        b.onLoad({ filter: /.*/, namespace: 'falso' }, (a) => {
          const f = falsos[a.path]
          return typeof f === 'string'
            ? { contents: f, loader: 'js', resolveDir: raiz }
            : { contents: f.codigo, loader: 'ts', resolveDir: f.pasta }
        })
      },
    }],
  })
  writeFileSync(saida, r.outputFiles[0].text)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(saida) as T
}

/** Normaliza para comparar: tira datas ISO e ids gerados. */
export function normalizar(log: Registo[]): Registo[] {
  return JSON.parse(JSON.stringify(log, (_k, v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? '<data>' : v)))
}

/** Primeira diferença entre dois registos, para a mensagem do assert. */
export function primeiraDiferenca(a: Registo[], b: Registo[]): string {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = JSON.stringify(a[i]); const y = JSON.stringify(b[i])
    if (x !== y) return `#${i}\n  original: ${x}\n  actual:   ${y}`
  }
  return 'iguais'
}
