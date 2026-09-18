/**
 * Salas ao vivo: o cadeado passa a ser do servidor (lib/perfil-ui → podeVerReproducaoDaSala).
 *
 * Correr: npx tsx lib/__tests__/reproducao-salas.check.ts
 *
 * O que se prova:
 *   1. `free` (a /FreeSession) é pública, mesmo sem conta;
 *   2. o resto segue a MESMA regra do ecrã (podeAcederAoTier) — o servidor nunca fecha o que o
 *      ecrã abre a quem tem sessão;
 *   3. a equipa (educador autenticado, operador, admin) vê sempre;
 *   4. a sala ocultada não leva nenhum endereço de reprodução;
 *   5. as rotas (lista, sala, WHEP, legendas) usam a regra, e os players mandam a sessão.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { podeAcederAoTier, podeVerReproducaoDaSala, type PerfilUi } from '@/lib/perfil-ui'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

const admin: PerfilUi = { is_active: true, user_type: 'admin', member_category: 'standard' }
const vipPorTipo: PerfilUi = { is_active: true, user_type: 'vip', member_category: 'standard' }
const vipPorNivel: PerfilUi = { is_active: true, user_type: 'member', member_category: 'standard', membership_level: 'vip' }
const premiumPorPlano: PerfilUi = { is_active: true, user_type: 'member', member_category: 'standard', subscription_plan: 'premium' }
const premiumPorCategoria: PerfilUi = { is_active: true, user_type: 'member', member_category: 'premium', subscription_plan: 'app_member' }
const fundador: PerfilUi = { is_active: true, user_type: 'member', member_category: 'fundador' }
const iq: PerfilUi = { is_active: true, user_type: 'member', member_category: 'iq' }
const membro: PerfilUi = { is_active: true, user_type: 'member', member_category: 'standard', subscription_plan: 'app_member' }
const trial: PerfilUi = { is_active: true, user_type: 'guest', member_category: 'premium' }
const skool: PerfilUi = { is_active: true, user_type: 'member', member_category: 'skool' }
const emPausa: PerfilUi = { is_active: false, user_type: 'member', member_category: 'premium', subscription_plan: 'premium' }

const TIERS = ['free', 'all', null, 'app_member', 'premium', 'vip'] as const

// ── 1. free é público ──────────────────────────────────────────────────────────────────────
assert.equal(podeVerReproducaoDaSala(null, 'free'), true, 'a /FreeSession não pede login')
assert.equal(podeVerReproducaoDaSala(emPausa, 'free'), true)
assert.equal(podeVerReproducaoDaSala(null, 'FREE'), true)
for (const t of ['all', null, 'app_member', 'premium', 'vip']) {
  assert.equal(podeVerReproducaoDaSala(null, t), false, `visitante sem conta não vê a sala ${t}`)
}

// ── 2. Mesma regra do ecrã para quem tem sessão ───────────────────────────────────────────
for (const p of [admin, vipPorTipo, vipPorNivel, premiumPorPlano, premiumPorCategoria, fundador, iq, membro, trial, skool, emPausa]) {
  for (const t of TIERS) {
    if (t === 'free') continue
    assert.equal(podeVerReproducaoDaSala(p, t), podeAcederAoTier(p, t), `servidor ≠ ecrã em ${JSON.stringify(p)} / ${t}`)
  }
}
// Os casos que interessam ao dinheiro, escritos à vista:
assert.equal(podeVerReproducaoDaSala(premiumPorCategoria, 'premium'), true, 'Premium pela categoria entra na sala Premium')
assert.equal(podeVerReproducaoDaSala(premiumPorPlano, 'premium'), true, 'Premium pelo plano entra na sala Premium')
assert.equal(podeVerReproducaoDaSala(fundador, 'premium'), true, 'o Fundador é Premium')
assert.equal(podeVerReproducaoDaSala(vipPorTipo, 'vip'), true)
assert.equal(podeVerReproducaoDaSala(vipPorNivel, 'premium'), true)
assert.equal(podeVerReproducaoDaSala(membro, 'app_member'), true)
assert.equal(podeVerReproducaoDaSala(membro, 'premium'), false, 'o Membro não vê a sala Premium')
assert.equal(podeVerReproducaoDaSala(premiumPorPlano, 'vip'), false, 'o Premium não vê a sala VIP')
assert.equal(podeVerReproducaoDaSala(emPausa, 'all'), false, 'conta em pausa não vê nada pago')

// ── 3. Equipa vê sempre ────────────────────────────────────────────────────────────────────
for (const t of TIERS) assert.equal(podeVerReproducaoDaSala(null, t, { equipa: true }), true)

// ── 4/5. As rotas ──────────────────────────────────────────────────────────────────────────
const servidor = ler('lib/live-acesso-servidor.ts')
assert.match(servidor, /playback_url: null, hls_manifest_url: null, reproducao_bloqueada: true/)
assert.match(servidor, /verifyEducatorToken\(token\)\) return \{ perfil: null, equipa: true \}/, 'educador/operador = equipa')

const lista = ler('app/api/live-sessions/streams/route.ts')
assert.match(lista, /aplicarAcessoAReproducao\(/)
assert.match(lista, /canSeeSecrets\s*\?\s*safeMapped/, 'o studio do educador continua a receber tudo')
const sala = ler('app/api/live-sessions/streams/[id]/route.ts')
assert.match(sala, /aplicarAcessoAReproducao\(/)
assert.match(sala, /if \(isOwner \|\| isAdmin\)/, 'dono e admin continuam com a vista completa')
const whep = ler('app/api/live-sessions/whep/route.ts')
assert.match(whep, /podeVerReproducaoDaSala\(quem\.perfil, sala\.tier/)
const legendas = ler('app/api/live-sessions/streams/[id]/captions/route.ts')
assert.match(legendas, /captions: cues\.map\(\(c\) => \(\{ seq: c\.seq \}\)\)/, 'o caption-worker continua a ler a numeração')
assert.match(legendas, /x-caption-secret/)

// Os players mandam a sessão (as apps nativas/webviews não têm cookie).
for (const f of [
  'components/live/live-stream-room.tsx',
  'components/mobile/live-sessions-mobile.tsx',
  'components/mobile/live-captions.tsx',
  'components/mobile/live-dub-audio.tsx',
  'lib/lms-whep.ts',
]) {
  assert.match(ler(f), /authHeaders\(/, `${f} tem de mandar a sessão`)
}

console.log('reproducao-salas: OK')
