import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Guarda da saída do AIOS do site (decisão do dono 06/10).
 *
 * O AIOS vive agora só localmente. Saíram do site: /aios, /jarvis, /api/aios/*, lib/aios,
 * components/aios e aios-ponte. FICAM (o AIOS local usa-os): /api/agent/v1/**,
 * lib/agent-site-api, /api/sales-machine, /admin/agentes, /api/dashboard-gestao, lib/voz.
 *
 * Esta guarda falha se algum ficheiro voltar a apontar para o que saiu — um import morto parte
 * o build, um fetch morto parte em silêncio na produção.
 */

const RAIZ = join(__dirname, '..')

/** Padrões que indicam uma referência ao AIOS removido. */
const PROIBIDOS: RegExp[] = [
  /from\s+['"][^'"]*(components|lib|app)\/aios(\/|['"])/,
  /['"`]\/api\/aios\//,
  /aios-ponte/,
  /href=["'{`]+\/(aios|jarvis)["'`}]/,
]

export function referenciaAiosRemovido(conteudo: string): boolean {
  return PROIBIDOS.some((re) => re.test(conteudo))
}

// ── O caso MAU: uma referência morta é apanhada ─────────────────────────────
assert.equal(referenciaAiosRemovido(`import { Consola } from "@/components/aios/consola"`), true)
assert.equal(referenciaAiosRemovido(`import { x } from '../lib/aios/ponte'`), true)
assert.equal(referenciaAiosRemovido(`await fetch("/api/aios/voz", {})`), true)
assert.equal(referenciaAiosRemovido(`<Link href="/jarvis">`), true)
// O que fica não é confundido com o que saiu.
assert.equal(referenciaAiosRemovido(`fetch('/api/agent/v1/business')`), false)
assert.equal(referenciaAiosRemovido(`href="https://mtmaios.lovable.app"`), false)

// ── Os ficheiros saíram mesmo ───────────────────────────────────────────────
for (const p of ['app/aios', 'app/jarvis', 'app/api/aios', 'lib/aios', 'components/aios', 'aios-ponte']) {
  assert.equal(existsSync(join(RAIZ, p)), false, `${p} devia ter saído`)
}
// ── O que o AIOS local usa continua cá ──────────────────────────────────────
for (const p of ['app/api/agent/v1', 'lib/agent-site-api.ts', 'lib/sales-machine.ts', 'app/admin/agentes', 'lib/voz']) {
  assert.equal(existsSync(join(RAIZ, p)), true, `${p} tem de ficar (o AIOS local usa-o)`)
}

// ── Nenhum ficheiro do repo aponta para o que saiu ──────────────────────────
const IGNORAR = new Set(['node_modules', '.next', '.git', 'graphify-out', 'public', 'supabase', '.vercel'])
const ofensores: string[] = []
function varrer(dir: string) {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue
    const c = join(dir, nome)
    const st = statSync(c)
    if (st.isDirectory()) varrer(c)
    else if (/\.(tsx?|mjs|js)$/.test(nome) && !c.endsWith('remocao-aios.check.ts')) {
      if (referenciaAiosRemovido(readFileSync(c, 'utf8'))) ofensores.push(relative(RAIZ, c))
    }
  }
}
for (const d of ['app', 'components', 'lib', 'hooks', 'middleware.ts']) {
  const c = join(RAIZ, d)
  if (!existsSync(c)) continue
  if (statSync(c).isDirectory()) varrer(c)
  else if (referenciaAiosRemovido(readFileSync(c, 'utf8'))) ofensores.push(d)
}
assert.deepEqual(ofensores, [], `ainda apontam para o AIOS removido: ${ofensores.join(', ')}`)

// ── Os links guardados não dão 404 ──────────────────────────────────────────
const conf = readFileSync(join(RAIZ, 'next.config.mjs'), 'utf8')
assert.match(conf, /source:\s*'\/aios\/:path\*'[\s\S]{0,80}destination:\s*'\/admin'[\s\S]{0,40}permanent:\s*true/)
assert.match(conf, /source:\s*'\/jarvis\/:path\*'[\s\S]{0,80}destination:\s*'\/admin'[\s\S]{0,40}permanent:\s*true/)

console.log('remocao-aios: ok — nada aponta para o AIOS removido; /aios e /jarvis redireccionam (308) para /admin')
