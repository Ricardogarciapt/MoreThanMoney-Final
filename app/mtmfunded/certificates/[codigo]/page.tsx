import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Award, Download, ShieldCheck } from 'lucide-react'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import VitrineCertificados, { type CertificadoVitrine } from '@/components/mtmfunded/vitrine-certificados'

export const dynamic = 'force-dynamic'

const NOMES: Record<string, string> = {
  participacao: 'Certificado de Participação',
  classificacao: 'Certificado de Classificação',
  desafio: 'Desafio Concluído',
  financiado: 'Trader Financiado',
  payout: 'Certificado de Pagamento',
}

/**
 * UM CERTIFICADO, e quem pode fazer o quê com ele.
 *
 * VER é público, e tem de ser: um certificado que exige login para ser verificado não serve
 * para mostrar a um recrutador. DESCARREGAR é só do dono — o PDF tem o nome completo e o
 * documento inteiro, e isso não é para quem escreve um código na barra de endereço.
 *
 * Mostra-se o mínimo: nome, o que foi conquistado, e quando. Nem email, nem número de conta,
 * nem resultado detalhado. Validar não é abrir a ficha da pessoa.
 */
export default async function CertificadoPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const limpo = decodeURIComponent(codigo ?? '').trim().toUpperCase()

  const db = getSupabaseAdmin()
  const { data: cert } = await db
    .from('mtm_certificates')
    .select('codigo, tipo, nome, posicao, detalhe, emitido_em, tournament_id, user_id')
    .eq('codigo', limpo)
    .maybeSingle()

  // Quem está a ver é o dono? Só isso muda: aparece o botão de descarregar.
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  const ehDono = Boolean(cert && user && cert.user_id === user.id)

  const { data: outros } = await db
    .from('mtm_certificates')
    .select('codigo, tipo, nome, emitido_em')
    .neq('codigo', limpo)
    .order('emitido_em', { ascending: false })
    .limit(6)

  const vitrine: CertificadoVitrine[] = (outros ?? []).map((c) => ({
    codigo: c.codigo as string,
    tipo: c.tipo as string,
    nome: c.nome as string,
    emitidoEm: c.emitido_em as string,
  }))

  if (!cert) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-20 text-center text-white">
        <h1 className="text-2xl font-bold">Certificado não encontrado</h1>
        <p className="mt-3 text-sm text-[#a9a49a]">
          O código <span className="font-mono text-zinc-300">{limpo}</span> não corresponde a
          nenhum certificado emitido. Confirma que copiaste o código todo.
        </p>
        <Link href="/mtmfunded/certificates" className="btn mt-8">Procurar outro</Link>
      </main>
    )
  }

  const detalhe = (cert.detalhe ?? {}) as Record<string, unknown>
  const valor = typeof detalhe.valorUsd === 'number' ? detalhe.valorUsd : null

  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-white">
      <div className="vidro destaque p-8 text-center sm:p-12">
        <Award className="mx-auto h-12 w-12 text-[#D2A63C]" />
        <p className="mt-5 text-xs uppercase tracking-[0.25em] text-[#D2A63C]">
          {NOMES[cert.tipo as string] ?? cert.tipo}
        </p>
        <p className="mt-4 text-3xl font-bold sm:text-4xl">{cert.nome}</p>

        {cert.posicao != null && (
          <p className="mt-3 text-lg text-[#eccb78]">{cert.posicao}.º lugar</p>
        )}
        {valor != null && (
          <p className="mt-3 text-lg text-[#eccb78]">
            {valor.toLocaleString('pt-PT', { minimumFractionDigits: 2 })} USD
          </p>
        )}

        <p className="mt-4 text-sm text-[#a9a49a]">
          {new Date(cert.emitido_em as string).toLocaleDateString('pt-PT', {
            day: '2-digit', month: 'long', year: 'numeric',
          })}
        </p>

        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-2 text-sm text-emerald-400">
          <ShieldCheck className="h-4 w-4" /> Certificado válido
        </div>

        <p className="mt-6 font-mono text-xs text-[#7b756a]">{cert.codigo}</p>

        {ehDono ? (
          <a
            href={`/api/mtmfunded/certificado/${cert.codigo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn mt-8"
          >
            <Download className="h-4 w-4" /> Descarregar PDF
          </a>
        ) : (
          <p className="mt-8 text-xs text-[#7b756a]">
            {user
              ? 'Só o titular do certificado o pode descarregar.'
              : 'Se este certificado é teu, entra na tua área para o descarregares.'}
          </p>
        )}
      </div>

      {vitrine.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-6 text-sm uppercase tracking-[0.22em] text-[#7b756a]">
            Outros certificados MTM Funded
          </h2>
          <VitrineCertificados certificados={vitrine} />
        </div>
      )}

      <div className="mt-14 text-center">
        <Link href="/mtmfunded" className="btn g">Conhecer o MTM Funded</Link>
      </div>
    </main>
  )
}
