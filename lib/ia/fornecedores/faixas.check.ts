/**
 * A GUARDA DE 19/11 — o Mentor nunca mais cai com modelos grátis por usar.
 *
 *   npx tsx lib/ia/fornecedores/faixas.check.ts
 *
 * Prova, com `fetch` falso: (a) o 429 real do Groq (TPD do gpt-oss-120b) roda para o modelo
 * seguinte em vez de deitar o Groq abaixo; (b) a faixa de fundo nunca toca no 120b; (c) várias
 * chaves: esgotada a 1.ª, a 2.ª responde; (d) o OpenRouter só usa `:free`; (e) a cadeia de fundo
 * põe o Groq no fim; (f) as tarefas de crons são «fundo» e o Mentor é «interativo».
 */
import { groq, _esquecerDescobertaParaTestes as esquecerGroq } from './groq'
import { cerebras, openrouter, ordemDeModelos, tirarPensamento } from './compativel'
import { chavesDe, prioridadeDe } from '../prioridade'
import { cadeiaGratisPara } from '../chamar'
import { ErroFornecedor } from '../tipos'

let falhas = 0
function certo(c: boolean, oQue: string) {
  if (c) return
  falhas++
  console.error('  ✗ ' + oQue)
}

type Registo = { url: string; modelo: string; chave: string }
function armarFetch(fila: { status: number; body: unknown }[]): Registo[] {
  const reg: Registo[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const passo = fila.shift()
    if (!passo) throw new Error('fetch chamado mais vezes do que a fila previa')
    const corpo = init?.body ? (JSON.parse(String(init.body)) as { model?: string }) : {}
    const h = (init?.headers ?? {}) as Record<string, string>
    reg.push({ url: String(input), modelo: corpo.model ?? 'GET', chave: (h.Authorization ?? '').replace('Bearer ', '') })
    return new Response(JSON.stringify(passo.body), { status: passo.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return reg
}

const sinal = () => new AbortController().signal
const okOpenAI = (t = 'OK') => ({ choices: [{ message: { content: t } }], usage: { prompt_tokens: 3, completion_tokens: 1 } })
const tpd = {
  error: {
    message:
      'Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 198256, Requested 4311. Please try again in 18m28.944s.',
    type: 'tokens',
    code: 'rate_limit_exceeded',
  },
}
const mentor = { mensagens: [{ role: 'user' as const, content: 'Olá' }], tarefa: 'mentor' }
const cron = { mensagens: [{ role: 'user' as const, content: 'Olá' }], tarefa: 'i18n-auto' }

async function main() {
  delete process.env.GROQ_MODEL
  delete process.env.GROQ_API_KEYS

  // (f) faixas
  certo(prioridadeDe({ tarefa: 'mentor' }) === 'interativo', '(f) mentor é interativo')
  certo(prioridadeDe({ tarefa: 'i18n-auto' }) === 'fundo', '(f) i18n-auto é fundo')
  certo(prioridadeDe({ tarefa: 'mentor-teste-populacao' }) === 'fundo', '(f) teste de população é fundo')
  certo(prioridadeDe({ tarefa: 'i18n-auto', prioridade: 'interativo' }) === 'interativo', '(f) explícito ganha')
  certo(chavesDe('X', { X_API_KEY: 'a', X_API_KEYS: 'b, c,a' }).join() === 'a,b,c', '(f) chaves sem repetidos')

  // (a) Groq interativo: o 120b com TPD esgotado → roda para o seguinte e responde
  {
    esquecerGroq()
    process.env.GROQ_MODEL = 'openai/gpt-oss-120b'
    process.env.GROQ_API_KEY = 'k1'
    const reg = armarFetch([{ status: 429, body: tpd }, { status: 200, body: okOpenAI() }])
    const r = await groq.gerar(mentor, sinal())
    certo(r.texto === 'OK', '(a) responde depois de rodar')
    certo(reg[0].modelo === 'openai/gpt-oss-120b' && reg[1].modelo !== 'openai/gpt-oss-120b', `(a) rodou: ${reg.map((x) => x.modelo).join(' → ')}`)
    certo(/quota diária/.test(r.modelo), `(a) o livro diz que rodou, veio «${r.modelo}»`)
    // O 120b ficou marcado: o pedido seguinte nem o tenta.
    const reg2 = armarFetch([{ status: 200, body: okOpenAI() }])
    await groq.gerar(mentor, sinal())
    certo(reg2[0].modelo !== 'openai/gpt-oss-120b', '(a) o esgotado não volta a ser tentado no mesmo dia')
  }

  // (b) fundo nunca toca no 120b
  {
    esquecerGroq()
    const reg = armarFetch([{ status: 200, body: okOpenAI() }])
    await groq.gerar(cron, sinal())
    certo(reg[0].modelo === 'openai/gpt-oss-20b', `(b) fundo começa no 20b, foi ${reg[0].modelo}`)
    esquecerGroq()
    const reg2 = armarFetch([{ status: 429, body: tpd }, { status: 429, body: tpd }, { status: 429, body: tpd }])
    let err: unknown
    try {
      await groq.gerar(cron, sinal())
    } catch (e) {
      err = e
    }
    certo(err instanceof ErroFornecedor && err.passavel, '(b) fundo esgotado passa ao seguinte')
    certo(reg2.length === 3 && !reg2.some((x) => x.modelo === 'openai/gpt-oss-120b'), `(b) fundo: 3 pedidos e nunca o 120b (${reg2.map((x) => x.modelo).join(', ')})`)
  }

  // (c) várias chaves: a 1.ª dá 429 por minuto → a 2.ª responde
  {
    esquecerGroq()
    process.env.GROQ_API_KEYS = 'k2'
    const minuto = { error: { message: 'Rate limit reached on requests per minute (RPM): Limit 30. Please try again in 2s.' } }
    const reg = armarFetch([{ status: 429, body: minuto }, { status: 200, body: okOpenAI() }])
    const r = await groq.gerar(mentor, sinal())
    certo(r.texto === 'OK' && reg[0].chave === 'k1' && reg[1].chave === 'k2', `(c) passou à 2.ª chave (${reg.map((x) => x.chave).join(', ')})`)
    certo(/chave 2/.test(r.modelo), `(c) o livro diz a chave (índice, nunca o valor), veio «${r.modelo}»`)
    certo(!r.modelo.includes('k2'), '(c) a chave nunca aparece no livro')
    delete process.env.GROQ_API_KEYS
  }

  // (d) OpenRouter só :free
  {
    certo(ordemDeModelos(['a:free', 'b'], ['a:free', 'b', 'c:free', 'd'], (id) => id.endsWith(':free')).join() === 'a:free,c:free', '(d) só :free, descobertos incluídos')
    openrouter._esquecer()
    process.env.OPENROUTER_API_KEY = 'or'
    const reg = armarFetch([
      { status: 200, body: { data: [{ id: 'openai/gpt-4o' }, { id: 'openai/gpt-oss-120b:free' }] } },
      { status: 200, body: okOpenAI('<think>hmm</think>Olá!') },
    ])
    const r = await openrouter.gerar(mentor, sinal())
    certo(reg[1].modelo === 'openai/gpt-oss-120b:free', `(d) usou o :free, foi ${reg[1].modelo}`)
    certo(r.texto === 'Olá!', `(d) tira o <think>, veio «${r.texto}»`)
  }

  // Cerebras: quota diária roda entre modelos
  {
    cerebras._esquecer()
    process.env.CEREBRAS_API_KEY = 'cb'
    const diaria = { message: 'Tokens per day limit exceeded - too many tokens processed.' }
    const reg = armarFetch([{ status: 404, body: {} }, { status: 429, body: diaria }, { status: 200, body: okOpenAI() }])
    const r = await cerebras.gerar(mentor, sinal())
    certo(r.texto === 'OK' && reg.length === 3 && reg[1].modelo !== reg[2].modelo, `(e) cerebras rodou (${reg.map((x) => x.modelo).join(' → ')})`)
  }

  // (e) cadeia de fundo: Groq no fim (antes só do Ollama)
  {
    const fundo = cadeiaGratisPara(cron).map((f) => f.nome)
    const inter = cadeiaGratisPara(mentor).map((f) => f.nome)
    certo(inter[0] === 'groq', `(e) interativo começa no groq: ${inter.join(',')}`)
    certo(fundo.indexOf('groq') > fundo.indexOf('gemini') && fundo[0] !== 'groq', `(e) fundo empurra o groq para o fim: ${fundo.join(',')}`)
    certo(!fundo.includes('openai' as never) && !inter.includes('openai' as never), '(e) nenhuma cadeia grátis tem pagos')
  }

  certo(tirarPensamento('<think>a\nb</think>\nResposta') === 'Resposta', 'tirarPensamento')

  if (falhas) {
    console.error(`faixas: ${falhas} falha(s)`)
    process.exit(1)
  }
  console.log('faixas: o interativo roda por todos os modelos e chaves, o fundo nunca toca nos reservados, o OpenRouter só usa :free ✓')
}

main()
