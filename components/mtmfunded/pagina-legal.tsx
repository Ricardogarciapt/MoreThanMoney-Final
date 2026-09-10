/**
 * O invólucro das páginas legais do MTM Funded.
 *
 * Um só, para que os quatro documentos digam as coisas da mesma maneira e com a mesma data
 * de actualização à vista. Documentos legais espalhados por páginas com estilos diferentes
 * parecem — e às vezes são — versões diferentes.
 */
export function PaginaLegal({
  titulo, atualizado, children,
}: { titulo: string; atualizado: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-white">
      <h1 className="text-3xl font-bold sm:text-4xl">{titulo}</h1>
      <p className="mt-2 text-sm text-zinc-500">Última actualização: {atualizado}</p>
      <div className="mt-10 space-y-8">{children}</div>
    </main>
  )
}

export function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#D2A63C]">{titulo}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  )
}

export function Lista({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ul className="ml-4 list-disc space-y-2">
      {itens.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
