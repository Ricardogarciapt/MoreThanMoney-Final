'use client'

import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { moduloGestao } from '@/lib/backoffice-gestao'

/**
 * O ecrã de um módulo da Gestão. Os componentes são os MESMOS do /admin — importados, não copiados —
 * e carregam só quando o módulo abre (um `dynamic` por módulo), por isso abrir a Agenda não descarrega
 * o centro de contas inteiro.
 */
const carregar = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
  </div>
)

const CuponsSemGuarda = dynamic(() => import('@/components/admin/cupoes-admin'), { ssr: false, loading: carregar })

const ECRAS: Record<string, React.ComponentType> = {
  contas: dynamic(() => import('@/app/admin/centro/page'), { ssr: false, loading: carregar }),
  telegram: dynamic(() => import('@/components/admin/telegram-painel'), { ssr: false, loading: carregar }),
  agenda: dynamic(() => import('@/components/admin/agenda-admin'), { ssr: false, loading: carregar }),
  'whatsapp:conversas': dynamic(() => import('@/components/admin/whatsapp-crm'), { ssr: false, loading: carregar }),
  'whatsapp:escrever': dynamic(() => import('@/app/admin/whatsapp/page'), { ssr: false, loading: carregar }),
  leads: dynamic(() => import('@/app/admin/social/leads/page'), { ssr: false, loading: carregar }),
  formularios: dynamic(() => import('@/components/admin/formularios-admin'), { ssr: false, loading: carregar }),
  trafego: dynamic(() => import('@/components/admin/trafego-painel'), { ssr: false, loading: carregar }),
  'marketing:assistente': dynamic(() => import('@/components/admin/marketing/assistente'), { ssr: false, loading: carregar }),
  'marketing:estudio': dynamic(() => import('@/components/admin/marketing/estudio'), { ssr: false, loading: carregar }),
  'marketing:marca': dynamic(() => import('@/components/admin/marketing/marca'), { ssr: false, loading: carregar }),
  'marketing:rascunhos': dynamic(() => import('@/components/admin/marketing/rascunhos'), { ssr: false, loading: carregar }),
  // O portão do /admin/coupons é «só admin»; aqui quem guarda é a página no servidor (`exige`).
  cupoes: () => <CuponsSemGuarda guarda={false} />,
  'agentes:painel': dynamic(() => import('@/components/admin/agentes-equipa'), { ssr: false, loading: carregar }),
  'agentes:arvore': dynamic(() => import('@/app/admin/agentes/page'), { ssr: false, loading: carregar }),
  'agentes:orcamento': dynamic(() => import('@/components/admin/agentes-orcamento'), { ssr: false, loading: carregar }),
  'agentes:programacao': dynamic(() => import('@/components/admin/agentes-programacao'), { ssr: false, loading: carregar }),
  'agentes:ordens': dynamic(() => import('@/components/admin/agentes-ordens'), { ssr: false, loading: carregar }),
  dashboard: dynamic(() => import('@/app/dashboard-gestao/page'), { ssr: false, loading: carregar }),
  'acessos:gestao': dynamic(() => import('@/components/admin/gestao-acessos'), { ssr: false, loading: carregar }),
  'acessos:papeis': dynamic(() => import('@/components/admin/backoffice-equipa'), { ssr: false, loading: carregar }),
}

export default function Modulo({ slug }: { slug: string }) {
  const m = moduloGestao(slug)!
  const sp = useSearchParams()
  const router = useRouter()
  const caminho = usePathname() ?? ''
  const vista = m.vistas ? (m.vistas.find((v) => v.id === sp.get('v'))?.id ?? m.vistas[0].id) : null
  const Ecra = ECRAS[vista ? `${slug}:${vista}` : slug]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Gestão · {m.grupo}</p>
          <h1 className="text-lg font-semibold text-gray-100">{m.nome}</h1>
        </div>
        {m.vistas && (
          <div className="ml-auto flex gap-1 rounded-lg border border-white/[0.08] p-0.5 text-xs">
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
      </div>
      {/* translateZ(0) faz desta caixa o contentor dos `fixed` dos ecrãs antigos (fundos, ajudas): ficam
          dentro do módulo em vez de taparem o menu do backoffice. */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] [transform:translateZ(0)]">
        <Ecra />
      </div>
    </div>
  )
}
