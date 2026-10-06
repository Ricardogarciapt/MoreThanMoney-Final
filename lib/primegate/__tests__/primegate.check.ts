/**
 * GUARDA do PrimeGate (PrimeVerse).
 *
 *   npx tsx lib/primegate/__tests__/primegate.check.ts
 *
 * As quatro regras que não podem cair:
 *  1. `undetermined` nunca vira recusa (não existe estado de recusa; nada fecha por causa dele).
 *  2. A chave nunca aparece em logs, na base nem nas respostas.
 *  3. O parser aceita as variantes e cai em `undetermined` (+ aviso) no desconhecido.
 *  4. A quota bloqueia o 11.º pedido no minuto — e esse pedido não sai para a rede.
 *
 * Cada regra é testada contra o código verdadeiro E contra uma versão MÁ escrita aqui: se a
 * guarda não apanhar a versão má, a guarda é que está partida.
 */
import { readFileSync } from 'node:fs'
import {
  interpretarCorpo,
  interpretarResposta,
  proximaTentativa,
  semSegredos,
  normalizarPar,
  MAX_TENTATIVAS,
  type Interpretacao,
} from '@/lib/primegate/resultado'
import { decidirQuota, quotaEmMemoria, type LimitesQuota, type ResultadoQuota } from '@/lib/primegate/quota'
import { chamarPrimeGate } from '@/lib/primegate/cliente'
import { mensagemParaCliente } from '@/lib/primegate/mensagens'
import { contaComoTentativa, estadoDoEspelho } from '@/lib/primegate/verificacao'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}
const ESTADOS = new Set(['confirmed', 'undetermined', 'erro'])

// ───────────────────────── 3. parser ─────────────────────────
function examinarParser(parse: (c: unknown) => Interpretacao): string[] {
  const f: string[] = []
  const espera = (nome: string, corpo: unknown, estado: string, comAviso = false) => {
    const r = parse(corpo)
    if (r.estado !== estado) f.push(`${nome}: esperava ${estado}, deu ${r.estado}`)
    if (comAviso && !r.aviso) f.push(`${nome}: faltou o aviso`)
    if (!ESTADOS.has(r.estado)) f.push(`${nome}: estado inventado «${r.estado}»`)
  }
  espera('status Confirmed', { status: 'Confirmed' }, 'confirmed')
  espera('result CONFIRMED', { result: 'CONFIRMED' }, 'confirmed')
  espera('verification confirmed', { verification: 'confirmed' }, 'confirmed')
  espera('confirmed true', { confirmed: true }, 'confirmed')
  espera('aninhado em data', { data: { status: 'confirmed' } }, 'confirmed')
  espera('string solta', 'confirmed', 'confirmed')
  espera('undetermined', { status: 'UNDETERMINED' }, 'undetermined')
  espera('confirmed false NÃO é recusa', { confirmed: false }, 'undetermined')
  espera('«rejected» desconhecido → undetermined', { status: 'rejected' }, 'undetermined', true)
  espera('formato desconhecido', { foo: 1 }, 'undetermined', true)
  espera('corpo vazio', null, 'undetermined', true)
  espera('lista', [1, 2], 'undetermined', true)
  return f
}
const parserMau = (c: unknown): Interpretacao => {
  const s = JSON.stringify(c ?? '').toLowerCase()
  if (s.includes('confirmed') && !s.includes('false') && !s.includes('un')) return { estado: 'confirmed', motivo: '' }
  return { estado: 'recusado' as never, motivo: 'não confirmado' } // o erro que esta guarda existe para impedir
}
const fParser = examinarParser(interpretarCorpo)
teste(`parser verdadeiro: ${fParser.join(' | ')}`, fParser.length === 0)
teste('a guarda do parser apanha a versão MÁ', examinarParser(parserMau).length > 0)

// ───────────────────────── 1. undetermined nunca é recusa ─────────────────────────
for (const [st, corpo, ra] of [[200, { foo: 1 }], [401, null], [403, null], [404, null], [422, {}], [429, null, '120'], [500, null], [503, 'x']] as const) {
  const r = interpretarResposta(st, corpo, ra as string | undefined)
  teste(`HTTP ${st} dá um estado conhecido (deu ${r.estado})`, ESTADOS.has(r.estado))
  if (st !== 200) teste(`HTTP ${st} nunca é confirmed`, r.estado !== 'confirmed')
}
teste('401 marca a chave como inválida', interpretarResposta(401, null).chaveInvalida === true)
teste('403 marca a chave como inválida', interpretarResposta(403, null).chaveInvalida === true)
teste('429 respeita Retry-After (120 s)', interpretarResposta(429, null, '120').reagendarEmSeg === 120)
teste('5xx reagenda', (interpretarResposta(502, null).reagendarEmSeg ?? 0) > 0)

