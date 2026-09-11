import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CONTRATO_VERSAO, textoDoContrato } from '@/lib/mtmfunded/contrato'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * O contrato de trader financiado: ver e assinar.
 *
 * GET   → o texto para esta conta, e se já está assinado.
 * POST  → assina, com nome completo e data de nascimento confirmados pelo próprio.
 *
 * A DATA DE NASCIMENTO é confirmada aqui outra vez, e não herdada da inscrição. É o que
 * transforma «temos uma data numa tabela» em «esta pessoa declarou, ao assinar, que é maior
 * de idade» — e é essa a declaração que faz falta quando houver dinheiro a sair.
 */
async function utilizador(request: NextRequest) {
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!auth) return null
  const { data } = await getSupabaseAdmin().auth.getUser(auth)
  return data?.user ?? null
}

export async function GET(request: NextRequest) {
  const user = await utilizador(request)
  if (!user) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: perfil } = await db
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  // A conta financiada ou de desafio maior — é sobre ela que o contrato fala.
  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, tipo, saldo_inicial')
    .eq('user_id', user.id)
    .order('saldo_inicial', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: assinado } = await db
    .from('mtm_funded_contracts')
    .select('id, versao, nome_completo, assinado_em')
    .eq('user_id', user.id)
    .eq('versao', CONTRATO_VERSAO)
    .maybeSingle()

  return NextResponse.json({
    versao: CONTRATO_VERSAO,
    texto: textoDoContrato({
      nome: assinado?.nome_completo ?? (perfil?.full_name as string) ?? 'Trader',
      saldo: Number(conta?.saldo_inicial ?? 0),
    }),
    assinado: assinado
      ? { em: assinado.assinado_em, nome: assinado.nome_completo, versao: assinado.versao }
      : null,
    contaId: conta?.id ?? null,
  })
}

export async function POST(request: NextRequest) {
  const user = await utilizador(request)
  if (!user) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const nome = String(body?.nomeCompleto ?? '').trim()
  const nascimento = String(body?.dataNascimento ?? '').trim()
  const aceita = body?.aceita === true

  if (nome.length < 5 || !nome.includes(' ')) {
    return NextResponse.json({ error: 'Escreve o teu nome completo' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) {
    return NextResponse.json({ error: 'Indica a data de nascimento' }, { status: 400 })
  }
  const anos = (Date.now() - new Date(nascimento).getTime()) / (365.25 * 24 * 3600 * 1000)
  if (anos < 18) {
    return NextResponse.json(
      { error: 'É preciso ter 18 anos ou mais para assinar este contrato' },
      { status: 400 },
    )
  }
  if (!aceita) return NextResponse.json({ error: 'É preciso aceitar o contrato' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, saldo_inicial')
    .eq('user_id', user.id)
    .order('saldo_inicial', { ascending: false })
    .limit(1)
    .maybeSingle()

  const texto = textoDoContrato({ nome, saldo: Number(conta?.saldo_inicial ?? 0) })

  const { error } = await db.from('mtm_funded_contracts').upsert(
    {
      user_id: user.id,
      account_id: conta?.id ?? null,
      versao: CONTRATO_VERSAO,
      nome_completo: nome,
      data_nascimento: nascimento,
      // O texto INTEIRO, e não uma referência. É o que a pessoa leu naquele dia.
      texto,
      // Para uma assinatura valer, tem de se saber de onde veio.
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      agente: request.headers.get('user-agent')?.slice(0, 300) ?? null,
    },
    { onConflict: 'user_id,versao' },
  )
  if (error) return NextResponse.json({ error: 'Não foi possível assinar' }, { status: 500 })

  // O nome completo do contrato passa a ser o do perfil: é o que consta no documento.
  await db.from('profiles').update({ full_name: nome }).eq('id', user.id)

  /**
   * ASSINAR É O MOMENTO EM QUE SE PASSA A TRADER FINANCIADO — e é por isso que o certificado
   * sai daqui.
   *
   * É BEST-EFFORT: a assinatura já está gravada, e é ela que vale. Um erro a desenhar um PDF
   * não pode desfazer um contrato assinado, nem obrigar a pessoa a assinar outra vez.
   */
  let certificado: string | null = null
  try {
    const { data: jaTem } = await db
      .from('mtm_certificates')
      .select('codigo')
      .eq('user_id', user.id)
      .eq('tipo', 'financiado')
      .maybeSingle()

    if (jaTem) {
      certificado = jaTem.codigo as string
    } else {
      const { gerarCertificadoPdf, gerarCodigo } = await import('@/lib/mtmfunded/certificado')
      const codigo = gerarCodigo('financiado')
      const pdf = await gerarCertificadoPdf({
        tipo: 'financiado',
        nome,
        prova: `Conta financiada de ${Number(conta?.saldo_inicial ?? 0).toLocaleString('pt-PT')} USD`,
        codigo,
      })
      const { error: erroCert } = await db.from('mtm_certificates').insert({
        user_id: user.id,
        account_id: conta?.id ?? null,
        tipo: 'financiado',
        codigo,
        nome,
        detalhe: { contrato: CONTRATO_VERSAO, saldo: conta?.saldo_inicial ?? null },
      })
      if (!erroCert) {
        certificado = codigo
        const { data: perfilEmail } = await db
          .from('profiles').select('email').eq('id', user.id).maybeSingle()
        if (perfilEmail?.email) {
          const { enviarCertificado } = await import('@/lib/mtmfunded/emitir-certificados')
          await enviarCertificado({
            para: perfilEmail.email as string,
            nome,
            tipo: 'financiado',
            prova: `Conta financiada de ${Number(conta?.saldo_inicial ?? 0).toLocaleString('pt-PT')} USD`,
            posicao: null,
            codigo,
            pdf,
          }).catch(() => undefined)
        }
      }
    }
  } catch (e) {
    console.error('[MTMFUNDED] contrato assinado mas o certificado falhou:', e)
  }

  /**
   * E A CONTA FINANCIADA sai agora — não antes.
   *
   * Passar o desafio dá direito a ser trader financiado; assinar é o que o torna um. Emitir a
   * conta antes da assinatura era entregar capital real da MTM a alguém que ainda não se
   * vinculou a regra nenhuma — e pedir a assinatura depois, com a conta já na mão, não é pedir
   * nada.
   *
   * Best-effort e idempotente, pela mesma razão do certificado: a assinatura já vale, e um
   * erro na fila não pode desfazê-la nem obrigar a assinar outra vez.
   */
  let contaFinanciada: string | null = null
  try {
    const { emitirContaFinanciada } = await import('@/lib/mtmfunded/ciclo-de-vida')
    const r = await emitirContaFinanciada(user.id)
    if (r.ok) contaFinanciada = r.accountId ?? null
    else console.log('[MTMFUNDED] conta financiada não emitida:', r.motivo)
  } catch (e) {
    console.error('[MTMFUNDED] contrato assinado mas a conta financiada falhou:', e)
  }

  return NextResponse.json({ ok: true, versao: CONTRATO_VERSAO, certificado, contaFinanciada })
}
