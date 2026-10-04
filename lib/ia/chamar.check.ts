/**
 * GUARDA da cadeia de IA — prova o CASO MAU com fornecedores FALSOS.
 *
 * O que esta casa não aceita: uma reserva que esconda um bug, ou um texto inventado a fingir que
 * é IA. Cada teste aqui é um desses casos.
 *
 *   npx tsx lib/ia/chamar.check.ts
 */
import { executarCadeia } from './chamar'
import type { LinhaLivro } from './livro'
import { ErroFornecedor, ErroIA, type Fornecedor, type GeracaoFornecedor } from './tipos'

let ok = 0
let ko = 0
function t(nome: string, cond: boolean, detalhe = '') {
  if (cond) ok++
  else {
    ko++
    console.log(`  ✗ ${nome}${detalhe ? `\n      ${detalhe}` : ''}`)
  }
}

function falso(nome: Fornecedor['nome'], opts: { chave?: boolean; visao?: boolean; gerar: Fornecedor['gerar'] }): Fornecedor {
  return {
    nome,
    suportaImagens: opts.visao ?? false,
    timeoutMs: 1_000,
    disponivel: () => opts.chave ?? true,
    gerar: opts.gerar,
  }
}
const responde = (texto: string, modelo = 'falso-1'): Fornecedor['gerar'] => async () => ({ texto, modelo, custoCents: 0 }) as GeracaoFornecedor
const falha = (nome: string, msg: string, passavel: boolean, status?: number): Fornecedor['gerar'] => async () => {
  throw new ErroFornecedor(nome, msg, passavel, status)
}
const livroMudo = async () => {}
const pedido = { mensagens: [{ role: 'user' as const, content: 'olá' }], tarefa: 'guarda' }

