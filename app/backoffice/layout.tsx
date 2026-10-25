/**
 * A casca do backoffice da equipa.
 *
 * Componente de SERVIDOR de propósito. O menu é desenhado a partir das capacidades lidas no
 * servidor, por isso o que a pessoa não pode ver não chega ao browser — nem como item cinzento,
 * nem no HTML. Um menu construído no cliente a partir de uma lista de papéis contava-lhe o que
 * existe do outro lado da porta, e tornava «esconder» o mesmo que «proteger», que não é.
 *
 * Esconder não protege nada por si: cada rota tem o seu `exigirCapacidade`. O menu é cortesia; a
 * fechadura está nas rotas.
 */
import Image from 'next/image'
import { contextoBackoffice } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { AREA_GESTAO_NOME, pode, PAPEL_NOME, type Capacidade } from '@/lib/backoffice-papeis'
import { GRUPOS_GESTAO, modulosVisiveis } from '@/lib/backoffice-gestao'
import { MenuBackoffice, type SeccaoMenu } from './_partes/menu'

export const dynamic = 'force-dynamic'

/** O trabalho de cada um. Cada entrada declara a capacidade que a torna visível — sem capacidade, não existe. */
const TRABALHO: Array<{ href: string; label: string; exige: Capacidade }> = [
  { href: '/backoffice', label: 'Hoje', exige: 'bo.entrar' },
  { href: '/backoffice/pipeline', label: 'Pipeline', exige: 'bo.pipeline_proprio' },
  { href: '/backoffice/tarefas', label: 'Tarefas', exige: 'bo.tarefas_proprias' },
  { href: '/backoffice/extracto', label: 'O meu extracto', exige: 'bo.extracto_proprio' },
  { href: '/backoffice/equipa', label: 'A minha equipa', exige: 'bo.equipa_ver' },
  { href: '/backoffice/material', label: 'Materiais', exige: 'bo.material' },
]

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await contextoBackoffice()

  /**
   * A rede de IBs não é um papel do backoffice — é uma relação com uma corretora. Por isso a
   * entrada do menu não se decide por capacidade como as outras: pergunta-se à tabela quem é IB.
   * Mostrar o menu a quem depois leva «esta área não é tua» seria uma porta pintada na parede.
   */
  const ehIb = ctx
    ? Boolean(
        (
          await getSupabaseAdmin()
            .from('ib_membros')
            .select('user_id')
            .eq('user_id', ctx.userId)
            .is('ate', null)
            .maybeSingle()
        ).data,
      ) || ctx.admin
    : false

  /**
   * O layout NÃO reencaminha. É de propósito: a entrada (`/backoffice`) é justamente a página que
   * quem não tem papéis pode abrir, e um `redirect` aqui reenviava-a para si mesma até o browser
   * desistir. Quem barra as páginas de dentro é o middleware; aqui só se desenha menos.
   *
   * O menu é desenhado no servidor a partir das capacidades: o que a pessoa não pode ver não chega
   * ao browser. Mas é cortesia, não fechadura — cada rota tem o seu `exigirCapacidade`.
   */
  const capacidades = ctx?.capacidades ?? new Set<Capacidade>()
  const entra = pode(capacidades, 'bo.entrar')
  const trabalho = entra ? TRABALHO.filter((m) => pode(capacidades, m.exige)).map(({ href, label }) => ({ href, label })) : []
  if (ehIb && entra) trabalho.push({ href: '/backoffice/ib', label: 'Rede de IBs' })

  // A Gestão no mesmo menu, agrupada como na sua entrada: um sítio só para chegar a cada módulo.
  const modulos = entra ? modulosVisiveis(capacidades) : []
  const seccoes: SeccaoMenu[] = [
    { titulo: 'O meu trabalho', itens: trabalho },
    ...(modulos.length
      ? [{ titulo: 'Gestão', itens: [{ href: '/backoffice/gestao', label: 'Visão geral' }] }]
      : []),
    ...GRUPOS_GESTAO.map((g) => ({
      titulo: g,
      itens: modulos.filter((m) => m.grupo === g).map((m) => ({ href: `/backoffice/gestao/${m.slug}`, label: m.nome })),
    })),
  ]

  const etiquetas = [
    ...(ctx?.admin ? ['Dono'] : []),
    ...(ctx?.papeis ?? []).map((p) => PAPEL_NOME[p]),
    ...(ctx && !ctx.admin ? ctx.gestao.map((a) => AREA_GESTAO_NOME[a]) : []),
  ]

  return (
    <div className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-4 lg:flex-row lg:py-6">
        <aside className="shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-60 lg:overflow-y-auto">
          <a href="/backoffice" className="mb-3 flex items-center gap-2.5 lg:mb-6">
            <Image src="/logo-mtm-transparent.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-wide text-[#D2A63C]">MoreThanMoney</span>
              <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-500">Backoffice</span>
            </span>
          </a>
          {entra && <MenuBackoffice seccoes={seccoes} />}
          {etiquetas.length > 0 && (
            <div className="mt-6 hidden flex-wrap gap-1.5 border-t border-white/[0.06] pt-4 lg:flex">
              {etiquetas.map((e) => (
                <span key={e} className={`rounded-full border px-2 py-0.5 text-[10.5px] ${e === 'Dono' ? 'border-[#D2A63C]/40 text-[#D2A63C]' : 'border-zinc-700 text-zinc-300'}`}>
                  {e}
                </span>
              ))}
            </div>
          )}
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl has-[[data-largo]]:max-w-none">{children}</div>
        </main>
      </div>
    </div>
  )
}
