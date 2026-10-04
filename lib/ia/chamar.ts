/**
 * A PORTA ÚNICA DA IA DO SITE — `chamarIA(pedido)`.
 *
 * ═══ PORQUÊ ═══════════════════════════════════════════════════════════════════════════════════
 * A 04/10 o Terminal MTM mostrou ao dono um JSON cru da Anthropic: «Your credit balance is too
 * low». Havia 31 ficheiros a chamar a Anthropic à mão, 12 a OpenAI e 1 o Groq — sem nada no meio.
 * Uma conta sem crédito deitava tudo abaixo e ninguém sabia antes do cliente.
 *
 * ═══ A CADEIA, por esta ordem ═════════════════════════════════════════════════════════════════
 *   1. Groq      — grátis e o mais rápido (llama-3.3-70b / llama-3.1-8b)
 *   2. Gemini    — grátis, com visão e JSON nativo; mais lento e com limite diário mais curto
 *   3. Ollama    — nosso/custo zero mas lento em CPU; só entra se OLLAMA_URL estiver definido
 *   4. OpenAI    — pago; só se houver chave
 *   5. Anthropic — pago; só se houver chave (sem crédito a 04/10)
 * Grátis primeiro porque o objectivo do dono é custo zero; os pagos ficam como reserva da reserva.
 *
 * ═══ REGRAS ═══════════════════════════════════════════════════════════════════════════════════
 *   · Sem chave → SALTADO (não é tentativa falhada).
 *   · Falha de conta/ritmo/servidor/timeout → passa ao seguinte. UMA tentativa por fornecedor.
 *   · 400 por pedido mal formado → REBENTA. É bug nosso; esconder atrás de uma reserva era pior.
 *   · Todos falham → lança `ErroIA` com a lista. NUNCA texto inventado a fingir que é IA (houve
 *     uma versão que devolvia «[Modo Resiliente] Estou a processar…» — é exactamente o proibido).
 *   · `emReserva: true` sempre que não foi o 1.º fornecedor disponível a responder.
 *   · Cada chamada vai ao livro (`ia_chamadas`); o livro nunca impede a resposta.
 *
 * A lógica da cadeia está em `executarCadeia`, pura, com fornecedores e livro injectados — é o
 * que a guarda `chamar.check.ts` prova com fornecedores falsos.
 */
import { anthropic } from './fornecedores/anthropic'
import { gemini } from './fornecedores/gemini'
import { groq } from './fornecedores/groq'
import { ollama } from './fornecedores/ollama'
import { openai } from './fornecedores/openai'
import { livroSupabase, type Livro } from './livro'
import { ErroFornecedor, ErroIA, type Fornecedor, type PedidoIA, type RespostaIA, type TentativaIA } from './tipos'

export type { PedidoIA, RespostaIA, NomeFornecedor, MensagemIA, ImagemIA, TentativaIA } from './tipos'
export { ErroIA, ErroFornecedor } from './tipos'

/** A ordem oficial. Mudar a ordem é mudar aqui — e explicar no cabeçalho. */
export const CADEIA: Fornecedor[] = [groq, gemini, ollama, openai, anthropic]

export async function chamarIA(p: PedidoIA): Promise<RespostaIA> {
  return executarCadeia(p, CADEIA, livroSupabase)
}

/**
 * Mensagem honesta para mostrar ao utilizador quando a IA falhou. Quem chama decide o resto
 * (HTTP, ecrã); isto garante que nunca vai um JSON cru de um fornecedor para a página.
 */
export function mensagemIndisponivel(err: unknown): string {
  if (err instanceof ErroIA) return err.message
  return 'A IA está indisponível neste momento.'
}

