import Link from 'next/link'
import { contextoBackoffice } from '@/lib/backoffice-sessao'
import { GRUPOS_GESTAO, modulosVisiveis } from '@/lib/backoffice-gestao'
import { HojeNaGestao } from '../_partes/hoje-na-gestao'

export const metadata = { title: 'Gestão · Backoffice MoreThanMoney' }

/** A entrada da Gestão: o que pede atenção hoje e, por baixo, os módulos agrupados pelo que servem. */
export default async function GestaoInicio() {
  const ctx = (await contextoBackoffice())!
  const modulos = modulosVisiveis(ctx.capacidades)
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Gestão</h1>
        <p className="mt-1 text-sm text-gray-400">Tudo o que se gere na casa, num sítio só.</p>
      </div>
      <HojeNaGestao capacidades={ctx.capacidades} />
      {GRUPOS_GESTAO.map((g) => {
        const doGrupo = modulos.filter((m) => m.grupo === g)
        if (!doGrupo.length) return null
        return (
          <section key={g}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{g}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {doGrupo.map((m) => (
                <Link key={m.slug} href={`/backoffice/gestao/${m.slug}`} className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-[#D2A63C]/40 hover:bg-[#D2A63C]/[0.03]">
                  <p className="font-semibold text-gray-100 group-hover:text-[#E9C46A]">{m.nome}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-400">{m.descricao}</p>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
