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
import Link from 'next/link'
import { contextoBackoffice } from '@/lib/backoffice-sessao'
import { pode, PAPEL_NOME, type Capacidade } from '@/lib/backoffice-papeis'

export const dynamic = 'force-dynamic'

/** O menu. Cada entrada declara a capacidade que a torna visível — sem capacidade, não existe. */
const MENU: Array<{ href: string; label: string; exige: Capacidade }> = [
  { href: '/backoffice', label: 'Início', exige: 'bo.entrar' },
  { href: '/backoffice/extracto', label: 'O meu extracto', exige: 'bo.extracto_proprio' },
  { href: '/backoffice/pipeline', label: 'Pipeline', exige: 'bo.pipeline_proprio' },
  { href: '/backoffice/tarefas', label: 'Tarefas', exige: 'bo.tarefas_proprias' },
  { href: '/backoffice/equipa', label: 'A minha equipa', exige: 'bo.equipa_ver' },
  { href: '/backoffice/material', label: 'Materiais', exige: 'bo.material' },
]

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await contextoBackoffice()

  /**
   * O layout NÃO reencaminha. É de propósito: a entrada (`/backoffice`) é justamente a página que
   * quem não tem papéis pode abrir, e um `redirect` aqui reenviava-a para si mesma até o browser
   * desistir. Quem barra as páginas de dentro é o middleware; aqui só se desenha menos.
   *
   * Sem papéis o menu fica vazio e a entrada explica o resto. E o menu ser cortesia, não fechadura,
   * é a razão de cada rota ter o seu `exigirCapacidade`: esconder um link nunca protegeu nada.
   */
  const capacidades = ctx?.capacidades ?? new Set<Capacidade>()
  const visiveis = pode(capacidades, 'bo.entrar') ? MENU.filter((m) => pode(capacidades, m.exige)) : []

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-[#D2A63C]/15">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <span className="text-lg font-bold text-[#D2A63C]">MTM · Backoffice</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            {visiveis.map((m) => (
              <Link key={m.href} href={m.href} className="text-gray-400 transition-colors hover:text-[#D2A63C]">
                {m.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            {ctx?.admin && (
              <span className="rounded-full border border-[#D2A63C]/40 px-2 py-0.5 text-[#D2A63C]">Dono</span>
            )}
            {(ctx?.papeis ?? []).map((p) => (
              <span key={p} className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-300">
                {PAPEL_NOME[p]}
              </span>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
