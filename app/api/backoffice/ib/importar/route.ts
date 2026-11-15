import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { importar, importarMovimentos, detectarFormato, estadoInicial, CORRETORA_NOME } from '@/lib/ib-importar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * IMPORTAR UMA EXPORTAÇÃO DE CORRETORA.
 *
 * Cola-se a exportação tal como sai do painel da corretora — com a linha dos títulos — e esta rota
 * reconhece o formato, lê as linhas e guarda-as. Ver `lib/ib-importar.ts` para o porquê de ser um
 * importador e não uma lista escrita à mão.
 *
 * QUEM PODE: só quem faz parte da rede de IBs, e o dono. Isto traz nome, email, telefone e saldo de
 * clientes de corretora — não é informação para a equipa de vendas inteira, e a verificação é
 * feita aqui no servidor, contra `ib_membros`, e não por um papel qualquer do backoffice.
 *
 * O QUE NÃO SE PERDE NUMA REIMPORTAÇÃO: o estado da migração e a nota. A corretora exporta saldos
 * e volumes; quem sabe que o Cayo já disse que sim é a pessoa que falou com ele. Uma importação
 * mensal que apagasse esse trabalho fazia a equipa recomeçar do zero todos os meses — e seria a
 * última vez que alguém a usaria.
 */
export async function POST(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx

  const db = getSupabaseAdmin()

  const { data: souIb } = await db
    .from('ib_membros')
    .select('user_id')
    .eq('user_id', ctx.userId)
    .is('ate', null)
    .maybeSingle()

  if (!souIb && !ctx.admin) {
    return NextResponse.json({ error: 'Esta área é da rede de IBs.' }, { status: 403 })
  }

  let corpo: { texto?: unknown }
  try {
    corpo = (await request.json()) as { texto?: unknown }
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const texto = typeof corpo.texto === 'string' ? corpo.texto : ''
  if (texto.trim().length < 20) {
    return NextResponse.json({ error: 'Cola a exportação, com a linha dos títulos.' }, { status: 400 })
  }

  // A folha «fund report» do IB report da PU Prime são movimentos, não contas: tabela própria.
  const primeiraLinha = texto.split('\n').find((l) => l.trim().length > 0) ?? ''
  if (detectarFormato(primeiraLinha) === 'pu_prime_fundos') {
    const mov = importarMovimentos(texto)
    if (mov.erro || mov.linhas.length === 0) {
      return NextResponse.json({ error: mov.erro ?? 'A folha de movimentos veio vazia.' }, { status: 400 })
    }
    const { error, count } = await db
      .from('ib_movimentos')
      .upsert(mov.linhas, { onConflict: 'corretora,conta,data,depositos,levantamentos', ignoreDuplicates: true, count: 'exact' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const dias = mov.linhas.map((l) => l.data).sort()
    return NextResponse.json({
      ok: true,
      tipo: 'movimentos',
      corretora: CORRETORA_NOME.pu_prime,
      formato: mov.formato,
      guardadas: count ?? mov.linhas.length,
      lidas: mov.linhas.length,
      semConta: mov.ignoradas,
      periodo: dias.length ? `${dias[0]} a ${dias[dias.length - 1]}` : null,
      depositos: mov.linhas.reduce((a, l) => a + l.depositos, 0),
      levantamentos: mov.linhas.reduce((a, l) => a + l.levantamentos, 0),
    })
  }

  const lido = importar(texto)
  if (lido.erro || !lido.corretora) {
    return NextResponse.json({ error: lido.erro ?? 'Não reconheci o ficheiro.' }, { status: 400 })
  }

  // O que já cá está, para não apagar o trabalho humano ao reimportar.
  const contas = lido.linhas.map((l) => l.conta)
  const { data: existentes } = await db
    .from('ib_contas')
    .select('conta, estado_migracao, nota, user_id, ib_id')
    .eq('corretora', lido.corretora)
    .in('conta', contas)

  const guardado = new Map(
    (existentes ?? []).map((r) => {
      const e = r as { conta: string; estado_migracao: string; nota: string | null; user_id: string | null; ib_id: string | null }
      return [e.conta, e]
    }),
  )

  const linhas = lido.linhas.map((l) => {
    const antes = guardado.get(l.conta)
    return {
      ...l,
      // O estado só se calcula na PRIMEIRA vez. Depois disso manda quem falou com a pessoa.
      estado_migracao: antes?.estado_migracao ?? estadoInicial(l),
      nota: antes?.nota ?? null,
      user_id: antes?.user_id ?? null,
      ib_id: antes?.ib_id ?? null,
      atualizado_em: new Date().toISOString(),
    }
  })

  const { error, count } = await db
    .from('ib_contas')
    .upsert(linhas, { onConflict: 'corretora,conta', count: 'exact' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    corretora: CORRETORA_NOME[lido.corretora],
    formato: lido.formato,
    guardadas: count ?? linhas.length,
    novas: linhas.length - guardado.size,
    atualizadas: guardado.size,
    semConta: lido.ignoradas,
  })
}
