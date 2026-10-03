import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * PEDIDOS DE PREÇO → `funded_precos_pedidos` (se a tabela existir): é assim que o motor do VPS sabe
 * que alguém está a OLHAR para um símbolo e subscreve-o, em vez de subscrever o catálogo inteiro.
 * Usado pelo WebTrader e pelo Terminal MTM.
 *
 * Por instância: não se reescreve o mesmo pedido mais do que de 15 em 15 s — o motor só precisa de
 * saber que alguém ainda está a ver, não de cada poll.
 */
const ultimoPedido = new Map<string, number>()
const REPEDIR_MS = 15_000
let tabelaDePedidos: boolean | null = null

export async function registarPedidosDePreco(symbols: string[]) {
  if (tabelaDePedidos === false) return
  const agora = Date.now()
  const novos = symbols.filter((s) => agora - (ultimoPedido.get(s) ?? 0) > REPEDIR_MS)
  if (!novos.length) return
  novos.forEach((s) => ultimoPedido.set(s, agora))
  try {
    const em = new Date(agora).toISOString()
    const { error } = await getSupabaseAdmin().from('funded_precos_pedidos')
      .upsert(novos.map((symbol) => ({ symbol, pedido_em: em })), { onConflict: 'symbol' })
    if (error) {
      // 42P01 / PGRST205 = a tabela ainda não existe (é do motor). Deixa de tentar nesta instância.
      if (/42P01|PGRST205|does not exist|Could not find the table/i.test(`${error.code} ${error.message}`)) tabelaDePedidos = false
      return
    }
    tabelaDePedidos = true
  } catch {
    /* sem pedidos não se perde nada — o motor continua com os símbolos que já segue */
  }
}