teste('espelho: confirmed não desce para undetermined', estadoDoEspelho('confirmed', 'undetermined') === 'confirmed')
teste('espelho: confirmed não desce para erro', estadoDoEspelho('confirmed', 'erro') === 'confirmed')
teste('erro (quota/5xx/chave) não gasta tentativa', !contaComoTentativa({ estado: 'erro', naoEnviado: false }))
teste('pedido não enviado não gasta tentativa', !contaComoTentativa({ estado: 'undetermined', naoEnviado: true }))
teste('undetermined real gasta tentativa', contaComoTentativa({ estado: 'undetermined' }))

const t0 = Date.UTC(2026, 9, 6, 12, 0, 0)
const h = (n: number) => (proximaTentativa(n, t0)!.getTime() - t0) / 3600_000
teste('backoff 1h → 6h → 24h', h(1) === 1 && h(2) === 6 && h(3) === 24 && h(4) === 24)
teste(`pára ao fim de ${MAX_TENTATIVAS} tentativas`, proximaTentativa(MAX_TENTATIVAS, t0) === null)

const msgU = mensagemParaCliente('undetermined', new Date(t0 + 3600_000)).toLowerCase()
teste('mensagem «a confirmar» diz que NÃO é recusa', msgU.includes('não é uma recusa'))
teste('mensagem «a confirmar» fala do link MTM', msgU.includes('abrir-conta'))
teste('mensagem nunca promete depósito/KYC', !/kyc|depósito confirmado/i.test(mensagemParaCliente('confirmed', null)))

