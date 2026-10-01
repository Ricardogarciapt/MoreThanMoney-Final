import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { resultadoDaConta, resultadoEmDinheiro } from '@/lib/portfolios/retorno'

/**
 * A CURVA DAS CONTAS DE PORTEFÓLIO — dinheiro contribuído vs valor de mercado, semana a semana.
 *
 * Pública, como a página que a desenha. Não há aqui nada de ninguém: é o desempenho das contas da
 * casa, que é precisamente o que se quer mostrar.
 *
 * Lê a tabela e não recalcula: o cálculo precisa de 27 séries de preços semanais de duas fontes
 * externas, e uma página pública que dependa disso fica refém de quem está do outro lado.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const CONTAS = ['PORTF-CRIPTO', 'PORTF-ETF'] as const

export async function GET() {
  try {
    const db = getSupabaseAdmin()
    const { data: contas } = await db
      .from('mtm_trading_accounts')
      .select('id, mt5_login, etiqueta, sim_saldo, sim_equity, metricas')
      .in('mt5_login', CONTAS)

    if (!contas?.length) return NextResponse.json({ contas: [] })

    const { data: pontos } = await db
      .from('portefolio_curva')
      .select('conta_id, data, contribuido, valor')
      .in('conta_id', contas.map((c) => c.id))
      .order('data')

    const porConta = new Map<string, Array<{ data: string; contribuido: number; valor: number }>>()
    for (const p of pontos ?? []) {
      const lista = porConta.get(String(p.conta_id)) ?? []
      lista.push({ data: String(p.data), contribuido: Number(p.contribuido), valor: Number(p.valor) })
      porConta.set(String(p.conta_id), lista)
    }

    return NextResponse.json({
      contas: contas.map((c) => {
        const curva = porConta.get(String(c.id)) ?? []
        const ultimo = curva[curva.length - 1]
        const contribuido = Number(c.sim_saldo ?? ultimo?.contribuido ?? 0)
        const valor = Number(c.sim_equity ?? ultimo?.valor ?? 0)
        const m = (c.metricas ?? {}) as Record<string, unknown>
        return {
          chave: String(c.mt5_login),
          nome: String(c.etiqueta ?? ''),
          contribuido,
          valor,
          /**
           * A FÓRMULA ÚNICA (lib/portfolios/retorno.ts): (valor − contribuído) / contribuído.
           *
           * Contra o CONTRIBUÍDO e não contra os 1 000 $ iniciais — medir um portefólio com
           * reforços contra o primeiro depósito dá um número bonito que não é o retorno de
           * ninguém. E num módulo só porque os quatro ecrãs que mostram este número têm de dizer
           * o MESMO: a `/portfolios` chegou a anunciar «+60,37 %» numa conta que fez +39,52 %,
           * por fazer a média simples das percentagens dos activos.
           */
          resultadoPct: resultadoDaConta({ contribuido, valor }) ?? 0,
          resultado: resultadoEmDinheiro({ contribuido, valor }),
          desde: String(m.desde ?? '2024-03-01'),
          origem: String(m.origem ?? ''),
          fontePrecos: String(m.fonte_precos ?? ''),
          dca: String(m.dca ?? ''),
          nota: String(m.nota ?? ''),
          curva,
        }
      }),
    })
  } catch (e) {
    return NextResponse.json({ contas: [], erro: e instanceof Error ? e.message : 'erro' }, { status: 200 })
  }
}
