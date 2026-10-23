'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { moduloDono } from '@/lib/backoffice-dono'

/**
 * O ecrã de um módulo do dono. Os componentes são os MESMOS do /admin — importados, não copiados —
 * e carregam só quando o módulo abre (um `dynamic` por módulo), por isso abrir a Agenda não descarrega
 * o centro de contas inteiro.
 */
const carregar = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
  </div>
)
const op = { ssr: false, loading: carregar }

const ECRAS: Record<string, React.ComponentType> = {
  contas: dynamic(() => import('@/app/admin/centro/page'), op),
  agenda: dynamic(() => import('@/components/admin/agenda-admin'), op),
  'whatsapp:conversas': dynamic(() => import('@/components/admin/whatsapp-crm'), op),
  'whatsapp:escrever': dynamic(() => import('@/app/admin/whatsapp/page'), op),
  leads: dynamic(() => import('@/app/admin/social/leads/page'), op),
  formularios: dynamic(() => import('@/app/admin/forms/page'), op),
  trafego: dynamic(() => import('@/components/admin/trafego-painel'), op),
  cupoes: dynamic(() => import('@/app/admin/coupons/page'), op),
  'agentes:painel': dynamic(() => import('@/components/admin/agentes-equipa'), op),
  'agentes:arvore': dynamic(() => import('@/app/admin/agentes/page'), op),
  gestao: dynamic(() => import('@/app/dashboard-gestao/page'), op),
}

export default function Modulo({ slug }: { slug: string }) {
  const m = moduloDono(slug)!
  const sp = useSearchParams()
  const router = useRouter()
  const caminho = usePathname() ?? ''
  const vista = m.vistas ? (m.vistas.find((v) => v.id === sp.get('v'))?.id ?? m.vistas[0].id) : null
  const Ecra = ECRAS[vista ? `${slug}:${vista}` : slug]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-100">{m.nome}</h1>
        {m.vistas && (
          <div className="flex gap-1 rounded-lg border border-gray-800 p-0.5 text-xs">
            {m.vistas.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => router.replace(`${caminho}?v=${v.id}`, { scroll: false })}
                className={`rounded-md px-2.5 py-1 ${v.id === vista ? 'bg-[#D2A63C]/15 text-[#E9C46A]' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {v.nome}
              </button>
            ))}
          </div>
        )}
        {m.antigo && (
          <Link href={`https://www.morethanmoney.pt${m.antigo}`} className="ml-auto text-[11px] text-gray-600 hover:text-gray-400">
            morada antiga ↗
          </Link>
        )}
      </div>
      {/* translateZ(0) faz desta caixa o contentor dos `fixed` dos ecrãs antigos (fundos, ajudas): ficam
          dentro do módulo em vez de taparem o cabeçalho do backoffice. */}
      <div className="overflow-hidden rounded-xl border border-gray-800 [transform:translateZ(0)]">
        <Ecra />
      </div>
    </div>
  )
}
