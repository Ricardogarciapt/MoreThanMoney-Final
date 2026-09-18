import assert from 'node:assert/strict'
import { ehAppNativaPorUA, ehIosNativo } from '../app-nativa'

/** Detecção das nossas apps pelo user-agent. Correr: npx tsx lib/__tests__/app-nativa.check.ts */
const IPHONE_SYSTEM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MTMNativeApp/3.7'
const IPAD_SECRETARIA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) MTMNativeApp/3.7'
const MTMAUTO_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 MTMAuto-iOS/1.2'
const MTMAUTO_ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 MTMAuto-Android/1.0'
const ANDROID_SYSTEM = 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 MTMSystemAndroid'
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'

assert.equal(ehIosNativo(IPHONE_SYSTEM), true)
assert.equal(ehIosNativo(IPAD_SECRETARIA), true, 'iPad em modo secretária (a cópia do ligador falhava aqui)')
assert.equal(ehIosNativo(MTMAUTO_IOS), true, 'MTM Auto iOS (a cópia do ligador falhava aqui)')
assert.equal(ehIosNativo(MTMAUTO_ANDROID), false)
assert.equal(ehIosNativo(ANDROID_SYSTEM), false)
assert.equal(ehIosNativo(SAFARI_MAC), false, 'um Mac a sério não é a app')
assert.equal(ehIosNativo(SAFARI_IPHONE), false, 'o Safari do iPhone não é a app')
assert.equal(ehIosNativo(''), false)

for (const ua of [IPHONE_SYSTEM, IPAD_SECRETARIA, MTMAUTO_IOS, MTMAUTO_ANDROID, ANDROID_SYSTEM]) assert.equal(ehAppNativaPorUA(ua), true, ua)
for (const ua of [SAFARI_MAC, SAFARI_IPHONE, '']) assert.equal(ehAppNativaPorUA(ua), false, ua)

console.log('  ok  app nativa: iOS (MTM System, MTM Auto, iPad «Macintosh») e Android, sem falsos positivos')
