import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { gerarCertificadoPdf, gerarCodigo, type TipoCertificado } from '@/lib/mtmfunded/certificado'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const TIPOS: TipoCertificado[] = ['participacao', 'classificacao', 'desafio', 'financiado', 'payout']

/**
 * O PDF de um certificado — pelo código, ou uma AMOSTRA por tipo.
 *
 * O PDF não é guardado em lado nenhum: desenha-se a partir da linha da base de dados sempre
 * que é pedido. Um ficheiro guardado num balde é um ficheiro que fica desactualizado quando o
 * desenho do certificado muda, e que se espalha por URLs que ninguém revoga.
 *
 * `?amostra=financiado` desenha um exemplar em branco de cada tipo, para o admin ver e
 * descarregar sem ter de emitir um certificado a sério a alguém.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const { codigo } = await params
  const limpo = decodeURIComponent(codigo ?? '').trim().toUpperCase()

  const amostra = request.nextUrl.searchParams.get('amostra')
  if (amostra) {
    // As amostras são só para admin: são documentos com a marca da casa, e um exemplar em
    // branco à solta é um modelo pronto a ser preenchido por quem não devia.
    const { requireAdmin } = await import('@/lib/admin-api-helpers')
    const negado = await requireAdmin(request)
    if (negado) return negado

    const tipo = (TIPOS.includes(amostra as TipoCertificado) ? amostra : 'participacao') as TipoCertificado
    const pdf = await gerarCertificadoPdf({
      tipo,
      nome: 'Nome do Trader',
      prova:
        tipo === 'financiado'
          ? 'Conta financiada de 10.000 USD'
          : tipo === 'desafio'
            ? 'Desafio 10K · 1 fase'
            : 'Trading Tournament · 3.º Trimestre 2026',
      posicao: tipo === 'classificacao' ? 1 : null,
      resultadoPct: tipo === 'classificacao' ? 12.4 : null,
      codigo: gerarCodigo(tipo),
    })
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="amostra-${tipo}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const { data: cert } = await getSupabaseAdmin()
    .from('mtm_certificates')
    .select('codigo, tipo, nome, posicao, detalhe, tournament_id, emitido_em, user_id')
    .eq('codigo', limpo)
    .maybeSingle()

  if (!cert) return NextResponse.json({ error: 'Certificado não encontrado' }, { status: 404 })

  /**
   * O PDF é SÓ DO DONO (e do admin).
   *
   * A página de validação é pública, e tem de ser — um certificado que exige login para ser
   * verificado não serve para mostrar a um recrutador. Mas o ficheiro é outra coisa: traz o
   * nome completo e o documento inteiro, e isso não é para quem escreve um código na barra de
   * endereço.
   */
  const { cookies } = await import('next/headers')
  const { createServerClient } = await import('@supabase/ssr')
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()

  let podeDescarregar = Boolean(user && cert.user_id === user.id)
  if (!podeDescarregar && user) {
    const { data: perfil } = await getSupabaseAdmin()
      .from('profiles').select('user_type').eq('id', user.id).maybeSingle()
    podeDescarregar = String(perfil?.user_type ?? '').toLowerCase() === 'admin'
  }
  if (!podeDescarregar) {
    return NextResponse.json(
      { error: 'Só o titular do certificado o pode descarregar' },
      { status: 403 },
    )
  }

  const detalhe = (cert.detalhe ?? {}) as Record<string, unknown>
  let prova = 'MTM Funded'
  if (cert.tournament_id) {
    const { data: t } = await getSupabaseAdmin()
      .from('mtm_tournaments').select('nome').eq('id', cert.tournament_id).maybeSingle()
    if (t?.nome) prova = t.nome as string
  } else if (detalhe.valorUsd) {
    prova = `Pagamento de ${Number(detalhe.valorUsd).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} USD`
  } else if (detalhe.saldo) {
    prova = `Conta financiada de ${Number(detalhe.saldo).toLocaleString('pt-PT')} USD`
  }

  const pdf = await gerarCertificadoPdf({
    tipo: cert.tipo as TipoCertificado,
    nome: cert.nome as string,
    prova,
    posicao: cert.posicao as number | null,
    resultadoPct: typeof detalhe.resultadoPct === 'number' ? detalhe.resultadoPct : null,
    codigo: cert.codigo as string,
    data: new Date(cert.emitido_em as string),
  })

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${cert.codigo}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
