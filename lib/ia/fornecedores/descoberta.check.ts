/**
 * A GUARDA DA DESCOBERTA DE MODELOS.
 *
 *   npx tsx lib/ia/fornecedores/descoberta.check.ts
 *
 * O defeito de 04/10/2026 não era chave, crédito nem rede: eram dois NOMES de modelo que ficaram
 * velhos e deitaram abaixo os dois fornecedores grátis de uma vez. Esta guarda prova, com um
 * `fetch` falso e contado, que o fornecedor se cura sozinho — e, mais importante, os casos em que
 * NÃO PODE tentar curar-se, porque trocar de modelo esconderia a causa real.
 */
import { gemini, _esquecerDescobertaParaTestes as esquecerGemini } from './gemini'
import { groq, _esquecerDescobertaParaTestes as esquecerGroq } from './groq'
import { ehErroDeModelo, escolherModeloDaLista, modeloSugeridoNoErro } from './descoberta'
import { ErroFornecedor } from '../tipos'

let falhas = 0
function certo(c: boolean, oQue: string) {
  if (c) return
  falhas++
  console.error('  ✗ ' + oQue)
}

process.env.GROQ_API_KEY = 'gsk_teste'
process.env.GEMINI_API_KEY = 'AQ.teste'
delete process.env.GROQ_MODEL
delete process.env.GEMINI_MODEL

type Passo = { status: number; body: unknown }
type Registo = { url: string; method: string; body?: Record<string, unknown> }

