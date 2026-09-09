/**
 * O toggle "Som das notificações" mentia.
 *
 * O iOS mandava `sound_enabled` no PATCH desde sempre; o servidor descartava-o porque o
 * normalizador só copiava as chaves que existiam no default. Resultado: 0 dos 134 perfis
 * tinham a chave gravada, e o payload APNs levava `sound: 'default'` cravado para toda a gente.
 *
 * O que fica trancado aqui: a preferência sobrevive à normalização, não é confundida com uma
 * categoria (não pode filtrar notificações), e o default é tocar.
 */
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
  isCategoryEnabled,
  isSoundEnabled,
  resolveNotificationCategory,
} from '../notification-preferences'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

// ── sobrevive à normalização (era aqui que se perdia) ───────────────────────
eq('desligado sobrevive', normalizeNotificationPreferences({ sound_enabled: false }).sound_enabled, false)
eq('ligado sobrevive',    normalizeNotificationPreferences({ sound_enabled: true }).sound_enabled, true)
eq('ausente → toca',      normalizeNotificationPreferences({}).sound_enabled, true)
eq('lixo → toca',         normalizeNotificationPreferences({ sound_enabled: 'não' }).sound_enabled, true)
eq('null → toca',         normalizeNotificationPreferences(null).sound_enabled, true)
eq('default toca',        DEFAULT_NOTIFICATION_PREFERENCES.sound_enabled, true)

// ── isSoundEnabled ─────────────────────────────────────────────────────────
eq('som off',  isSoundEnabled(normalizeNotificationPreferences({ sound_enabled: false })), false)
eq('som on',   isSoundEnabled(normalizeNotificationPreferences({ sound_enabled: true })), true)
eq('som omisso', isSoundEnabled(normalizeNotificationPreferences({})), true)

// ── NÃO é categoria: silenciar não pode deixar de entregar ──────────────────
const mudo = normalizeNotificationPreferences({ sound_enabled: false, tap_to_trade: true })
eq('mudo continua a receber T2T', isCategoryEnabled(mudo, 'tap_to_trade'), true)
eq('mudo continua a receber lives', isCategoryEnabled(mudo, 'live_sessions'), true)
eq('sound_enabled não resolve como categoria', resolveNotificationCategory('sound_enabled'), null)

// ── as categorias antigas não regrediram ───────────────────────────────────
const guardadas = normalizeNotificationPreferences({ chat: true, trade_ideas: true, sound_enabled: false })
eq('chat guardado', guardadas.chat, true)
eq('trade_ideas guardado', guardadas.trade_ideas, true)
eq('t2t default', guardadas.tap_to_trade, true)
eq('telegram default', guardadas.telegram_groups, false)
eq('som guardado junto', guardadas.sound_enabled, false)

console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
process.exit(mau === 0 ? 0 : 1)
