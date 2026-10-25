import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { diaEmLisboa } from '@/lib/backoffice-dia-regras'
import { pode, type Capacidade } from '@/lib/backoffice-papeis'

/**
 * HOJE NA GESTÃO — o que pede atenção agora, contado na base, com o caminho para o resolver.
 *
 * É a linha de trabalho de quem gere (e não vende): marcações de hoje, conversas por responder,
 * comentários e formulários que entraram nas últimas 24 h, negócios novos no pipeline, cupões a
 * expirar. Só aparecem os cartões das áreas que a pessoa pode abrir — os mesmos `exige` do menu.
 *
 * Cada contagem é um `head: true` (só o número, sem linhas): abrir esta página não arrasta tabelas.
 * Uma contagem que falhe mostra «—», nunca 0: zero é uma afirmação, «não consegui ler» é outra.
 */
type Cartao = { titulo: string; valor: number | null; nota: string; href: string; urgente?: boolean }

export async function HojeNaGestao({ capacidades }: { capacidades: ReadonlySet<Capacidade> }) {
  const db = getSupabaseAdmin()
  const crm = pode(capacidades, 'bo.gestao_crm')
  const comercial = pode(capacidades, 'bo.gestao_comercial')
  if (!crm && !comercial) return null

  const hoje = diaEmLisboa()
  // A meia-noite de Lisboa em UTC: o desvio do dia (0 no inverno, 1 no verão) lido ao meio-dia.
  const desvio = Number(new Date(`${hoje}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'Europe/Lisbon', hour: '2-digit', hour12: false })) - 12
  const inicioDia = new Date(Date.parse(`${hoje}T00:00:00Z`) - desvio * 3_600_000)
  const fimDia = new Date(inicioDia.getTime() + 24 * 3_600_000)
  const h24 = new Date(Date.now() - 86_400_000).toISOString()
  const em7 = new Date(Date.now() + 7 * 86_400_000).toISOString()

  const contar = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const r = await q
      return r.error ? null : r.count ?? 0
    } catch {
      return null
    }
  }
  const n = (t: string) => db.from(t).select('*', { count: 'exact', head: true })

  const [marcacoes, porResponder, ig, forms, negocios, cupoes] = await Promise.all([
    crm ? contar(n('agenda_marcacoes').gte('inicio', inicioDia.toISOString()).lt('inicio', fimDia.toISOString()).not('estado', 'in', '(cancelada,cancelado)')) : null,
    crm ? contar(n('whatsapp_conversas').gt('por_responder', 0)) : null,
    crm ? contar(n('ig_leads').gte('created_at', h24)) : null,
    crm ? contar(n('form_submissions').gte('created_at', h24)) : null,
    crm || comercial ? contar(n('vendas_negocios').gte('criado_em', h24)) : null,
    comercial ? contar(n('coupons').eq('is_active', true).not('valid_until', 'is', null).lte('valid_until', em7).gte('valid_until', new Date().toISOString())) : null,
  ])

  const cartoes: Cartao[] = [
    ...(crm
      ? [
          { titulo: 'Marcações hoje', valor: marcacoes, nota: 'chamadas na agenda própria', href: '/backoffice/gestao/agenda' },
          { titulo: 'WhatsApp por responder', valor: porResponder, nota: 'conversas à espera de nós', href: '/backoffice/gestao/whatsapp', urgente: (porResponder ?? 0) > 0 },
          { titulo: 'Comentários Instagram · 24 h', valor: ig, nota: 'palavras-chave apanhadas pelo funil', href: '/backoffice/gestao/leads' },
          { titulo: 'Formulários · 24 h', valor: forms, nota: 'submissões — já entram no pipeline', href: '/backoffice/gestao/formularios' },
        ]
      : []),
    { titulo: 'Negócios novos · 24 h', valor: negocios, nota: 'entradas no CRM, de todas as fontes', href: pode(capacidades, 'bo.pipeline_proprio') ? '/backoffice/pipeline' : '/backoffice/gestao/trafego' },
    ...(comercial
      ? [{ titulo: 'Cupões a expirar · 7 dias', valor: cupoes, nota: 'activos com validade a acabar', href: '/backoffice/gestao/cupoes' }]
      : []),
  ]

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Hoje na casa</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cartoes.map((c) => (
          <Link
            key={c.titulo}
            href={c.href}
            className={`rounded-xl border p-3 transition-colors hover:border-[#D2A63C]/50 ${c.urgente ? 'border-amber-400/40 bg-amber-400/[0.05]' : 'border-white/[0.07] bg-white/[0.02]'}`}
          >
            <p className="text-[11px] text-zinc-400">{c.titulo}</p>
            <p className={`mt-1 text-2xl font-bold ${c.urgente ? 'text-amber-300' : 'text-[#E9C46A]'}`}>{c.valor == null ? '—' : c.valor}</p>
            <p className="mt-0.5 text-[10.5px] text-zinc-500">{c.nota}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