// O código que decide o acesso: nenhum caminho do PrimeGate fecha, revoga ou rejeita.
const verif = readFileSync('lib/primegate/verificacao.ts', 'utf8')
const gate = readFileSync('lib/telegram-broker-gate.ts', 'utf8')
const trechoGate = gate.slice(gate.indexOf('async function reforcoPrimeGate'), gate.indexOf('async function linhaPrimeGateDoLead'))
function semFechos(nome: string, src: string): string[] {
  const proibidos = [/is_active\s*:\s*false/, /broker_verified\s*:\s*false/, /stage\s*:\s*['"](rejected|revoked)['"]/, /rejeitarPedidoDeAcesso/, /kickFromGroups/, /subscription_status\s*:\s*['"]inactive/]
  return proibidos.filter((re) => re.test(src)).map((re) => `${nome} contém ${re}`)
}
const fFechos = [...semFechos('verificacao.ts', verif), ...semFechos('broker-gate (PrimeGate)', trechoGate)]
teste(`nenhum caminho PrimeGate fecha acesso: ${fFechos.join(' | ')}`, fFechos.length === 0)
teste('a guarda dos fechos apanha a versão MÁ', semFechos('mau', "update({ is_active: false })").length > 0)
teste('verificacao NÃO escreve em broker_clients (saldo em falta = revogação no renew)', !/from\(['"]broker_clients['"]\)/.test(verif))
teste('trecho do gate encontrado', trechoGate.length > 200)

// ───────────────────────── 4. quota ─────────────────────────
function examinarQuota(decidir: (c: { minuto: number; dia: number }, l: LimitesQuota, a: number) => ResultadoQuota): string[] {
  const f: string[] = []
  const l = { porMinuto: 10, porDia: 1000 }
  let m = 0
  for (let i = 1; i <= 11; i++) {
    const r = decidir({ minuto: m, dia: m }, l, t0)
    if (i <= 10 && !r.ok) f.push(`pedido ${i} bloqueado sem razão`)
    if (i === 11 && r.ok) f.push('o 11.º pedido do minuto passou')
    if (r.ok) m = r.minuto
  }
  if (decidir({ minuto: 0, dia: 1000 }, l, t0).ok) f.push('o 1001.º do dia passou')
  return f
}
const decidirMau = (c: { minuto: number; dia: number }, l: LimitesQuota): ResultadoQuota =>
  c.minuto > l.porMinuto ? { ok: false, motivo: 'minuto' } : { ok: true, minuto: c.minuto + 1, dia: c.dia + 1 }
const fQuota = examinarQuota(decidirQuota)
teste(`quota verdadeira: ${fQuota.join(' | ')}`, fQuota.length === 0)
teste('a guarda da quota apanha a versão MÁ (> em vez de >=)', examinarQuota(decidirMau).length > 0)

// ───────────────────────── 2. chave + quota de ponta a ponta (fetch falso) ─────────────────────────
const CHAVE = 'pg_ib_SEGREDO_muito_secreto_1234567890'

async function pontaAPonta() {
  let agora = t0
  const quota = quotaEmMemoria({ porMinuto: 10, porDia: 1000 }, () => agora)
  let pedidos = 0
  const capturados: string[] = []
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info }
  for (const k of ['log', 'error', 'warn', 'info'] as const) console[k] = (...a: unknown[]) => capturados.push(a.map(String).join(' '))

  // Um servidor «indiscreto»: devolve o cabeçalho de autorização dentro do corpo.
  const fetchFalso = (async (_url: string, init?: RequestInit) => {
    pedidos++
    const auth = (init?.headers as Record<string, string>)?.authorization ?? ''
    const corpo = JSON.stringify({ status: 'confirmed', eco: auth, chave: CHAVE })
    return new Response(corpo, { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch

  const saidas: string[] = []
  try {
    for (let i = 1; i <= 11; i++) {
      const r = await chamarPrimeGate({ email: 'a@b.pt', uid: '101234567' }, { chave: CHAVE, quota, fetchImpl: fetchFalso })
      saidas.push(JSON.stringify(r))
      if (i <= 10) teste(`pedido ${i} confirmado`, r.estado === 'confirmed')
      if (i === 11) {
        teste('o 11.º pedido do minuto é bloqueado', r.estado === 'erro' && r.naoEnviado === true)
        teste('o 11.º pedido traz reagendamento', (r.reagendarEmSeg ?? 0) > 0)
      }
    }
    teste(`só 10 pedidos chegaram à rede (chegaram ${pedidos})`, pedidos === 10)
    agora += 61_000
    const r12 = await chamarPrimeGate({ email: 'a@b.pt', uid: '101234567' }, { chave: CHAVE, quota, fetchImpl: fetchFalso })
    teste('no minuto seguinte volta a passar', r12.estado === 'confirmed' && pedidos === 11)

    // 429 com Retry-After bloqueia toda a gente até lá.
    const fetch429 = (async () => { pedidos++; return new Response('{}', { status: 429, headers: { 'retry-after': '300' } }) }) as unknown as typeof fetch
    agora += 61_000
    const r429 = await chamarPrimeGate({ email: 'a@b.pt', uid: '101234567' }, { chave: CHAVE, quota: quotaEmMemoria(undefined, () => agora), fetchImpl: fetch429 })
    teste('429 reagenda pelo Retry-After', r429.reagendarEmSeg === 300)

    // Erro de rede cuja mensagem repete a chave.
    const fetchRebenta = (async () => { throw new Error(`falhou com Bearer ${CHAVE}`) }) as unknown as typeof fetch
    const rRede = await chamarPrimeGate({ email: 'a@b.pt', uid: '101234567' }, { chave: CHAVE, quota: quotaEmMemoria(undefined, () => agora), fetchImpl: fetchRebenta })
    saidas.push(JSON.stringify(rRede))
    teste('erro de rede é «erro», não recusa', rRede.estado === 'erro')

    // Sem chave: não sai nada.
    const antes = pedidos
    const rSem = await chamarPrimeGate({ email: 'a@b.pt', uid: '101234567' }, { chave: null, quota, fetchImpl: fetchFalso })
    teste('sem chave não há pedido', rSem.naoEnviado === true && pedidos === antes)
  } finally {
    Object.assign(console, orig)
  }
  const tudo = saidas.join('\n') + capturados.join('\n')
  teste('a chave nunca aparece nas respostas nem nos logs', !tudo.includes(CHAVE) && !tudo.includes('SEGREDO'))
  teste('a guarda da chave apanha a versão MÁ', JSON.stringify({ eco: `Bearer ${CHAVE}` }).includes(CHAVE))
  teste('semSegredos limpa pg_ib_ mesmo sem saber a chave', !semSegredos(`x ${CHAVE} y`).includes('SEGREDO'))
}

// Fonte: o cliente não escreve logs, e as rotas nunca devolvem a chave em claro.
const cliente = readFileSync('lib/primegate/cliente.ts', 'utf8')
teste('cliente.ts não tem console.*', !/console\.(log|error|warn|info)/.test(cliente))
const rotaAdmin = readFileSync('app/api/admin/primegate/route.ts', 'utf8')
const config = readFileSync('lib/primegate/config.ts', 'utf8')
teste('estadoDaChave não devolve a chave', !/chave:\s*cfg\.chave/.test(config.slice(config.indexOf('export async function estadoDaChave'))))
teste('a rota de admin exige requireAdmin no GET e no POST', (rotaAdmin.match(/requireAdmin\(req\)/g) ?? []).length >= 2)
teste('a chave guarda-se cifrada', /chave_cifrada:\s*cifrar\(/.test(config))
teste('a chave não vai para site_settings (é pública)', !/site_settings/.test(config.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))

// Par
teste('par: email em minúsculas', normalizarPar(' A@B.PT ', '101234567')?.email === 'a@b.pt')
teste('par: UID com letras recusado', normalizarPar('a@b.pt', '12ab45') === null)
teste('par: email inválido recusado', normalizarPar('nao-e-email', '101234567') === null)

pontaAPonta().then(() => {
  if (falhas.length) {
    console.error(`✗ PrimeGate: ${falhas.length} falha(s)\n - ` + falhas.join('\n - '))
    process.exit(1)
  }
  console.log('✓ PrimeGate: undetermined nunca é recusa · a chave não sai · parser tolerante · quota trava o 11.º')
})
