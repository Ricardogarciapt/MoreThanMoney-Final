/**
 * Colunas de direitos em public.profiles — guarda da migração 186.
 *
 * Correr: npx tsx lib/__tests__/profiles-colunas-protegidas.check.ts
 *
 * A falha que isto fecha: a policy de UPDATE em profiles é só `auth.uid() = id`, por isso quem tem
 * sessão podia escrever `user_type = 'admin'` na própria linha pelo cliente do browser. A 186 põe um
 * trigger que repõe as colunas de direitos quando a escrita vem com token anon/authenticated.
 *
 * O que se prova:
 *   1. todas as colunas de direitos do inventário estão na lista da migração (e a lista não tem
 *      nomes inventados);
 *   2. o INSERT do cliente tem valor por omissão para cada coluna protegida (ninguém nasce admin);
 *   3. nenhuma escrita a profiles feita com o token do utilizador (browser, createServerClient,
 *      helpers chamados do browser) toca numa coluna protegida — senão a 186 calava-a em silêncio
 *      e o ecrã deixava de funcionar sem erro;
 *   4. as excepções conhecidas são só as previstas (descida de direitos do trial, registo como
 *      member/pending).
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = join(__dirname, '..', '..')
const MIGRACAO = join(RAIZ, 'supabase', 'migrations', '186_profiles_colunas_protegidas.sql')

// ── 1. Inventário (confirmado no information_schema a 06/10) ─────────────────────────────────────
// Tudo o que dá papel, acesso, dinheiro ou identidade usada pelos webhooks.
const INVENTARIO_DIREITOS = [
  // papel / VIP / categoria
  'user_type', 'membership_level', 'package', 'member_category',
  // activação e trial
  'is_active', 'ativo', 'is_verified', 'trial_expires_at', 'trial_expired', 'inactive_reason',
  'inactive_since', 'access_revoked_at', 'conversion_deadline',
  // MTM Auto
  'mtm_auto_requested', 'mtm_auto_requested_at', 'mtm_auto_enabled', 'mtm_auto_enabled_at',
  'mtm_auto_enabled_by', 'mtm_auto_admin',
  // subscrição / pagamento / expiração
  'subscription_expires_at', 'subscription_auto_renew', 'subscription_auto_renews',
  'subscription_plan', 'subscription_billing_cycle', 'subscription_platform', 'subscription_status',
  'subscription_renewal_count', 'payment_failed_count', 'last_payment_at', 'next_billing_at',
  'checkout_source', 'coupon_code', 'stripe_customer_id', 'stripe_subscription_id',
  'stripe_price_id', 'apple_original_transaction_id', 'apple_product_id', 'skool_member_id',
  'mtmcopy_subscription_active', 'mtmcopy_subscription_expires_at', 'contas_extra_pagas',
  // corretora / PrimeGate
  'broker_verified', 'primegate_estado', 'primegate_confirmado_em',
  // MLM / afiliados / referências / créditos
  'mlm_sponsor_username', 'mlm_rank_id', 'mlm_total_earned', 'stripe_connect_account_id',
  'stripe_connect_status', 'stripe_connect_onboarded_at', 'referral_code', 'referred_by_code',
  'referral_username', 'affiliate_code',
  // identidade e ligações
  'email', 'login_provider', 'iqonic_id', 'iqonic_validated_by', 'iqonic_validated_at',
  'metaapi_id', 'risco_percent', 'created_at',
  // addons, ativação pendente, webtrader, marketplace
  'profile_data',
]

// Colunas que o cliente escreve legitimamente — NÃO podem estar protegidas.
const LIVRES_DO_CLIENTE = [
  'full_name', 'username', 'phone', 'whatsapp', 'avatar_url', 'broker_uid', 'preferred_language',
  'updated_at', 'bio', 'birth_date', 'social_media', 'jifu_id', 'jifu_affiliate_link', 'country',
  'timezone', 'detected_language', 'auto_translate', 'tradingview_username', 'onboarding_platform',
  'last_login', 'notification_preferences',
]

// Todas as colunas reais de public.profiles (information_schema, 06/10).
const COLUNAS_REAIS = new Set([
  'id', ...INVENTARIO_DIREITOS, ...LIVRES_DO_CLIENTE,
])

const sql = readFileSync(MIGRACAO, 'utf8')
const bloco = sql.match(/PROTEGIDAS:INICIO([\s\S]*?)PROTEGIDAS:FIM/)
assert.ok(bloco, 'a migração tem de marcar a lista com PROTEGIDAS:INICIO / PROTEGIDAS:FIM')
const PROTEGIDAS = new Set(
  [...bloco[1].replace(/--.*$/gm, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
)

for (const c of INVENTARIO_DIREITOS) {
  assert.ok(PROTEGIDAS.has(c), `coluna de direitos sem protecção na 186: ${c}`)
}
for (const c of PROTEGIDAS) {
  assert.ok(COLUNAS_REAIS.has(c), `a 186 protege uma coluna que não existe em profiles: ${c}`)
}
for (const c of LIVRES_DO_CLIENTE) {
  assert.ok(!PROTEGIDAS.has(c), `a 186 protege uma coluna que o cliente escreve: ${c}`)
}

// ── 2. INSERT: cada protegida tem valor por omissão (ou tratamento próprio) ─────────────────────
const blocoOmissao = sql.match(/omissao := jsonb_build_object\(([\s\S]*?)\);\s*new := jsonb_populate_record\(new, omissao\)/)
assert.ok(blocoOmissao, 'a 186 tem de forçar os valores por omissão no INSERT')
const comOmissao = new Set(
  [...blocoOmissao[1].replace(/--.*$/gm, '').matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1]),
)
const TRATAMENTO_PROPRIO_NO_INSERT = new Set(['user_type', 'is_active', 'email'])
for (const c of PROTEGIDAS) {
  assert.ok(
    comOmissao.has(c) || TRATAMENTO_PROPRIO_NO_INSERT.has(c),
    `INSERT do cliente deixa escrever ${c} (falta valor por omissão na 186)`,
  )
}
for (const c of TRATAMENTO_PROPRIO_NO_INSERT) {
  assert.ok(new RegExp(`new\\.${c}\\s*:=`).test(sql), `a 186 tem de tratar ${c} no INSERT`)
}
assert.match(sql, /security definer/i)
assert.match(sql, /set search_path = /i)
assert.match(sql, /papel not in \('anon', 'authenticated'\)/, 'service_role/postgres têm de passar sem toque')
assert.match(sql, /drop trigger if exists zz_profiles_colunas_protegidas/i)

// ── 3. Escritas do cliente no código ─────────────────────────────────────────────────────────────
const PASTAS = ['app', 'components', 'contexts', 'hooks', 'lib']
// Helpers que recebem o cliente por parâmetro e são chamados a partir do browser.
const HELPERS_DO_BROWSER = new Set(['lib/member-profile.ts'])

type Escrita = { ficheiro: string; linha: number; op: string; chaves: Map<string, string> ; opaco: boolean }

function ficheiros(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (/node_modules|\.next|__tests__/.test(p)) continue
    const s = statSync(p)
    if (s.isDirectory()) ficheiros(p, out)
    else if (/\.(tsx?|jsx?)$/.test(nome) && !/\.check\.ts$/.test(nome)) out.push(p)
  }
  return out
}

/** Chaves de topo de um objecto literal que começa em src[inicio] === '{'. */
function chavesDoObjecto(src: string, inicio: number): { chaves: Map<string, string>; opaco: boolean } {
  const chaves = new Map<string, string>()
  let opaco = false
  let prof = 0
  let i = inicio
  let segmento = ''
  const fechar = () => {
    const s = segmento.trim()
    segmento = ''
    if (!s) return
    if (s.startsWith('...')) { opaco = true; return }
    const m = s.match(/^['"]?([A-Za-z_][\w]*)['"]?\s*(?::\s*([\s\S]*))?$/)
    if (m) chaves.set(m[1], (m[2] ?? m[1]).trim())
  }
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{' || ch === '[' || ch === '(') { prof++; if (prof === 1) continue }
    if (ch === '}' || ch === ']' || ch === ')') { prof--; if (prof === 0) { fechar(); break } }
    if (prof === 1 && ch === ',') { fechar(); continue }
    if (prof >= 1) segmento += ch
  }
  return { chaves, opaco }
}

function escritasDoCliente(abs: string): Escrita[] {
  const rel = relative(RAIZ, abs).split('\\').join('/')
  const src = readFileSync(abs, 'utf8')
  const usaCliente = /^\s*['"]use client['"]/.test(src)
  const importaBrowser = /import\s*\{[^}]*\bsupabase\b[^}]*\}\s*from\s*['"]@\/lib\/supabase['"]/.test(src)
  const out: Escrita[] = []
  const re = /([\w$]+)?\s*\.from\(\s*['"`]profiles['"`]\s*\)\s*\.(update|upsert|insert)\(\s*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const ident = m[1] ?? ''
    const atribuicao = src.match(new RegExp(`(?:const|let)\\s+${ident}\\s*(?::[^=]+)?=\\s*([^\\n]+)`))
    const rhs = atribuicao?.[1] ?? ''
    const ehAdmin = /admin|service/i.test(ident) || /getSupabaseAdmin|SERVICE_ROLE|createAdminClient|supabaseAdmin/.test(rhs)
    const ehToken =
      (!ehAdmin && usaCliente) ||
      (ident === 'supabase' && importaBrowser && !atribuicao) ||
      /createServerClient|createRouteHandlerClient|createServerComponentClient|createBrowserClient/.test(rhs) ||
      HELPERS_DO_BROWSER.has(rel)
    if (!ehToken) continue

    const linha = src.slice(0, m.index).split('\n').length
    let pos = m.index + m[0].length
    if (src[pos] === '[') pos++
    while (/\s/.test(src[pos])) pos++
    let alvo: { chaves: Map<string, string>; opaco: boolean }
    if (src[pos] === '{') {
      alvo = chavesDoObjecto(src, pos)
    } else {
      // payload numa variável: `const patch = { ... }` no mesmo ficheiro
      const nome = src.slice(pos).match(/^[\w$]+/)?.[0] ?? ''
      const def = new RegExp(`(?:const|let)\\s+${nome}\\s*(?::[^=]+)?=\\s*\\{`).exec(src)
      alvo = def ? chavesDoObjecto(src, def.index + def[0].length - 1) : { chaves: new Map(), opaco: true }
    }
    out.push({ ficheiro: rel, linha, op: m[2], ...alvo })
  }
  return out
}

// Excepções que a 186 trata de propósito.
function permitido(e: Escrita, chave: string, valor: string): boolean {
  if (e.op === 'update') {
    // descida de direitos do trial expirado (contexts/auth-context.tsx)
    if (chave === 'is_active' && valor === 'false') return true
    if (chave === 'trial_expired' && valor === 'true') return true
    return false
  }
  // insert/upsert: registo como member/pending; is_active livre; email substituído pelo do auth;
  // os restantes só se o valor for o mesmo que a 186 força.
  if (chave === 'user_type') return /^(['"])(member|pending)\1$/.test(valor) || /\?\s*['"]member['"]\s*:\s*['"]pending['"]/.test(valor)
  if (chave === 'is_active' || chave === 'email' || chave === 'created_at') return true
  if (chave === 'member_category') return /^['"]standard['"]$/.test(valor)
  return false
}

const todas: Escrita[] = []
for (const p of PASTAS) for (const f of ficheiros(join(RAIZ, p))) todas.push(...escritasDoCliente(f))

assert.ok(todas.length >= 9, `esperava encontrar as escritas conhecidas do cliente; achei ${todas.length}`)

const violacoes: string[] = []
for (const e of todas) {
  if (e.opaco) violacoes.push(`${e.ficheiro}:${e.linha} payload que não consigo ler (spread/variável) — rever à mão`)
  for (const [chave, valor] of e.chaves) {
    if (PROTEGIDAS.has(chave) && !permitido(e, chave, valor)) {
      violacoes.push(`${e.ficheiro}:${e.linha} ${e.op} escreve ${chave} = ${valor}`)
    }
  }
}
assert.deepEqual(violacoes, [], 'escritas do cliente em colunas protegidas pela 186:\n  ' + violacoes.join('\n  '))

console.log(
  `OK — ${PROTEGIDAS.size} colunas protegidas; ${todas.length} escritas do cliente a profiles, nenhuma em coluna protegida:\n` +
    todas.map((e) => `  ${e.ficheiro}:${e.linha} ${e.op} {${[...e.chaves.keys()].join(', ')}}`).join('\n'),
)
