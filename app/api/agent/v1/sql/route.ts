import { NextRequest } from 'next/server'
import { agentOk, agentError, requireAgentAccess } from '@/lib/agent-site-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { LIMITE_LINHAS, validarLeitura } from '@/lib/agent/leitura-sql'

export const dynamic = 'force-dynamic'

/**
 * A LEITURA DA BASE PARA O AIOS.
 *
 * POST { consulta: "select nome, email from vendas_negocios where estado='lead'" }
 *
 * ═══ TRÊS FECHADURAS, E NENHUMA DELAS CONFIA NA ANTERIOR ═══════════════════════════════════
 *
 *  1. **A chave do agente** (`requireAgentAccess`). Sem ela nem se lê o corpo do pedido.
 *  2. **A validação** (`lib/agent/leitura-sql.ts`, pura e com guarda). Recusa tudo o que não for
 *     inequivocamente uma leitura — incluindo o `WITH … DELETE … SELECT`, que começa por WITH,
 *     acaba em SELECT e apaga a tabela toda.
 *  3. **A transação READ ONLY** dentro de `agente_leitura` (migração 164). Se as duas primeiras
 *     falhassem, uma escrita rebentava no Postgres. É a fechadura que não depende de nós.
 *
 * Três porque o AIOS é um assistente de VOZ: entre o que o dono diz e o que chega aqui há um
 * microfone, um reconhecedor de fala e um modelo de linguagem, e nenhum dos três tem culpa quando
 * a frase sai outra.
 *
 * ═══ FICA ESCRITO O QUE SE PERGUNTOU ═══════════════════════════════════════════════════════
 *
 * Toda a consulta aceite vai para os registos do servidor. Não é burocracia: no dia em que alguém
 * perguntar «o que é que esse assistente anda a ler da base?», a resposta tem de existir — e tem
 * de existir mesmo que ninguém a vá ler nunca.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  const corpo = (await request.json().catch(() => ({}))) as { consulta?: string }
  const v = validarLeitura(String(corpo?.consulta ?? ''))
  if (!v.pode || !v.sql) {
    // O motivo vai para o AIOS poder DIZER porque é que não leu, em vez de ficar calado. Um
    // assistente que falha em silêncio ensina quem o usa a deixar de lhe perguntar.
    console.warn(`[agente/sql] recusado (${v.codigo}): ${String(corpo?.consulta ?? '').slice(0, 200)}`)
    return agentError(v.porque, 422)
  }

  console.log(`[agente/sql] ${v.sql.slice(0, 300)}`)

  const { data, error } = await getSupabaseAdmin().rpc('agente_leitura', { consulta: v.sql })
  if (error) {
    /**
     * O erro do Postgres vai inteiro. Uma coluna que não existe ou uma tabela mal escrita é
     * exactamente o que o modelo precisa de saber para corrigir à segunda — e esconder isso atrás
     * de «não consegui» obriga o dono a repetir a pergunta sem nunca perceber porquê.
     */
    return agentError(`A base recusou: ${error.message}`, 400)
  }

  const linhas = Array.isArray(data) ? data : []
  return agentOk({
    linhas,
    quantas: linhas.length,
    // Dizer quando se bateu no tecto evita a pior conclusão possível: tomar 200 por «é tudo».
    truncado: linhas.length >= LIMITE_LINHAS,
    consulta: v.sql,
  })
}
