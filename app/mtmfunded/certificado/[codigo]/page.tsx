import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * VALIDAÇÃO PÚBLICA de um certificado.
 *
 * É esta página que faz o certificado valer alguma coisa: quem o recebe pode confirmá-lo sem
 * pedir nada a ninguém. Por isso é pública e sem sessão — exigir login para validar seria
 * pedir a um recrutador que criasse conta na MTM.
 *
 * Mostra-se o mínimo: nome, o que foi conquistado, e quando. Nem email, nem conta, nem
 * resultado detalhado — validar não é o mesmo que abrir a ficha da pessoa a quem quer que
 * escreva um código na barra de endereço.
 */
export default async function ValidarCertificadoPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const limpo = decodeURIComponent(codigo ?? '').trim().toUpperCase()

  const { data: cert } = await getSupabaseAdmin()
    .from('mtm_certificates')
    .select('codigo, tipo, nome, posicao, emitido_em, tournament_id')
    .eq('codigo', limpo)
    .maybeSingle()

  const { data: torneio } = cert?.tournament_id
    ? await getSupabaseAdmin()
        .from('mtm_tournaments')
        .select('nome')
        .eq('id', cert.tournament_id)
        .maybeSingle()
    : { data: null }

  const titulos: Record<string, string> = {
    participacao: 'Certificado de Participação',
    classificacao: 'Certificado de Classificação',
    desafio: 'Desafio Concluído',
    financiado: 'Trader Financiado',
    payout: 'Certificado de Pagamento',
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A0B0F] px-5 py-16 text-white">
      <div className="w-full max-w-lg">
        <p className="text-center text-xs uppercase tracking-[0.35em] text-[#D2A63C]">More Than Money</p>

        {!cert ? (
          <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-8 text-center">
            <h1 className="text-xl font-semibold">Certificado não encontrado</h1>
            <p className="mt-2 text-sm text-zinc-400">
              O código <span className="font-mono text-zinc-300">{limpo || '—'}</span> não corresponde
              a nenhum certificado emitido pela More Than Money.
            </p>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-[#D2A63C]/30 bg-[#D2A63C]/[0.04] p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#D2A63C]/50 text-[#D2A63C]">
              ✓
            </div>
            <p className="mt-4 text-xs uppercase tracking-widest text-emerald-400">Certificado válido</p>
            <h1 className="mt-3 text-2xl font-bold text-[#D2A63C]">{cert.nome}</h1>
            <p className="mt-2 text-sm text-zinc-300">{titulos[cert.tipo] ?? cert.tipo}</p>
            {torneio?.nome && <p className="mt-1 text-sm text-zinc-400">{torneio.nome}</p>}
            {cert.posicao != null && (
              <p className="mt-3 inline-block rounded-full border border-[#D2A63C]/40 px-4 py-1 text-sm text-[#D2A63C]">
                {cert.posicao}.º lugar
              </p>
            )}
            <p className="mt-6 text-xs text-zinc-500">
              Emitido a{' '}
              {new Date(cert.emitido_em as string).toLocaleDateString('pt-PT', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <p className="mt-1 font-mono text-xs text-zinc-600">{cert.codigo}</p>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-zinc-600">
          <Link href="/mtmfunded/tradingtournament" className="text-[#D2A63C] hover:underline">
            Trading Tournament
          </Link>
          {' · '}
          <Link href="/" className="hover:text-zinc-400">
            morethanmoney.pt
          </Link>
        </p>
      </div>
    </main>
  )
}
