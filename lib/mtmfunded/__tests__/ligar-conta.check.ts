/**
 * Ligar contas MTM Funded nas apps (074): validação das credenciais, limite de tentativas e
 * encaminhamento dos executores (mtmfunded nunca chega à MetaApi/TradeLocker).
 *
 *   npx tsx lib/mtmfunded/__tests__/ligar-conta.check.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decidirLigacao,
  tentativasEsgotadas,
  loginLimpo,
  servidorValido,
  MAX_FALHAS_POR_LOGIN,
  MAX_FALHAS_POR_UTILIZADOR,
  JANELA_TENTATIVAS_MS,
  type Tentativa,
} from '../simulado/ligar-conta-regras'
import { destinoDeExecucao, semMtmFunded } from '../../mtmcopy/destino-execucao'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}

// «Cifra» de brincar: o teste não precisa da chave — só da regra.
const cifra = (t: string) => `c:${t}`
const decifrar = (v: string | null | undefined) => (v && v.startsWith('c:') ? v.slice(2) : null)

const DONO = 'u-dono'
const OUTRO = 'u-outro'
const conta = { id: 'acc-1', user_id: DONO, mt5_password_cifrada: cifra('Master#123'), mt5_investor_cifrada: cifra('Invest#456') }

// ── credenciais ─────────────────────────────────────────────────────────────
eq('dono + master → ligação completa', decidirLigacao({ conta, password: 'Master#123', userId: DONO, decifrar }), { ok: true, modo: 'master', somenteLeitura: false })
eq('outro + master → recusada', decidirLigacao({ conta, password: 'Master#123', userId: OUTRO, decifrar }), { ok: false, codigo: 'conta_de_outro' })
eq('outro + investor → só leitura', decidirLigacao({ conta, password: 'Invest#456', userId: OUTRO, decifrar }), { ok: true, modo: 'investor', somenteLeitura: true })
eq('dono + investor → só leitura', decidirLigacao({ conta, password: 'Invest#456', userId: DONO, decifrar }), { ok: true, modo: 'investor', somenteLeitura: true })
const errada = decidirLigacao({ conta, password: 'Master#12', userId: DONO, decifrar })
const inexistente = decidirLigacao({ conta: null, password: 'Master#123', userId: DONO, decifrar })
eq('password errada → genérico', errada, { ok: false, codigo: 'credenciais' })
eq('login inexistente → a MESMA resposta', inexistente, errada)
eq('password vazia → genérico', decidirLigacao({ conta, password: '', userId: DONO, decifrar }), { ok: false, codigo: 'credenciais' })
eq('cifra adulterada → genérico', decidirLigacao({ conta: { ...conta, mt5_password_cifrada: 'lixo', mt5_investor_cifrada: null }, password: 'Master#123', userId: DONO, decifrar }), { ok: false, codigo: 'credenciais' })
eq('conta sem dono + master → recusada', decidirLigacao({ conta: { ...conta, user_id: null }, password: 'Master#123', userId: DONO, decifrar }), { ok: false, codigo: 'conta_de_outro' })

eq('login 77 + 6 dígitos', loginLimpo(' 77 123 456 '), '77123456')
eq('login de corretora externa recusado', loginLimpo('12345678'), null)
eq('servidor MTM Funded (maiúsculas/espaços)', servidorValido('mtm  funded'), true)
eq('servidor vazio assume MTM Funded', servidorValido(''), true)
eq('outro servidor recusado', servidorValido('PUPrime-Live'), false)

// ── limite de tentativas ────────────────────────────────────────────────────
const agora = 1_800_000_000_000
const falhas = (n: number, userId: string, login: string, idade = 60_000): Tentativa[] =>
  Array.from({ length: n }, () => ({ user_id: userId, login, ok: false, criado_em: agora - idade }))

eq('4 falhas do utilizador → ainda deixa', tentativasEsgotadas(falhas(MAX_FALHAS_POR_UTILIZADOR - 1, DONO, '77000001'), DONO, '77000002', agora), false)
eq('5 falhas do utilizador → bloqueia (qualquer login)', tentativasEsgotadas(falhas(MAX_FALHAS_POR_UTILIZADOR, DONO, '77000001'), DONO, '77999999', agora), true)
eq('10 falhas no login vindas de vários utilizadores → bloqueia o login', tentativasEsgotadas(
  Array.from({ length: MAX_FALHAS_POR_LOGIN }, (_, i) => ({ user_id: `u${i}`, login: '77123456', ok: false, criado_em: agora - 1000 })), OUTRO, '77123456', agora), true)
eq('falhas antigas (fora da janela) não contam', tentativasEsgotadas(falhas(20, DONO, '77123456', JANELA_TENTATIVAS_MS + 1), DONO, '77123456', agora), false)
eq('acertos não gastam tentativas', tentativasEsgotadas(
  Array.from({ length: 20 }, () => ({ user_id: DONO, login: '77123456', ok: true, criado_em: agora - 1000 })), DONO, '77123456', agora), false)

// ── encaminhamento dos executores ───────────────────────────────────────────
eq('mtmfunded → motor simulado', destinoDeExecucao({ mt5_platform: 'mtmfunded', funded_account_id: 'acc-1' }), 'mtmfunded')
eq('mtmfunded com metaapi_account_id por engano → NUNCA metaapi', destinoDeExecucao({ mt5_platform: 'MTMFUNDED', funded_account_id: 'acc-1', metaapi_account_id: 'x' }), 'mtmfunded')
eq('mtmfunded sem conta → nada', destinoDeExecucao({ mt5_platform: 'mtmfunded', metaapi_account_id: 'x' }), null)
eq('tradelocker → tradelocker', destinoDeExecucao({ mt5_platform: 'tradelocker', tl_account_id: '9' }), 'tradelocker')
eq('mt5 → metaapi', destinoDeExecucao({ mt5_platform: 'mt5', metaapi_account_id: 'm' }), 'metaapi')
eq('semMtmFunded tira só as simuladas', semMtmFunded([{ mt5_platform: 'mt5' }, { mt5_platform: 'mtmfunded' }, { mt5_platform: null }, { mt5_platform: 'tradelocker' }]).length, 3)

// Trancas no código: os caminhos MetaApi/CopyFactory/TradeLocker filtram mtmfunded.
const RAIZ = join(__dirname, '..', '..', '..')
const ler = (f: string) => readFileSync(join(RAIZ, f), 'utf8')
const tem = (nome: string, f: string, re: RegExp) => eq(nome, re.test(ler(f)), true)
tem('T2T: withAccount só metaapi/tradelocker', 'app/api/mtmcopy/tap-to-trade/route.ts', /const withAccount = \(conns \?\? \[\]\)\.filter\(\(c\) => \{\s*const d = destinoDeExecucao\(c\)\s*return d === 'metaapi' \|\| d === 'tradelocker'/)
tem('T2T: simuladas ligadas pelo motor', 'app/api/mtmcopy/tap-to-trade/route.ts', /contasLigadas: fundedLigadas/)
tem('T2T fechar tudo: sem mtmfunded', 'app/api/mtmcopy/tap-to-trade/close-all/route.ts', /destinoDeExecucao\(c\); return d === 'metaapi' \|\| d === 'tradelocker'/)
tem('processador: getActiveConnections sem mtmfunded', 'lib/mtmcopy/db.ts', /return semMtmFunded\(\(data \?\? \[\]\) as MTMcopierConnection\[\]\)/)
tem('processador: getCopyConnections sem mtmfunded', 'lib/mtmcopy/db.ts', /const rows = semMtmFunded\(/)
tem('processador: sinal directo salta mtmfunded', 'lib/mtmcopy/processor.ts', /if \(conn\.mt5_platform === 'mtmfunded'\) return/)
tem('processador: gestão salta mtmfunded', 'lib/mtmcopy/processor.ts', /if \(conn\.mt5_platform === 'mtmfunded'\) continue/)
tem('sincronização MetaApi/CopyFactory sem mtmfunded', 'lib/mtmcopy/system-sync.ts', /const connections = semMtmFunded\(/)
tem('provisão MetaApi recusa mtmfunded', 'lib/mtmcopy/run-provision-job.ts', /=== 'mtmfunded'\) \{\s*throw new Error/)
tem('cópia funded→conta não usa ligação mtmfunded como destino', 'lib/mtmfunded/copia/elegibilidade.ts', /=== 'mtmfunded'\) continue/)
tem('ligação não grava password', 'app/api/mtmfunded/ligar-conta/route.ts', /funded_account_id: conta\.id/)
/**
 * O INTERRUPTOR POR CONTA VALE NO CAMINHO DAS LIGADAS (24/09). Sem isto, uma ligação MTM Funded
 * com o Tap to Trade desligado recebia a aceitação na mesma — foi assim que uma só aceitação do
 * dono abriu ONZE posições simuladas. E as mestres da casa (`tipo='provider'`) nunca são destino.
 */
