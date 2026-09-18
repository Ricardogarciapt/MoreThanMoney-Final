import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { carregarDireitos } from '@/lib/entitlements'
import { erroSemColunaEtiqueta, lerPedidoEtiqueta } from '@/lib/contas/etiqueta'

export const dynamic = 'force-dynamic'

/**
 * A ETIQUETA DE UMA CONTA — a ÚNICA porta de escrita (113, pedido do dono 17/09).
 *
 *   PATCH { ref, etiqueta }  →  { ok: true, etiqueta: string | null }
 *
 * `ref` é a referência que o seletor do WebTrader já usa (`mtmfunded:<uuid>`, `mt5:site:<uuid>`,
 * `tradelocker:auto:<uuid>`, `mt5:wt:<uuid>`…): uma rota serve as quatro tabelas onde as contas
 * vivem, em vez de uma por família. `lib/contas/etiqueta.ts` decide a tabela e valida o UUID.
 *
 * DONO VERIFICADO NO SERVIDOR: o UPDATE leva sempre `user_id = quem pede`. Sem linha do próprio,
 * 404 — nem se diz se a conta existe. Só um admin escreve em contas de outra pessoa; nesse caso
 * a linha é encontrada só pelo id (e o admin é lido dos direitos, nunca do corpo do pedido).
 *
 * Uma conta MTM Funded ligada com a password investor é de OUTRA pessoa: o filtro por `user_id`
 * já a deixa de fora — quem a vê em «só leitura» não lhe põe etiqueta.
 *
 * `etiqueta: ''` ou `null` apaga (é opcional). O texto passa por `normalizarEtiqueta`: 40
 * caracteres, sem `<` nem `>`, espaços colapsados.
 */
export async function PATCH(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'Entra com a tua conta MTM para pôr etiquetas.' }, { status: 401 })

  // A validação é pura (lib/contas/etiqueta.ts::lerPedidoEtiqueta, testada no .check).
  const pedidoValido = lerPedidoEtiqueta(await request.json().catch(() => ({})))
  if (!pedidoValido.ok) return NextResponse.json({ error: pedidoValido.erro }, { status: pedidoValido.status })
  const { tabela, id, etiqueta } = pedidoValido

  const db = getSupabaseAdmin()
  const { admin } = await carregarDireitos(userId)

  let pedido = db.from(tabela).update({ etiqueta }).eq('id', id)
  if (!admin) pedido = pedido.eq('user_id', userId)
  const { data, error } = await pedido.select('id').maybeSingle()

  if (error) {
    // 42703 = a coluna não existe: a migração 113 ainda não foi aplicada.
    if (erroSemColunaEtiqueta(error)) {
      return NextResponse.json({ error: 'As etiquetas ainda não estão activas nesta base de dados.', code: 'sem_coluna' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Não foi possível gravar a etiqueta.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 })

  return NextResponse.json({ ok: true, etiqueta }, { headers: { 'Cache-Control': 'no-store' } })
}
