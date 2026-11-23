/** Lista dos pacotes de conteúdo dos educadores (só admins). Cada um abre a página do pacote. */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { verifyAdminAccess } from '@/lib/admin-api-helpers'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Conteúdo dos educadores', robots: { index: false, follow: false } }

export default async function Page() {
  if (!(await verifyAdminAccess()).isAdmin) notFound()
  const { data } = await getSupabaseAdmin()
    .from('educador_conteudo')
    .select('id, educador, lingua, data, tema, estado, entregue_email_em, entregue_dm_em')
    .order('data', { ascending: false })
    .limit(60)
  return (
    <main className="min-h-screen bg-[#0b0b0d] px-4 py-8 text-neutral-200">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-5 text-2xl font-extrabold text-[#E9C46A]">Conteúdo dos educadores</h1>
        <ul className="space-y-2">
          {(data ?? []).map((l) => (
            <li key={l.id}>
              <Link href={`/educadores/conteudo/${l.id}`} className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-[#D2A63C]">
                <span className="text-xs uppercase tracking-widest text-[#D2A63C]">{l.data} · {l.educador} · {l.lingua} · {l.estado}</span>
                <span className="mt-1 block font-semibold text-white">{l.tema}</span>
                <span className="block text-xs text-neutral-500">e-mail: {l.entregue_email_em ? '✓' : '—'} · DM: {l.entregue_dm_em ? '✓' : '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