tem('ligadas T2T respeitam o interruptor por conta', 'lib/mtmfunded/simulado/ligar-conta.ts', /\.filter\(\(c\) => recebeT2T\(/)
tem('ligadas T2T não incluem contas da casa', 'lib/mtmfunded/simulado/ligar-conta.ts', /\.filter\(\(c\) => !ehContaDaCasa\(c\)\)/)
tem('simuladas marcadas não incluem contas da casa', 'lib/mtmfunded/simulado/t2t-simulado.ts', /filter\(\(l\) => !ehContaDaCasa\(l\)\)/)
tem('pré-visualização T2T não lista contas da casa', 'app/api/mtmcopy/tap-to-trade/preview/route.ts', /if \(ehContaDaCasa\(c\)\) casa\.add\(id\)/)
tem('T2T: escolha de contas filtra os alvos', 'app/api/mtmcopy/tap-to-trade/route.ts', /aplicarEscolha\(targets, \(c\) => String\(c\.id\), escolhaReais\)/)

eq('ligação não grava password (nenhum campo password no insert)', /mt5_password|password_cifrada|password:\s*password/.test(ler('app/api/mtmfunded/ligar-conta/route.ts')), false)

console.log(`${ok} ok, ${mau} falhas`)
if (mau) process.exit(1)