/** Um `fetch` que responde pela ordem da fila e regista o que lhe pediram. */
function armarFetch(fila: Passo[]): Registo[] {
  const registo: Registo[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const passo = fila.shift()
    if (!passo) throw new Error('fetch chamado mais vezes do que a fila previa')
    registo.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    })
    return new Response(JSON.stringify(passo.body), { status: passo.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return registo
}

const pedido = { mensagens: [{ role: 'user' as const, content: 'Diz OK.' }], tarefa: 'teste' }
const sinal = () => new AbortController().signal
const okGroq = { choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }
const okGemini = { candidates: [{ content: { parts: [{ text: 'OK' }] } }] }
const groq404 = { error: { message: 'The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.', code: 'model_not_found' } }
const listaGroq = { data: [{ id: 'whisper-large-v3' }, { id: 'llama-guard-3-8b' }, { id: 'llama-3.1-8b-instant' }, { id: 'openai/gpt-oss-120b' }] }
const gemini404 = {
  error: {
    code: 404,
    message:
      'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you to use the Interactions API.',
  },
}

async function main() {
  // ─── Unidades puras ──────────────────────────────────────────────────────────────────────
  certo(ehErroDeModelo(new ErroFornecedor('groq', '404 The model x does not exist', true, 404)), '404 é erro de modelo')
  certo(ehErroDeModelo(new ErroFornecedor('groq', '400 model foo decommissioned', true, 400)), '400 com texto de modelo morto também')
  certo(!ehErroDeModelo(new ErroFornecedor('groq', '401 Invalid API Key', true, 401)), 'um 401 NÃO é erro de modelo')
  certo(!ehErroDeModelo(new ErroFornecedor('groq', '429 rate limit', true, 429)), 'um 429 NÃO é erro de modelo')
  certo(!ehErroDeModelo(new Error('qualquer coisa')), 'um Error vulgar não é')

  certo(modeloSugeridoNoErro(gemini404.error.message) === 'gemini-3.8-flash', 'lê o substituto da frase real do Google')
  certo(modeloSugeridoNoErro('model gone, sorry') === null, 'sem sugestão → null, não se inventa')

  const ids = listaGroq.data.map((x) => x.id)
  certo(escolherModeloDaLista(ids, 'llama-3.3-70b-versatile', false) === 'llama-3.1-8b-instant', 'prefere a família configurada (llama) ao gpt-oss')
  certo(escolherModeloDaLista(['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], 'llama-3.3-70b-versatile', true) === 'openai/gpt-oss-20b', 'em rápido escolhe o pequeno')
  certo(escolherModeloDaLista(['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], 'llama-3.3-70b-versatile', false) === 'openai/gpt-oss-120b', 'em qualidade escolhe o grande')
  certo(escolherModeloDaLista(['whisper-large-v3', 'llama-guard-3-8b', 'playai-tts'], 'llama-3.3-70b-versatile', false) === null, 'só áudio/guard → null')
  certo(escolherModeloDaLista([], 'x', false) === null, 'lista vazia → null')

  // ─── Groq: nome morto → descobre → repete UMA vez → guarda ───────────────────────────────
  {
    esquecerGroq()
    const reg = armarFetch([{ status: 404, body: groq404 }, { status: 200, body: listaGroq }, { status: 200, body: okGroq }])
    const r = await groq.gerar(pedido, sinal())
    certo(r.texto === 'OK', 'groq: responde depois de descobrir')
    certo(r.modelo.startsWith('llama-3.1-8b-instant (descoberto'), `groq: diz que descobriu, veio «${r.modelo}»`)
    certo(reg.length === 3, `groq: 3 pedidos (chat, lista, chat), foram ${reg.length}`)
    certo(reg[1].method === 'GET' && reg[1].url.endsWith('/models'), 'groq: o 2.º pedido é a lista de modelos')
    certo(reg[2].body?.model === 'llama-3.1-8b-instant', 'groq: repete com o descoberto')

    // O processo lembra-se: o pedido seguinte vai DIRECTO ao descoberto, sem nova volta.
    const reg2 = armarFetch([{ status: 200, body: okGroq }])
    const r2 = await groq.gerar(pedido, sinal())
    certo(reg2.length === 1 && reg2[0].body?.model === 'llama-3.1-8b-instant', 'groq: a seguir usa o descoberto à primeira')
    certo(r2.modelo === 'llama-3.1-8b-instant', 'groq: e sem rótulo de descoberta, porque já não descobriu nada')
  }

  // ─── Groq: a lista só traz áudio/guard → rebenta passável, SEM 3.º pedido ────────────────
  {
    esquecerGroq()
    const reg = armarFetch([{ status: 404, body: groq404 }, { status: 200, body: { data: [{ id: 'whisper-large-v3' }, { id: 'llama-guard-3-8b' }] } }])
    let err: unknown
    try {
      await groq.gerar(pedido, sinal())
    } catch (e) {
      err = e
    }
    certo(err instanceof ErroFornecedor && err.passavel, 'groq: sem alternativa → ErroFornecedor passável')
    certo(err instanceof ErroFornecedor && /não trouxe nenhum/.test(err.message), 'groq: a mensagem diz que a lista não servia')
    certo(reg.length === 2, 'groq: não tenta um 3.º pedido às cegas')
  }

  // ─── Groq: 401 NÃO dispara descoberta ────────────────────────────────────────────────────
  {
    esquecerGroq()
    const reg = armarFetch([{ status: 401, body: { error: { message: 'Invalid API Key' } } }])
    let err: unknown
    try {
      await groq.gerar(pedido, sinal())
    } catch (e) {
      err = e
    }
    certo(err instanceof ErroFornecedor && err.status === 401, 'groq: 401 rebenta tal e qual')
    certo(reg.length === 1, 'groq: com 401 NÃO pede a lista — trocar de modelo não cura uma chave inválida')
  }

  // ─── Groq: o descoberto também morre → o erro passa, não entra em ciclo ──────────────────
  {
    esquecerGroq()
    const reg = armarFetch([{ status: 404, body: groq404 }, { status: 200, body: listaGroq }, { status: 404, body: groq404 }])
    let err: unknown
    try {
      await groq.gerar(pedido, sinal())
    } catch (e) {
      err = e
    }
    certo(err instanceof ErroFornecedor && err.passavel, 'groq: se o descoberto falhar, passa ao seguinte')
    certo(reg.length === 3, 'groq: exactamente UMA repetição, nunca um ciclo')
  }

  // ─── Gemini: a frase do Google diz o substituto → repete com ele ─────────────────────────
  // O cenário REAL de 04/10: o configurado era o 2.5 e o erro sugeriu o 3.8. (Se o configurado
  // já fosse o 3.8, o código recusa — e bem — «descobrir» o mesmo nome que acabou de falhar.)
  {
    esquecerGemini()
    process.env.GEMINI_MODEL = 'gemini-2.5-flash'
    const reg = armarFetch([{ status: 404, body: gemini404 }, { status: 200, body: okGemini }])
    const r = await gemini.gerar(pedido, sinal())
    certo(r.texto === 'OK', 'gemini: responde com o substituto')
    certo(reg.length === 2 && /gemini-3\.8-flash:generateContent/.test(reg[1].url), 'gemini: repete com o nome que o erro sugeriu')
    certo(r.modelo.startsWith('gemini-3.8-flash (descoberto'), 'gemini: diz que descobriu')
    const reg2 = armarFetch([{ status: 200, body: okGemini }])
    await gemini.gerar(pedido, sinal())
    certo(reg2.length === 1 && /gemini-3\.8-flash/.test(reg2[0].url), 'gemini: a seguir vai directo ao descoberto')
    delete process.env.GEMINI_MODEL
  }

  // ─── Gemini: o erro sugere o MESMO nome que falhou → não entra em ciclo ──────────────────
  {
    esquecerGemini()
    const reg = armarFetch([{ status: 404, body: gemini404 }]) // configurado = 3.8, sugerido = 3.8
    let err: unknown
    try {
      await gemini.gerar(pedido, sinal())
    } catch (e) {
      err = e
    }
    certo(err instanceof ErroFornecedor && err.passavel, 'gemini: sugestão igual ao que falhou → passa ao seguinte')
    certo(reg.length === 1, 'gemini: e não repete o mesmo pedido')
  }

  // ─── Gemini: 404 sem sugestão → rebenta passável, sem repetir ────────────────────────────
  {
    esquecerGemini()
    const reg = armarFetch([{ status: 404, body: { error: { message: 'models/x is not found for API version v1beta' } } }])
    let err: unknown
    try {
      await gemini.gerar(pedido, sinal())
    } catch (e) {
      err = e
    }
    certo(err instanceof ErroFornecedor && err.passavel && /não sugeriu/.test(err.message), 'gemini: sem sugestão não inventa')
    certo(reg.length === 1, 'gemini: e não repete')
  }

  if (falhas) {
    console.error(`descoberta: ${falhas} falha(s)`)
    process.exit(1)
  }
  console.log('descoberta: um nome de modelo morto já não deita abaixo um fornecedor com chave válida ✓')
}

void main()
