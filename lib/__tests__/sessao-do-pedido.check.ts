/**
 * QUEM PEDE, SEM UMA IDA À REDE POR PEDIDO — a guarda de lib/sessao-do-pedido.ts e da cache de
 * contas do WebTrader (lib/webtrader/contas.ts).
 *
 *  1. Com `SUPABASE_JWT_SECRET`, um token bem assinado valida-se LOCALMENTE (zero chamadas a
 *     `getUser`); CASO MAU: assinatura errada não passa localmente, vai à rede e, se a rede diz
 *     não, é null.
 *  2. Sem o segredo, duas validações do mesmo token dentro de 60 s fazem UMA chamada; um token
 *     expirado recusa-se sem rede; a cache nunca vive além do `exp` do token.
 *  3. A posse de uma conta MT5 decide-se sobre as linhas cruas já lidas (puro) — e a linha do
 *     ligador sem estado NÃO conta como ligada, exactamente como o `.neq` da base a excluía.
 *  4. Pelo código: `autorizarMt5` lê tudo de `dadosDeContas` e já não há `quotaDoUtilizador` nem
 *     segunda leitura das três tabelas.
 *
 *   npx tsx lib/__tests__/sessao-do-pedido.check.ts
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SignJWT } from 'jose'

delete process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exemplo.supabase.co'

let n = 0
const teste = async (nome: string, f: () => Promise<void> | void) => { await f(); n++; console.log(`  ok  ${nome}`) }
const raiz = path.resolve(__dirname, '..', '..')
const ler = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8')

const SEGREDO = 'segredo-de-teste-com-tamanho-suficiente-para-hs256'
async function assinar(sub: string, segredo: string, expSeg: number, iss = 'https://exemplo.supabase.co/auth/v1') {
  return new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setIssuer(iss)
    .setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + expSeg).sign(new TextEncoder().encode(segredo))
}

async function main() {
  console.log('\nSESSÃO DO PEDIDO SEM REDE\n')
  const { validarAccessToken, esquecerSessoesValidadas } = await import('../sessao-do-pedido')
  const contador = { getUser: 0 }
  const deps = (segredo: string | null, respostaRede: string | null = null) => ({
    getUser: async () => { contador.getUser++; return respostaRede },
    agora: () => Date.now(),
    segredo: () => segredo,
  })

  await teste('com o segredo: token bem assinado valida-se localmente, zero rede', async () => {
    esquecerSessoesValidadas(); contador.getUser = 0
    const t = await assinar('user-1', SEGREDO, 3600)
    assert.equal(await validarAccessToken(t, deps(SEGREDO)), 'user-1')
    assert.equal(contador.getUser, 0)
  })

  await teste('caso mau: assinatura errada não passa localmente → rede → null', async () => {
    esquecerSessoesValidadas(); contador.getUser = 0
    const t = await assinar('user-1', 'outro-segredo-qualquer-com-tamanho-suficiente', 3600)
    assert.equal(await validarAccessToken(t, deps(SEGREDO)), null)
    assert.equal(contador.getUser, 1, 'foi à rede confirmar (o segredo pode ter rodado)')
  })

  await teste('sem segredo: 60 s de cache por token — duas validações, uma chamada', async () => {
    esquecerSessoesValidadas(); contador.getUser = 0
    const t = await assinar('user-2', SEGREDO, 3600)
    assert.equal(await validarAccessToken(t, deps(null, 'user-2')), 'user-2')
    assert.equal(await validarAccessToken(t, deps(null, 'user-2')), 'user-2')
    assert.equal(contador.getUser, 1)
  })

  await teste('token expirado recusa-se sem rede; a cache não sobrevive ao exp', async () => {
    esquecerSessoesValidadas(); contador.getUser = 0
    const expirado = await assinar('user-3', SEGREDO, -5)
    assert.equal(await validarAccessToken(expirado, deps(null, 'user-3')), null)
    assert.equal(contador.getUser, 0, 'o exp lê-se do próprio JWT')
    // Expira daqui a 10 s: validado agora, e 20 s depois tem de voltar a perguntar (e recusar).
    const curto = await assinar('user-4', SEGREDO, 10)
    let agora = Date.now()
    const d = { ...deps(null, 'user-4'), agora: () => agora }
    assert.equal(await validarAccessToken(curto, d), 'user-4')
    agora += 20_000
    assert.equal(await validarAccessToken(curto, d), null)
    assert.equal(contador.getUser, 1)
  })

  await teste('posse MT5 sobre as linhas cruas; ligador sem estado não conta como ligado', async () => {
    const { metaApiDaRefNasBrutas } = await import('../webtrader/contas')
    const brutas = {
      site: [
        { id: 'a', metaapi_account_id: 'm-a', mt5_platform: 'mt5', mt5_status: 'connected' },
        { id: 'b', metaapi_account_id: 'm-b', mt5_platform: 'mt5', mt5_status: null },
        { id: 'c', metaapi_account_id: 'm-c', mt5_platform: 'tradelocker', mt5_status: 'connected' },
      ],
      auto: [{ id: 'd', metaapi_account_id: 'm-d', plataforma: 'mt4' }],
      wt: [{ id: 'e', metaapi_account_id: 'm-e', estado: 'connected' }, { id: 'f', metaapi_account_id: 'm-f', estado: 'pending' }],
    }
    assert.equal(metaApiDaRefNasBrutas(brutas, 'site', 'a'), 'm-a')
    assert.equal(metaApiDaRefNasBrutas(brutas, 'site', 'b'), null, 'NULL <> disconnected é NULL na base: a linha saía')
    assert.equal(metaApiDaRefNasBrutas(brutas, 'site', 'c'), null, 'TradeLocker não é MetaApi')
    assert.equal(metaApiDaRefNasBrutas(brutas, 'auto', 'd'), 'm-d')
    assert.equal(metaApiDaRefNasBrutas(brutas, 'wt', 'e'), 'm-e')
    assert.equal(metaApiDaRefNasBrutas(brutas, 'wt', 'f'), null, 'só connected')
    assert.equal(metaApiDaRefNasBrutas(brutas, 'site', 'zzz'), null, 'de outro utilizador = não está nas linhas dele')
  })

  await teste('pelo código: uma leitura, três derivações; nada de getUser por pedido', () => {
    const contas = ler('lib/webtrader/contas.ts')
    assert.doesNotMatch(contas, /quotaDoUtilizador/, 'a quota sai de dadosDeContas')
    const autorizar = contas.slice(contas.indexOf('export async function autorizarMt5('))
    assert.match(autorizar, /await dadosDeContas\(userId\)/)
    assert.doesNotMatch(autorizar.slice(0, autorizar.indexOf('\n}')), /\.from\(/, 'autorizarMt5 não lê tabelas por si')
    assert.equal((contas.match(/\.from\('mtmcopy_connections'\)/g) ?? []).length, 1, 'só a ligação TradeLocker do site lê a tabela à parte')
    const sessao = ler('lib/sessao-do-pedido.ts')
    assert.doesNotMatch(sessao, /supabase\.auth\.getUser\(\)/, 'o cookie já não faz getUser (rede) por pedido')
    assert.match(sessao, /jwtVerify\(/)
    const entrar = ler('lib/webtrader/entrar.ts')
    assert.equal((entrar.match(/esquecerContasDoUtilizador\(userId\)/g) ?? []).length, 3, 'entrar/reutilizar/remover esquecem a cache')
  })

  console.log(`\n${n} testes ok\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
