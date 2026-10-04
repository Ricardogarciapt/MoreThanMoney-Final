/**
 * A GUARDA DO SOCIAL SEM MANYCHAT.
 *
 *   npx tsx lib/social/sem-manychat.check.ts
 *
 * A 04/10/2026 o dono retirou o ManyChat: «já tens tudo para o nosso sistema nos Instagrams e
 * WhatsApp poder funcionar com algo costless». O social passou a correr SÓ no sistema próprio —
 * Instagram pela Graph API (lib/instagram/**), WhatsApp pela Cloud API (lib/whatsapp-*) e o bot
 * próprio do Telegram.
 *
 * Duas coisas podem desfazer isso em silêncio, e é contra as duas que isto falha:
 *
 *  1. Alguém volta a chamar `api.manychat.com` ou a ler uma variável `MANYCHAT_*`. Nenhuma das
 *     duas dá erro em produção — a chave ainda existe na Vercel enquanto o dono não a apagar — e
 *     é por isso que só uma guarda as apanha.
 *
 *  2. A ingestão do backoffice deixa de ler uma das três fontes nativas de leads. Quando o
 *     ManyChat saiu, saiu com ele a leitura de `mtm_leads`; se um dia sair também `ig_leads`,
 *     `telegram_leads` ou os perfis parados, o pipeline fica vazio sem ninguém dar por isso —
 *     que foi exactamente o estado em que o encontraram a 25/09.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `fileURLToPath` e não `.pathname`: o disco chama-se «Disco externo», e o espaço vinha como %20.
const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const PASTAS = ['app', 'lib', 'components']
const EXTENSOES = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

function ficheiros(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) ficheiros(caminho, acc)
    else if (EXTENSOES.has(nome.slice(nome.lastIndexOf('.')))) acc.push(caminho)
  }
  return acc
}

// ── 1. Nada volta a falar com o ManyChat ──────────────────────────────────────────────────────
const PROIBIDO = [/api\.manychat\.com/, /\bMANYCHAT_[A-Z_]+/]
const infractores: string[] = []
for (const pasta of PASTAS) {
  for (const f of ficheiros(join(RAIZ, pasta))) {
    // Esta própria guarda cita os padrões para os explicar; é o único ficheiro autorizado.
    if (f.endsWith('lib/social/sem-manychat.check.ts')) continue
    const texto = readFileSync(f, 'utf-8')
    for (const re of PROIBIDO) {
      if (re.test(texto)) infractores.push(`${f.slice(RAIZ.length)} :: ${re.source}`)
    }
  }
}
assert.deepEqual(
  infractores,
  [],
  `o ManyChat saiu a 04/10/2026 e voltou a aparecer em app/, lib/ ou components/:\n  ${infractores.join('\n  ')}`,
)

// A rota que o ManyChat chamava não pode renascer com outro nome por baixo da mesma pasta.
assert.throws(
  () => statSync(join(RAIZ, 'app/api/manychat')),
  'app/api/manychat/ foi apagada com o ManyChat e não pode voltar',
)

// ── 2. A ingestão do backoffice continua a ler as três fontes nativas ─────────────────────────
const ingestao = readFileSync(join(RAIZ, 'lib/backoffice-dia-ingestao.ts'), 'utf-8')
for (const fonte of ["from('telegram_leads')", "from('ig_leads')", "from('profiles')"]) {
  assert.ok(ingestao.includes(fonte), `a ingestão do backoffice deixou de ler ${fonte}`)
}
assert.ok(
  !ingestao.includes("from('mtm_leads')"),
  'a ingestão voltou a ler mtm_leads — a tabela do ManyChat está parada desde 04/10/2026',
)

// A rota chat do dashboard-gestão prometia ferramentas ManyChat; as nativas têm de existir no seu lugar.
const chat = readFileSync(join(RAIZ, 'app/api/dashboard-gestao/chat/route.ts'), 'utf-8')
for (const tool of ['listar_leads_instagram', 'conversas_whatsapp']) {
  assert.ok(chat.includes(`name: "${tool}"`), `o chat do dashboard perdeu a ferramenta nativa ${tool}`)
  assert.ok(chat.includes(`case "${tool}":`), `a ferramenta ${tool} está anunciada mas não corre`)
}

console.log('sem-manychat: ok')
