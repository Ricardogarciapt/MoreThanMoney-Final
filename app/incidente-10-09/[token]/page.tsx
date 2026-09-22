import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import Formulario from './formulario'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Incidente de 10/09 · A tua resposta', robots: { index: false, follow: false } }

export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valido = /^[A-Za-z0-9_-]{16,64}$/.test(token)
  const { data } = valido
    ? await getSupabaseAdmin().from('incidente_10_09_respostas')
      .select('nome, idioma, capital_usd, decisao, opcao_pu_prime, comentario, respondido_em').eq('token', token).maybeSingle()
    : { data: null }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-10 text-[#f3efe6]">
      <div className="mx-auto max-w-xl">
        <img src="/logo-mf-gold.png" alt="MoreThanMoney" className="mx-auto mb-8 h-auto w-40" />
        {data ? (
          <Formulario token={token} inicial={data} />
        ) : (
          <div className="rounded-2xl border border-[#D2A63C]/30 bg-[#141414] p-6 text-center">
            <p className="text-lg font-semibold">Link inválido ou expirado</p>
            <p className="mt-2 text-sm text-[#bdb6a6]">Responde ao email que recebeste ou escreve para geral@morethanmoney.pt.</p>
          </div>
        )}
      </div>
    </main>
  )
}
