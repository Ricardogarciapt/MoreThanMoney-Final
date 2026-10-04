/**
 * A GUARDA DA ROTAÇÃO POR QUOTA DIÁRIA DO GEMINI.
 *
 *   npx tsx lib/ia/fornecedores/rotacao-quota.check.ts
 *
 * O facto de 04/10/2026: o grátis do Gemini dá 20 pedidos/dia POR MODELO. Esgotado um, os outros
 * da mesma chave respondem. Esta guarda prova, com um `fetch` falso e contado, que um 429 DIÁRIO
 * roda para o modelo seguinte (e fica marcado), que um 429 POR MINUTO não roda (rodar gastava a
 * quota de todos), que há um tecto de 3 modelos por pedido, e que o 404 de nome morto continua a
 * funcionar como antes — e tira o nome da rotação.
 */
import { gemini, _definirRelogioParaTestes as definirRelogio, _esquecerDescobertaParaTestes as esquecerGemini } from './gemini'
import { MarcasDeQuota, candidatos, ehErroDeQuotaDiaria, horasDeEspera } from './rotacao-quota'
import { resumirErro } from './comum'
import { ErroFornecedor } from '../tipos'

let falhas = 0
function certo(c: boolean, oQue: string) {
  if (c) return
  falhas++
  console.error('  ✗ ' + oQue)
}

process.env.GEMINI_API_KEY = 'AQ.teste'
delete process.env.GEMINI_MODEL

type Passo = { status: number; body: unknown }
type Registo = { url: string; modelo: string }

/** Um `fetch` que responde pela ordem da fila e regista o modelo de cada pedido. */
function armarFetch(fila: Passo[]): Registo[] {
  const registo: Registo[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const passo = fila.shift()
    if (!passo) throw new Error('fetch chamado mais vezes do que a fila previa')
    const url = String(input)
    registo.push({ url, modelo: /models\/([^:]+):generateContent/.exec(url)?.[1] ?? '?' })
    return new Response(JSON.stringify(passo.body), { status: passo.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return registo
}

const pedido = { mensagens: [{ role: 'user' as const, content: 'Diz OK.' }], tarefa: 'teste' }
const sinal = () => new AbortController().signal
const ok = { candidates: [{ content: { parts: [{ text: 'OK' }] } }] }
/**
 * O corpo REAL do 429 diário do Google (capturado a 04/10/2026). Repara: a mensagem tem 411
 * caracteres, a métrica no texto NÃO diz «per_day», e o «retry in 3h45m» vem no fim — depois do
 * corte aos 300 do `resumirErro`. A pista diária fiável está em `details` (quotaId + retryDelay).
 * A primeira versão da rotação não rodava na vida real por causa disto; a guarda usa o corpo real
 * para isso não voltar.
 */
const diario = {
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    message:
      'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash\nPlease retry in 3h45m59.973172832s.',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.Help', links: [{ description: 'Learn more about Gemini API quotas', url: 'https://ai.google.dev/gemini-api/docs/rate-limits' }] },
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaDimensions: { location: 'global', model: 'gemini-3.8-flash' }, quotaValue: '20' }],
      },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '13559s' },
    ],
  },
}
/** O pico por minuto, na mesma forma (quotaId PerMinute e retryDelay curto). */
const porMinuto = {
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    message:
      'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests_per_minute, limit: 5, model: gemini-3.8-flash\nPlease retry in 36.512s.',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaValue: '5' }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '36.512s' },
    ],
  },
}
const morto404 = {
  error: {
    code: 404,
    message: 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements.',
  },
}

async function tentar(): Promise<unknown> {
  try {
    await gemini.gerar(pedido, sinal())
    return null
  } catch (e) {
    return e
  }
}