/** Corre a cadeia. Exportada para a guarda injectar fornecedores falsos. */
export async function executarCadeia(p: PedidoIA, fornecedores: Fornecedor[], livro: Livro): Promise<RespostaIA> {
  const inicio = Date.now()
  const tarefa = p.tarefa ?? 'sem-etiqueta'
  const tentativas: TentativaIA[] = []
  const saltados: string[] = []
  let primeiroDisponivel: string | null = null

  for (const f of fornecedores) {
    if (!f.disponivel()) {
      saltados.push(`${f.nome} (sem chave)`)
      continue
    }
    if (p.imagens?.length && !f.suportaImagens) {
      saltados.push(`${f.nome} (sem visão)`)
      continue
    }
    primeiroDisponivel ??= f.nome

    const controlador = new AbortController()
    const tecto = setTimeout(() => controlador.abort(), p.timeoutMs ?? f.timeoutMs)
    try {
      const g = await f.gerar(p, controlador.signal)
      const texto = p.json ? extrairJson(f.nome, g.texto) : g.texto
      const resposta: RespostaIA = {
        texto,
        fornecedor: f.nome,
        modelo: g.modelo,
        custoCents: g.custoCents,
        emReserva: f.nome !== primeiroDisponivel,
        tentativas,
      }
      await livro({
        tarefa,
        fornecedor: f.nome,
        modelo: g.modelo,
        em_reserva: resposta.emReserva,
        tentativas,
        saltados,
        tokens_entrada: g.tokensEntrada ?? null,
        tokens_saida: g.tokensSaida ?? null,
        custo_cents: g.custoCents,
        duracao_ms: Date.now() - inicio,
        sucesso: true,
        erro: null,
      }).catch(() => {})
      return resposta
    } catch (e) {
      const erro = e instanceof ErroFornecedor ? e : new ErroFornecedor(f.nome, e instanceof Error ? e.message : String(e), true)
      tentativas.push({ fornecedor: f.nome, erro: erro.message })
      if (!erro.passavel) {
        // Pedido mal formado: é bug NOSSO. Fica no livro e rebenta já, sem esconder.
        await livro(linhaDeFalha(tarefa, tentativas, saltados, inicio, `pedido mal formado em ${f.nome}: ${erro.message}`)).catch(() => {})
        throw new ErroIA(`Pedido à IA mal formado (${f.nome}): ${erro.message}`, tentativas, saltados)
      }
    } finally {
      clearTimeout(tecto)
    }
  }

  const motivo = tentativas.length
    ? `A IA está indisponível neste momento. Fornecedores tentados: ${tentativas.map((t) => `${t.fornecedor} (${t.erro})`).join('; ')}.`
    : saltados.length
      ? `A IA está indisponível: sem fornecedores com chave${p.imagens?.length ? ' e visão' : ''} (${saltados.join(', ')}).`
      : 'A IA está indisponível: a cadeia de fornecedores está vazia.'
  await livro(linhaDeFalha(tarefa, tentativas, saltados, inicio, motivo)).catch(() => {})
  throw new ErroIA(motivo, tentativas, saltados)
}

function linhaDeFalha(tarefa: string, tentativas: TentativaIA[], saltados: string[], inicio: number, erro: string) {
  return {
    tarefa,
    fornecedor: null,
    modelo: null,
    em_reserva: false,
    tentativas,
    saltados,
    tokens_entrada: null,
    tokens_saida: null,
    custo_cents: 0,
    duracao_ms: Date.now() - inicio,
    sucesso: false,
    erro,
  }
}

/**
 * Com `json: true`, o texto TEM de ser JSON. Se não for à primeira, tenta extrair UM bloco (tira
 * ```fences``` e texto à volta); se ainda não der, é falha do fornecedor (passável) — nunca se
 * devolve prosa como se fosse JSON para quem chama rebentar no JSON.parse sem saber porquê.
 */
export function extrairJson(fornecedor: string, texto: string): string {
  const t = texto.trim()
  try {
    JSON.parse(t)
    return t
  } catch {
    /* tenta extrair uma vez */
  }
  let s = t
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const ini = Math.min(...['{', '['].map((c) => s.indexOf(c)).filter((i) => i >= 0))
  if (Number.isFinite(ini)) {
    const fim = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
    if (fim > ini) {
      const bloco = s.slice(ini, fim + 1)
      try {
        JSON.parse(bloco)
        return bloco
      } catch {
        /* não era JSON */
      }
    }
  }
  throw new ErroFornecedor(fornecedor, `pediu-se JSON e a resposta não é JSON (começa por «${t.slice(0, 40)}»)`, true)
}
