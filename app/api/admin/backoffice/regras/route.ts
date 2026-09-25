/**
 * AS PERCENTAGENS DE COMISSÃO — mudá-las sem deploy, e sem reescrever o passado.
 *
 * A tabela `vendas_regras_comissao` é IMUTÁVEL com vigência (migrações 128 e 129): mudar uma
 * percentagem FECHA a linha que estava em vigor (`valido_ate = agora`) e abre outra. Toda a lógica
 * está em `lib/vendas/regras.ts` — esta rota não faz contas nem escreve SQL, só autoriza e delega.
 *
 * PORQUE É QUE ISTO IMPORTA MAIS DO QUE PARECE: se fosse um UPDATE, mudar hoje os 30 % do afiliado
 * para 20 % fazia com que a comissão de Agosto passasse a ser «explicada» por 20 %. A pessoa recebeu
 * um número, o livro mostraria outro, e a discussão não tinha árbitro. Com vigência, cada comissão
 * aponta para a regra com que foi feita, para sempre.
 *
 * O GET devolve o histórico completo de propósito: o painel tem de mostrar ao Ricardo o que estava
 * em vigor antes, senão mudar uma percentagem parece não ter consequências.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { PAPEIS_VENDAS, PLANO_PADRAO, type AplicaA, type PapelVendas } from '@/lib/vendas/calculo'
import { carregarRegras, definirRegra, revogarRegra } from '@/lib/vendas/regras'

const APLICA: AplicaA[] = ['primeira', 'renovacao', 'ambos']

export async function GET() {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const todas = await carregarRegras(supabase)
    return NextResponse.json({
      // Em vigor e histórico já separados: quem desenha o ecrã não tem de reproduzir a regra de
      // «em vigor = valido_ate nulo», que é onde se erra a leitura.
      em_vigor: todas.filter((r) => !r.valido_ate),
      historico: todas.filter((r) => r.valido_ate),
      papeis: PAPEIS_VENDAS,
      plano_padrao: PLANO_PADRAO,
      // Os planos que já têm regras. NÃO é uma lista fechada em código: o dono pode criar um plano
      // novo ao definir a primeira regra dele, e uma constante aqui obrigava-o a esperar por deploy.
      planos: [...new Set(todas.map((r) => r.plano))].sort(),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falhou a leitura' }, { status: 500 })
  }
}

/** Definir (ou mudar) a percentagem de um (plano, papel, pack, aplica_a). */
export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const papel = String(body.papel ?? '') as PapelVendas
  if (!PAPEIS_VENDAS.includes(papel)) {
    return NextResponse.json({ error: `Papel inválido. Válidos: ${PAPEIS_VENDAS.join(', ')}` }, { status: 400 })
  }
  const aplica_a = (APLICA.includes(body.aplica_a as AplicaA) ? body.aplica_a : 'ambos') as AplicaA

  try {
    const { regra, substituiu } = await definirRegra(getSupabaseAdmin(), {
      plano: typeof body.plano === 'string' ? body.plano : PLANO_PADRAO,
      papel,
      pack: String(body.pack ?? ''),
      pct: Number(body.pct),
      aplica_a,
      nota: typeof body.nota === 'string' ? body.nota.slice(0, 500) : null,
      // Uma percentagem sem autor é uma decisão sem dono.
      criado_por: auth.userId,
    })
    // `substituiu` vai para o painel: ele mostra «fechou a regra anterior», que é a prova de que o
    // passado não foi reescrito.
    return NextResponse.json({ success: true, regra, substituiu })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falhou a gravação' }, { status: 400 })
  }
}

/**
 * Revogar: a partir de agora este caso deixa de pagar. Continua a existir como linha fechada, porque
 * as comissões que ela já fez têm de continuar a poder apontar para ela.
 */
export async function DELETE(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: 'Falta a regra' }, { status: 400 })

  try {
    await revogarRegra(getSupabaseAdmin(), id)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falhou a revogação' }, { status: 500 })
  }
}
