/**
 * O papel `tournament` é uma porta lateral, e portas laterais são onde os acessos fogem.
 *
 * Quem se inscreve num torneio sem ser cliente entra para competir — não para receber os
 * alertas e os scanners que os outros pagam. Estas verificações existem para essa linha não
 * se apagar sozinha quando alguém acrescentar um campo ao perfil.
 */
import {
  papelMtmFunded, podeVerMtmFunded, podeVerAlertas, podeUsarScanner,
  scannersPermitidos, censurarEmail,
} from '../acesso'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

const torneio = { user_type: 'tournament', is_active: true }
const membro = { user_type: 'member', subscription_plan: 'app_member', is_active: true }
const premium = { user_type: 'member', subscription_plan: 'premium', member_category: 'premium', is_active: true }
const vip = { user_type: 'vip', member_category: 'vip', subscription_plan: 'premium', is_active: true }
const admin = { user_type: 'admin', is_active: true }

// ── papéis ─────────────────────────────────────────────────────────────────
eq('participante de torneio', papelMtmFunded(torneio), 'torneio')
eq('membro da app', papelMtmFunded(membro), 'membro')
eq('premium', papelMtmFunded(premium), 'membro')
eq('vip', papelMtmFunded(vip), 'membro')
eq('admin', papelMtmFunded(admin), 'admin')
eq('sem perfil', papelMtmFunded(null), 'visitante')
eq('perfil vazio', papelMtmFunded({}), 'visitante')

// ── o torneio abre-se; os alertas não ──────────────────────────────────────
eq('torneio entra no mtmfunded', podeVerMtmFunded(torneio), true)
eq('visitante fica fora', podeVerMtmFunded(null), false)
eq('torneio NÃO vê alertas', podeVerAlertas(torneio), false)
eq('membro vê alertas', podeVerAlertas(membro), true)
eq('admin vê alertas', podeVerAlertas(admin), true)

// ── scanners: o torneio só tem o GoldKiller ────────────────────────────────
eq('torneio usa GoldKiller', podeUsarScanner(torneio, 'GoldKiller'), true)
eq('maiúsculas não furam', podeUsarScanner(torneio, 'goldkiller'), true)
eq('torneio NÃO usa Sensei', podeUsarScanner(torneio, 'Sensei'), false)
eq('torneio NÃO usa MTMScanner', podeUsarScanner(torneio, 'MTMScanner'), false)
eq('torneio NÃO usa AurumFlow', podeUsarScanner(torneio, 'AurumFlow'), false)
eq('membro usa tudo', podeUsarScanner(membro, 'Sensei'), true)
eq('membro sem restrição', scannersPermitidos(membro), null)
eq('visitante não usa nada', podeUsarScanner(null, 'GoldKiller'), false)
eq('lista do torneio tem 1', scannersPermitidos(torneio)?.length, 1)

// ── censura do email na classificação ──────────────────────────────────────
eq('email normal', censurarEmail('rubensousacaneco@proton.me'), 'ruben****@***.me')
eq('email curto', censurarEmail('ana@mtm.pt'), 'an****@***.pt')
eq('domínio escondido', censurarEmail('pedro.20v@hotmail.com').includes('hotmail'), false)
eq('sem email', censurarEmail(null), '***')
eq('lixo', censurarEmail('nao-e-email'), '***')
// A máscara tem tamanho FIXO: não pode contar ao mundo quantas letras tem o email.
eq('máscara não revela o tamanho',
   censurarEmail('a'.repeat(30) + '@x.com').split('@')[0].length,
   censurarEmail('abcdef@x.com').split('@')[0].length)
eq('nunca devolve o email inteiro', censurarEmail('x@y.com').includes('y.com'), false)

console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
process.exit(mau === 0 ? 0 : 1)