async function main() {
  console.log('— (a) o 1.º falha com 402 «credit balance» → o 2.º responde, em reserva —')
  {
    const linhas: LinhaLivro[] = []
    const r = await executarCadeia(
      pedido,
      [
        falso('anthropic', { gerar: falha('anthropic', '402 Your credit balance is too low', true, 402) }),
        falso('groq', { gerar: responde('resposta do groq') }),
      ],
      async (l) => { linhas.push(l) },
    )
    t('responde o 2.º', r.fornecedor === 'groq' && r.texto === 'resposta do groq')
    t('emReserva = true', r.emReserva === true)
    t('a tentativa falhada está registada', r.tentativas.length === 1 && r.tentativas[0].fornecedor === 'anthropic' && /credit balance/.test(r.tentativas[0].erro))
    t('o livro tem a linha com em_reserva e a tentativa', linhas.length === 1 && linhas[0].em_reserva && linhas[0].tentativas.length === 1 && linhas[0].sucesso)
  }

  console.log('— (b) todos falham → lança e nomeia fornecedores e erros —')
  {
    let erro: unknown
    try {
      await executarCadeia(
        pedido,
        [
          falso('groq', { gerar: falha('groq', '429 rate limit', true, 429) }),
          falso('openai', { gerar: falha('openai', '500 server error', true, 500) }),
        ],
        livroMudo,
      )
    } catch (e) { erro = e }
    t('lança ErroIA', erro instanceof ErroIA)
    const msg = erro instanceof Error ? erro.message : ''
    t('a mensagem nomeia os dois fornecedores', /groq/.test(msg) && /openai/.test(msg), msg)
    t('a mensagem nomeia os erros', /429 rate limit/.test(msg) && /500 server error/.test(msg), msg)
    t('não há texto inventado: a mensagem diz que está indisponível', /indisponível/.test(msg), msg)
    t('tentativas = 2', erro instanceof ErroIA && erro.tentativas.length === 2)
  }

  console.log('— (c) 400 de pedido mal formado NÃO salta para o seguinte —')
  {
    let chamouSegundo = false
    let erro: unknown
    try {
      await executarCadeia(
        pedido,
        [
          falso('groq', { gerar: falha('groq', '400 messages[0].content: field required', false, 400) }),
          falso('openai', { gerar: async () => { chamouSegundo = true; return { texto: 'x', modelo: 'm', custoCents: 0 } } }),
        ],
        livroMudo,
      )
    } catch (e) { erro = e }
    t('rebenta', erro instanceof ErroIA)
    t('o 2.º NUNCA foi chamado', chamouSegundo === false)
    t('a mensagem diz «mal formado»', erro instanceof Error && /mal formado/.test(erro.message))
  }

  console.log('— (d) fornecedor sem chave é saltado sem contar como falha —')
  {
    let chamouSemChave = false
    const r = await executarCadeia(
      pedido,
      [
        falso('gemini', { chave: false, gerar: async () => { chamouSemChave = true; return { texto: 'x', modelo: 'm', custoCents: 0 } } }),
        falso('groq', { gerar: responde('ok') }),
      ],
      livroMudo,
    )
    t('o sem chave não foi chamado', chamouSemChave === false)
    t('zero tentativas falhadas', r.tentativas.length === 0)
    t('o 1.º DISPONÍVEL a responder não conta como reserva', r.emReserva === false)

    let erro: unknown
    try {
      await executarCadeia(pedido, [falso('gemini', { chave: false, gerar: responde('x') })], livroMudo)
    } catch (e) { erro = e }
    t('sem nenhum com chave → diz «sem fornecedores com chave»', erro instanceof ErroIA && /sem fornecedores com chave/.test(erro.message) && erro.tentativas.length === 0)

    // imagens: quem não tem visão é saltado, não tentado
    let chamouSemVisao = false
    const rImg = await executarCadeia(
      { ...pedido, imagens: [{ mediaType: 'image/png', dataBase64: 'AAAA' }] },
      [
        falso('groq', { visao: false, gerar: async () => { chamouSemVisao = true; return { texto: 'x', modelo: 'm', custoCents: 0 } } }),
        falso('gemini', { visao: true, gerar: responde('vi a imagem') }),
      ],
      livroMudo,
    )
    t('com imagens, o sem visão é saltado', chamouSemVisao === false && rImg.fornecedor === 'gemini' && rImg.tentativas.length === 0)
  }

  console.log('— (e) json:true com resposta que não é JSON —')
  {
    const r1 = await executarCadeia({ ...pedido, json: true }, [falso('groq', { gerar: responde('Aqui vai:\n```json\n{"a":1}\n```\nespero que ajude') })], livroMudo)
    t('extrai o bloco JSON uma vez', r1.texto === '{"a":1}', r1.texto)

    let erro: unknown
    try {
      await executarCadeia({ ...pedido, json: true }, [falso('groq', { gerar: responde('Não consigo responder a isso em JSON, desculpa.') })], livroMudo)
    } catch (e) { erro = e }
    t('prosa sem JSON → falha com erro claro', erro instanceof ErroIA && /não é JSON/.test(erro.message), erro instanceof Error ? erro.message : '')

    // e passa ao seguinte, que responde JSON a sério
    const r2 = await executarCadeia(
      { ...pedido, json: true },
      [falso('groq', { gerar: responde('prosa') }), falso('openai', { gerar: responde('{"b":2}') })],
      livroMudo,
    )
    t('o seguinte responde JSON e fica registado quem falhou', r2.texto === '{"b":2}' && r2.emReserva && /não é JSON/.test(r2.tentativas[0].erro))
  }

  console.log('— (f) o livro a falhar não impede a resposta —')
  {
    const r = await executarCadeia(pedido, [falso('groq', { gerar: responde('resposta') })], async () => { throw new Error('base em baixo') })
    t('responde apesar do livro rebentar', r.texto === 'resposta')
  }

  console.log('— (g) timeout por fornecedor passa ao seguinte —')
  {
    const lento: Fornecedor = {
      ...falso('ollama', { gerar: async () => ({ texto: 'tarde', modelo: 'm', custoCents: 0 }) }),
      timeoutMs: 30,
      gerar: (_p, sinal) => new Promise((res, rej) => {
        const id = setTimeout(() => res({ texto: 'tarde', modelo: 'm', custoCents: 0 }), 500)
        sinal.addEventListener('abort', () => { clearTimeout(id); rej(new ErroFornecedor('ollama', 'timeout', true)) })
      }),
    }
    const r = await executarCadeia(pedido, [lento, falso('groq', { gerar: responde('rápido') })], livroMudo)
    t('o lento é abandonado e o seguinte responde', r.fornecedor === 'groq' && r.tentativas[0]?.erro === 'timeout')
  }

  console.log('— (h) uma tentativa por fornecedor, nunca em ciclo —')
  {
    let vezes = 0
    try {
      await executarCadeia(pedido, [falso('groq', { gerar: async () => { vezes++; throw new ErroFornecedor('groq', '503', true, 503) } })], livroMudo)
    } catch { /* esperado */ }
    t('o fornecedor foi chamado exactamente 1 vez', vezes === 1)
  }

  console.log(`\n${ok} passaram, ${ko} falharam`)
  process.exit(ko ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
