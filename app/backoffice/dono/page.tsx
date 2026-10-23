import Link from 'next/link'
import { GRUPOS_DONO, MODULOS_DONO } from '@/lib/backoffice-dono'

/** A entrada da área do dono: os módulos agrupados pelo que servem, cada um com o seu caminho. */
export default function DonoInicio() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#D2A63C]">Área do dono</h1>
        <p className="mt-1 text-sm text-gray-400">Tudo o que se gere na casa, num sítio só. As moradas antigas do /admin continuam a funcionar.</p>
      </div>
      {GRUPOS_DONO.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODULOS_DONO.filter((m) => m.grupo === g).map((m) => (
              <Link key={m.slug} href={`/backoffice/dono/${m.slug}`} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 transition-colors hover:border-[#D2A63C]/40">
                <p className="font-semibold text-gray-100">{m.nome}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">{m.descricao}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
