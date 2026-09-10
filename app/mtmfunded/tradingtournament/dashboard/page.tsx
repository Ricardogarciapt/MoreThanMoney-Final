import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { papelMtmFunded, SCANNERS_TORNEIO } from '@/lib/mtmfunded/acesso'
import PainelParticipante from './painel'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'A minha área · Trading Tournament' }

/**
 * O PAINEL DO PARTICIPANTE.
 *
 * Tudo o que ele precisa, e nada do que não é dele. As sete secções que o Ricardo definiu:
 * Dashboard, Contas, Contratos, Competições, Classificação, Terminal MTM e Certificados.
 * A comunidade são os chats da app — não um Discord à parte, que seria mais um sítio para
 * ninguém ir.
 *
 * A sessão resolve-se AQUI, no servidor. As credenciais MT5 nunca chegam ao browser sem
 * alguém provar quem é: é a razão de a password não ir no email.
 */
export default async function DashboardTorneioPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          /* leitura apenas: um Server Component não escreve cookies */
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/mtmfunded/tradingtournament/dashboard')

  const db = getSupabaseAdmin()
  const { data: perfil } = await db
    .from('profiles')
    .select('id, full_name, email, user_type, member_category, subscription_plan, is_active')
    .eq('id', user.id)
    .maybeSingle()

  const papel = papelMtmFunded(perfil)

  const { data: torneio } = await db
    .from('mtm_tournaments')
    .select('id, slug, nome, estado, comeca_em, acaba_em, saldo_inicial, regras, premios, publicado')
    .eq('publicado', true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: participante } = torneio
    ? await db
        .from('mtm_tournament_participants')
        .select('id, estado, posicao, resultado_pct, metricas, account_id, inscrito_em')
        .eq('tournament_id', torneio.id)
        .eq('user_id', user.id)
        .maybeSingle()
    : { data: null }

  const { data: contas } = await db
    .from('mtm_trading_accounts')
    .select('id, tipo, mt5_login, servidor, saldo_inicial, alavancagem, estado, metricas, quebrou_regra, quebrada_em, qrcode_url, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: certificados } = await db
    .from('mtm_certificates')
    .select('codigo, tipo, posicao, emitido_em')
    .eq('user_id', user.id)
    .order('emitido_em', { ascending: false })

  const { data: classificacao } = torneio
    ? await db
        .from('mtm_tournament_participants')
        .select('nome_publico, email, posicao, resultado_pct, estado, metricas')
        .eq('tournament_id', torneio.id)
        .order('posicao', { ascending: true, nullsFirst: false })
        .limit(50)
    : { data: null }

  return (
    <PainelParticipante
      nome={(perfil?.full_name as string) || user.email?.split('@')[0] || 'Trader'}
      papel={papel}
      scannersPermitidos={papel === 'torneio' ? [...SCANNERS_TORNEIO] : null}
      torneio={
        torneio
          ? {
              slug: torneio.slug as string,
              nome: torneio.nome as string,
              estado: torneio.estado as string,
              comecaEm: torneio.comeca_em as string,
              acabaEm: torneio.acaba_em as string,
              saldoInicial: Number(torneio.saldo_inicial),
              regras: (torneio.regras ?? {}) as Record<string, number>,
              premios: (torneio.premios ?? []) as Array<{ posicao: number; premio: string }>,
            }
          : null
      }
      participante={
        participante
          ? {
              estado: participante.estado as string,
              posicao: participante.posicao as number | null,
              resultadoPct: participante.resultado_pct == null ? null : Number(participante.resultado_pct),
              metricas: (participante.metricas ?? {}) as Record<string, unknown>,
            }
          : null
      }
      contas={(contas ?? []).map((c) => ({
        id: c.id as string,
        tipo: c.tipo as string,
        login: (c.mt5_login as string) ?? null,
        servidor: (c.servidor as string) ?? null,
        saldoInicial: c.saldo_inicial == null ? null : Number(c.saldo_inicial),
        alavancagem: c.alavancagem as number | null,
        estado: c.estado as string,
        metricas: (c.metricas ?? {}) as Record<string, unknown>,
        quebrouRegra: (c.quebrou_regra as string) ?? null,
        // O QR do MetaTrader vai INTEIRO para o painel — não é segredo maior do que o
        // login que já está ali ao lado, e é o que faz a app entrar com um toque.
        qrcode: (c.qrcode_url as string) ?? null,
      }))}
      certificados={(certificados ?? []).map((c) => ({
        codigo: c.codigo as string,
        tipo: c.tipo as string,
        posicao: c.posicao as number | null,
        emitidoEm: c.emitido_em as string,
      }))}
      classificacao={(classificacao ?? []).map((l) => ({
        posicao: l.posicao as number | null,
        nome: l.nome_publico as string,
        resultadoPct: l.resultado_pct == null ? null : Number(l.resultado_pct),
        estado: l.estado as string,
        // O email NÃO viaja para o cliente, nem censurado: aqui basta o nome.
        elegivel: (l.metricas as Record<string, unknown>)?.elegivel === true,
      }))}
    />
  )
}