async function main() {
  // ─── Unidades puras ──────────────────────────────────────────────────────────────────────
  // O resumo do corpo real: cortado aos 300 MAS com a cauda dos `details` intacta.
  const resumoDiario = resumirErro(JSON.stringify(diario))
  certo(/quota: GenerateRequestsPerDayPerProjectPerModel-FreeTier/.test(resumoDiario), `resumirErro traz o quotaId dos details, veio «${resumoDiario.slice(-120)}»`)
  certo(/retry in 3h46m/.test(resumoDiario), `resumirErro converte retryDelay 13559s em «retry in 3h46m», veio «${resumoDiario.slice(-60)}»`)
  certo(resumoDiario.length < 420, 'resumirErro continua a cortar a mensagem longa')
  const resumoMinuto = resumirErro(JSON.stringify(porMinuto))
  certo(/PerMinute/.test(resumoMinuto) && /retry in 37s/.test(resumoMinuto), `resumirErro no pico: PerMinute + «retry in 37s», veio «${resumoMinuto.slice(-80)}»`)
  certo(resumirErro('{"error":{"message":"x"}}') === 'x' && resumirErro('texto solto') === 'texto solto', 'resumirErro sem details fica como era')

  certo(ehErroDeQuotaDiaria(new ErroFornecedor('gemini', `429 ${resumoDiario}`, true, 429)), 'o resumo REAL (truncado) do tecto diário é quota diária')
  certo(ehErroDeQuotaDiaria(new ErroFornecedor('gemini', `429 ${diario.error.message}`, true, 429)), 'a mensagem inteira também (retry in 3h…)')
  certo(!ehErroDeQuotaDiaria(new ErroFornecedor('gemini', `429 ${resumoMinuto}`, true, 429)), 'o resumo do pico por minuto NÃO é')
  certo(Math.abs(horasDeEspera(resumoDiario) - (3 + 46 / 60)) < 1e-9, 'lê as horas da cauda real')
  certo(ehErroDeQuotaDiaria(new ErroFornecedor('gemini', '429 daily limit reached, retry in 8h', true, 429)), '«daily … retry in 8h» é diária')
  certo(!ehErroDeQuotaDiaria(new ErroFornecedor('gemini', '429 rate limit, retry in 12s', true, 429)), '«retry in 12s» é ritmo, não diária')
  certo(!ehErroDeQuotaDiaria(new ErroFornecedor('gemini', '500 PerDay something', true, 500)), 'um 500 nunca é quota, mesmo com a palavra')
  certo(!ehErroDeQuotaDiaria(new Error('PerDay')), 'um Error vulgar não é')
  certo(horasDeEspera('Please retry in 10h.') === 10, 'lê «retry in 10h»')
  certo(Math.abs(horasDeEspera('retry in 9h30m') - 9.5) < 1e-9, 'lê «9h30m»')
  certo(horasDeEspera('retry in 2.5h') === 2.5, 'lê «2.5h»')
  certo(horasDeEspera('sem hora') === 10, 'sem hora → 10 h por omissão')

  {
    let t = 0
    const marcas = new MarcasDeQuota(() => t)
    marcas.marcar('a', 1)
    certo(marcas.esgotado('a'), 'marcado fica esgotado')
    t = 3_600_000 - 1
    certo(marcas.esgotado('a'), 'ainda esgotado um instante antes')
    t = 3_600_000
    certo(!marcas.esgotado('a'), 'à hora certa a marca expira')
    certo(candidatos('x', ['y', 'x', 'z'], new Set(['y']), marcas).join(',') === 'x,z', 'candidatos: sem repetidos, sem mortos')
    marcas.marcar('z', 1)
    certo(candidatos('x', ['y', 'z'], new Set(), marcas).join(',') === 'x,y', 'candidatos: sem esgotados')
  }

  // ─── (a) 429 diário no 1.º → responde o 2.º, 2 pedidos ───────────────────────────────────
  {
    esquecerGemini()
    const reg = armarFetch([{ status: 429, body: diario }, { status: 200, body: ok }])
    const r = await gemini.gerar(pedido, sinal())
    certo(r.texto === 'OK', '(a) responde depois de rodar')
    certo(reg.length === 2, `(a) 2 pedidos, foram ${reg.length}`)
    certo(reg[0].modelo === 'gemini-3.8-flash' && reg[1].modelo === 'gemini-3.7-flash', `(a) 3.8 → 3.7, foi ${reg.map((x) => x.modelo).join(' → ')}`)
    certo(r.modelo.startsWith('gemini-3.7-flash (rodado: gemini-3.8-flash'), `(a) o livro fica a saber que rodou, veio «${r.modelo}»`)

    // ─── (e) o esgotado fica marcado: o pedido seguinte vai DIRECTO ao 2.º, 1 pedido ────────
    const reg2 = armarFetch([{ status: 200, body: ok }])
    const r2 = await gemini.gerar(pedido, sinal())
    certo(reg2.length === 1 && reg2[0].modelo === 'gemini-3.7-flash', `(e) a seguir vai directo ao 3.7, foi ${reg2.map((x) => x.modelo).join(',')}`)
    certo(r2.modelo === 'gemini-3.7-flash', '(e) sem rótulo de rotação, porque não rodou nada neste pedido')
  }

  // ─── (b) 429 diário no 1.º e no 2.º → responde o 3.º, 3 pedidos ──────────────────────────
  {
    esquecerGemini()
    const reg = armarFetch([{ status: 429, body: diario }, { status: 429, body: diario }, { status: 200, body: ok }])
    const r = await gemini.gerar(pedido, sinal())
    certo(r.texto === 'OK' && reg.length === 3, `(b) 3 pedidos e responde, foram ${reg.length}`)
    certo(reg[2].modelo === 'gemini-3.6-flash', `(b) o 3.º é o 3.6, foi ${reg[2]?.modelo}`)
    certo(/rodado: gemini-3\.8-flash, gemini-3\.7-flash/.test(r.modelo), `(b) nomeia os dois esgotados, veio «${r.modelo}»`)
  }

  // ─── (c) 429 diário em 3 → rebenta passável SEM 4.º pedido ───────────────────────────────
  {
    esquecerGemini()
    const reg = armarFetch([{ status: 429, body: diario }, { status: 429, body: diario }, { status: 429, body: diario }])
    const err = await tentar()
    certo(err instanceof ErroFornecedor && err.passavel && err.status === 429, '(c) rebenta passável com 429')
    certo(reg.length === 3, `(c) exactamente 3 pedidos, foram ${reg.length}`)
    certo(err instanceof ErroFornecedor && /não se tenta um 4\.º/.test(err.message), `(c) a mensagem diz que parou no tecto, veio «${err instanceof Error ? err.message.slice(-120) : ''}»`)
    // E os 3 ficaram marcados: o pedido seguinte vai directo ao 4.º da lista, 1 pedido.
    const reg2 = armarFetch([{ status: 200, body: ok }])
    await gemini.gerar(pedido, sinal())
    certo(reg2.length === 1 && reg2[0].modelo === 'gemini-3.5-flash-lite', `(c) a seguir vai directo ao 3.5-flash-lite, foi ${reg2[0]?.modelo}`)
  }

  // ─── (d) 429 POR MINUTO → NÃO roda, 1 pedido, erro passável ──────────────────────────────
  {
    esquecerGemini()
    const reg = armarFetch([{ status: 429, body: porMinuto }])
    const err = await tentar()
    certo(err instanceof ErroFornecedor && err.passavel && err.status === 429, '(d) 429 por minuto rebenta passável')
    certo(reg.length === 1, `(d) UM pedido só — rodar por segundos gastava a quota diária de todos, foram ${reg.length}`)
    // E não marcou nada: o pedido seguinte volta ao 3.8.
    const reg2 = armarFetch([{ status: 200, body: ok }])
    await gemini.gerar(pedido, sinal())
    certo(reg2[0]?.modelo === 'gemini-3.8-flash', '(d) o pico não deixa marca: a seguir tenta o 3.8 outra vez')
  }

  // ─── (f) a marca expira à hora que o erro disse (3h46m no corpo real) → volta ao 1.º ─────
  {
    esquecerGemini()
    let t = 1_000_000
    definirRelogio(() => t)
    armarFetch([{ status: 429, body: diario }, { status: 200, body: ok }])
    await gemini.gerar(pedido, sinal())
    t += 3 * 3_600_000 + 45 * 60_000
    const regAntes = armarFetch([{ status: 200, body: ok }])
    await gemini.gerar(pedido, sinal())
    certo(regAntes[0]?.modelo === 'gemini-3.7-flash', `(f) aos 3h45m ainda evita o 3.8, foi ${regAntes[0]?.modelo}`)
    t += 2 * 60_000
    const regDepois = armarFetch([{ status: 200, body: ok }])
    await gemini.gerar(pedido, sinal())
    certo(regDepois[0]?.modelo === 'gemini-3.8-flash', `(f) passados os 3h46m volta ao 3.8, foi ${regDepois[0]?.modelo}`)
    definirRelogio(() => Date.now())
  }

  // ─── (g) 404 de nome morto: como antes, e o nome sai da rotação ──────────────────────────
  {
    esquecerGemini()
    process.env.GEMINI_MODEL = 'gemini-2.5-flash'
    const reg = armarFetch([{ status: 404, body: morto404 }, { status: 200, body: ok }])
    const r = await gemini.gerar(pedido, sinal())
    certo(reg.length === 2 && reg[1].modelo === 'gemini-3.8-flash', '(g) 404 → repete com o sugerido, 2 pedidos')
    certo(r.modelo.startsWith('gemini-3.8-flash (descoberto'), '(g) rótulo de descoberta intacto')
    delete process.env.GEMINI_MODEL

    // Um nome da rotação que morre (sem sugestão) rebenta como antes, 1 pedido…
    esquecerGemini()
    const reg404 = armarFetch([{ status: 429, body: diario }, { status: 404, body: { error: { message: 'models/gemini-3.7-flash is not found for API version v1beta' } } }])
    const err = await tentar()
    certo(err instanceof ErroFornecedor && err.passavel && /não sugeriu/.test(err.message), '(g) 404 sem sugestão não inventa nem roda')
    certo(reg404.length === 2, `(g) e não gasta mais pedidos, foram ${reg404.length}`)
    // …e no pedido seguinte já não está na lista: 3.8 esgotado + 3.7 morto → vai ao 3.6.
    const reg3 = armarFetch([{ status: 200, body: ok }])
    await gemini.gerar(pedido, sinal())
    certo(reg3[0]?.modelo === 'gemini-3.6-flash', `(g) o morto saiu da rotação: foi ao ${reg3[0]?.modelo}`)
  }

  if (falhas) {
    console.error(`rotacao-quota: ${falhas} falha(s)`)
    process.exit(1)
  }
  console.log('rotacao-quota: um 429 diário roda de modelo, um 429 por minuto não, e nunca mais de 3 modelos por pedido ✓')
}

void main()
