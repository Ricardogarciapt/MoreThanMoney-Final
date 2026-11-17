import Link from 'next/link'
import { IDENTIFICACAO, linhaIdentificacao } from '@/lib/legal/identificacao'

/**
 * Invólucro único das páginas legais do site principal (termos, privacidade, aviso de risco).
 * Mesmo estilo e mesma linha de identificação em todas, para não parecerem versões diferentes.
 */
export function PaginaLegal({
  titulo, atualizado, children,
}: { titulo: string; atualizado: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-black">
      <div className="mx-auto max-w-3xl px-5 py-16 text-white">
        <Link href="/" className="text-sm text-[#D2A63C] hover:underline">← Voltar</Link>
        <h1 className="mt-6 text-3xl font-bold sm:text-4xl">{titulo}</h1>
        <p className="mt-2 text-sm text-zinc-500">Última actualização: {atualizado}</p>
        <p className="mt-4 text-xs text-zinc-500">{linhaIdentificacao()}</p>
        <div className="mt-10 space-y-8">{children}</div>
        <nav className="mt-14 flex flex-wrap gap-4 border-t border-zinc-800 pt-6 text-xs text-zinc-500">
          <Link href="/terms" className="hover:text-[#D2A63C]">Termos e Condições</Link>
          <Link href="/privacidade" className="hover:text-[#D2A63C]">Política de Privacidade</Link>
          <Link href="/aviso-de-risco" className="hover:text-[#D2A63C]">Aviso de Risco</Link>
          <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener noreferrer" className="hover:text-[#D2A63C]">
            Livro de Reclamações
          </a>
          <a href={`mailto:${IDENTIFICACAO.email}`} className="hover:text-[#D2A63C]">{IDENTIFICACAO.email}</a>
        </nav>
      </div>
    </main>
  )
}

export function Seccao({ id, titulo, children }: { id?: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id}>
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

export const F = ({ children }: { children: React.ReactNode }) => (
  <b className="text-zinc-200">{children}</b>
)
