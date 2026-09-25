import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { CAMPOS_POR_TIPO, problemasDoFunil } from "@/lib/funis-campos"
import type { Funil, NoDoFunil, TipoDeNo } from "@/lib/funis"
// Os preços e a regra do bónus vêm da fonte única. Este ficheiro ainda dizia «300 $» meses
// depois de o depósito mínimo ter passado a 350 — e a IA desenhava funis com o número errado.
import { escadaNumaLinha, bonusNumaLinha } from "@/lib/escada-precos"
import { modeloClaude } from '@/lib/modelo-claude'

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * A IA monta o funil.
 *
 * Recebe uma frase ("funil para quem comenta SINAIS num reel") e devolve o desenho: blocos,
 * ligações e configuração. Não escreve prosa — devolve o mesmo JSON que o editor já grava, e é
 * por isso que o resultado é editável em vez de ser uma sugestão para copiar à mão.
 *
 * ── O que se lhe dá, e o que se lhe recusa ───────────────────────────────────────────────────
 * Recebe a tabela de campos INTEIRA, gerada a partir do código. Uma lista escrita à mão no prompt
 * ficaria desactualizada na primeira vez que se acrescentasse um bloco — e o sintoma seria a IA a
 * inventar campos que não existem, que é dos erros mais difíceis de ver.
 *
 * Não recebe números de desempenho nem textos de venda. Um funil desenhado por uma IA com acesso
 * a números que não verificou é a forma mais rápida de pôr uma promessa falsa a correr sozinha.
 */

function vocabulario(): string {
  return (Object.entries(CAMPOS_POR_TIPO) as Array<[TipoDeNo, typeof CAMPOS_POR_TIPO[TipoDeNo]]>)
    .map(([tipo, campos]) => {
      const cs = campos
        .filter((c) => c.tipo !== "aviso")
        .map((c) => {
          const opts = c.opcoes?.length ? ` (${c.opcoes.map((o) => o.valor).join("|")})` : ""
          const lista = c.tipo === "lista" ? ` [lista de {${(c.linha ?? []).map((l) => l.chave).join(", ")}}]` : ""
          return `${c.chave}:${c.tipo}${opts}${lista}`
        })
        .join(", ")
      return `- ${tipo}: ${cs || "sem campos"}`
    })
    .join("\n")
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const { pedido, existente } = (await req.json().catch(() => ({}))) as { pedido?: string; existente?: Funil }
  if (!pedido?.trim()) return NextResponse.json({ ok: false, erro: "Falta o pedido" }, { status: 400 })

  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return NextResponse.json({ ok: false, erro: "Sem chave da IA" }, { status: 400 })

  const sistema =
    `Desenhas funis para a MoreThanMoney, comunidade portuguesa de trading.\n\n` +
    `Devolves APENAS JSON, sem texto à volta e sem blocos de código. Formato:\n` +
    `{"nome":"...","descricao":"...","nos":[{"id":"...","tipo":"...","titulo":"...","detalhe":"...","x":0,"y":0,"seguintes":["id"],"config":{}}]}\n\n` +
    `Tipos de bloco e os campos de cada um (o que não estiver aqui NÃO existe):\n${vocabulario()}\n\n` +
    `Regras do desenho:\n` +
    `· Começa sempre num bloco "entrada". Sem ele ninguém chega ao funil.\n` +
    `· Numa "condicao", a PRIMEIRA seta é o sim e a SEGUNDA é o não — sempre duas.\n` +
    `· Todo o caminho acaba em "destino" (chegou) ou "saida" (perdeu-se). Um caminho que acaba no ar é um erro.\n` +
    `· Marca as fugas com "saida" e escreve o motivo. Um funil que só desenha o caminho bom mente.\n` +
    `· x avança 290 por coluna, y avança 120 por linha. Não sobreponhas blocos.\n` +
    `· ids curtos, sem espaços, únicos.\n\n` +
    `Regras da MoreThanMoney:\n` +
    `· A escada é: ${escadaNumaLinha()}.\n` +
    `· ${bonusNumaLinha()}\n` +
    `· NÃO lideres com o grátis. O teste de 14 dias só se oferece a quem diz que não quer pagar nem depositar agora.\n` +
    `· NUNCA inventes números de resultados, percentagens ou promessas de lucro. Não os tens.\n` +
    `· Português de Portugal, tratamento por tu.`

  const utilizador = existente
    ? `Funil atual:\n${JSON.stringify({ nome: existente.nome, nos: existente.nos.map((n) => ({ id: n.id, tipo: n.tipo, titulo: n.titulo, seguintes: n.seguintes })) })}\n\nPedido: ${pedido}`
    : `Pedido: ${pedido}`

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: modeloClaude(process.env.CONTENT_DRAFT_MODEL),
        max_tokens: 4000,
        system: sistema,
        messages: [{ role: "user", content: utilizador }],
      }),
      signal: AbortSignal.timeout(55_000),
    })
    const j = await r.json()
    const texto = ((j?.content ?? []) as { type: string; text?: string }[])
      .filter((x) => x.type === "text")
      .map((x) => x.text ?? "")
      .join("")
      .trim()

    // Às vezes vem com cerca de código à volta, mesmo pedindo que não. Tirar isso é mais barato
    // do que recusar e pedir outra vez.
    const limpo = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
    let funil: Funil
    try {
      funil = JSON.parse(limpo) as Funil
    } catch {
      return NextResponse.json({ ok: false, erro: "A IA não devolveu JSON válido" }, { status: 502 })
    }

    if (!Array.isArray(funil.nos) || !funil.nos.length) {
      return NextResponse.json({ ok: false, erro: "O desenho veio sem blocos" }, { status: 502 })
    }

    // Só os tipos que existem. Um bloco de tipo inventado apareceria no mapa sem cor e sem
    // campos, e ninguém perceberia porquê.
    const tipos = new Set(Object.keys(CAMPOS_POR_TIPO))
    funil.nos = funil.nos.map((n: NoDoFunil, i: number) => ({
      ...n,
      id: String(n.id ?? `n${i}`),
      tipo: (tipos.has(n.tipo) ? n.tipo : "mensagem") as TipoDeNo,
      x: Number.isFinite(n.x) ? n.x : 40 + (i % 3) * 290,
      y: Number.isFinite(n.y) ? n.y : 40 + Math.floor(i / 3) * 120,
      seguintes: Array.isArray(n.seguintes) ? n.seguintes.map(String) : [],
    }))
    funil.id = funil.id || `ia-${Date.now().toString(36)}`

    // Os problemas vão junto: um desenho gerado que ninguém verificou é uma promessa por cumprir.
    return NextResponse.json({ ok: true, funil, problemas: problemasDoFunil(funil.nos) })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 502 })
  }
}
