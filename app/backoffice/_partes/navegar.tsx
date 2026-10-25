/**
 * OS CONTROLOS DE LISTA das páginas do backoffice: virar a página e filtrar.
 *
 * São `<form method="get">` e `<a>`, sem uma linha de JavaScript. Não é minimalismo: as páginas do
 * backoffice são componentes de servidor, e um filtro em estado de cliente obrigava a transformar
 * cada uma delas numa página que busca dados pela rede depois de carregar — com o ecrã a piscar,
 * um segundo caminho de leitura para manter, e o âmbito a ter de ser verificado outra vez. Com o
 * filtro no endereço, o servidor já recebe a pergunta certa, a leitura é a mesma de sempre, e o
 * estado da lista é partilhável: quem estiver ao telefone com o Ricardo pode mandar-lhe o link.
 *
 * E o mais importante: o número de linhas que se mostra deixa de ser um limite silencioso. Estes
 * controlos existem para que «há mais» seja uma frase e um botão, em vez de um limite de 500 linhas
 * que ninguém vê.
 */
import { descreverPagina, enderecoDaPagina, type Pagina } from '@/lib/backoffice-paginacao'

export type Params = Record<string, string | string[] | undefined>

/**
 * O rodapé de uma lista: onde estou, e como vou para a página seguinte.
 *
 * `haMais` vem da linha extra que a leitura pede sempre — nunca de uma conta feita no ecrã.
 */
export function Paginacao({
  base,
  params,
  pagina,
  mostradas,
  haMais,
}: {
  base: string
  params: Params
  pagina: Pagina
  mostradas: number
  haMais: boolean
}) {
  // Sem página anterior nem seguinte não há nada para navegar — e um rodapé com dois botões mortos
  // faz a pessoa clicar para confirmar que estão mortos.
  if (pagina.pagina === 1 && !haMais) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
      <span className="text-xs text-zinc-500">{descreverPagina(pagina, mostradas, haMais)}</span>
      <div className="flex gap-2">
        {pagina.pagina > 1 && (
          <a
            href={enderecoDaPagina(base, params, pagina.pagina - 1)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
          >
            ← Anteriores
          </a>
        )}
        {haMais && (
          <a
            href={enderecoDaPagina(base, params, pagina.pagina + 1)}
            className="rounded-lg border border-[#D2A63C]/50 px-3 py-1.5 text-xs text-[#D2A63C] hover:bg-[#D2A63C]/10"
          >
            Seguintes →
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * Uma barra de filtros. `campos` são os controlos; o botão de limpar só aparece quando há algo
 * para limpar — um «limpar» permanentemente aceso não diz se o que se está a ver está filtrado.
 */
export function Filtros({
  base,
  activo,
  children,
}: {
  base: string
  activo: boolean
  children: React.ReactNode
}) {
  return (
    <form method="get" action={base} className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.06] bg-zinc-950/70 p-4">
      {children}
      <button
        type="submit"
        className="rounded-lg bg-[#D2A63C] px-4 py-2 text-xs font-semibold text-zinc-950 transition-opacity hover:opacity-90"
      >
        Filtrar
      </button>
      {activo && (
        <a href={base} className="px-2 py-2 text-xs text-zinc-400 underline hover:text-zinc-200">
          limpar
        </a>
      )}
    </form>
  )
}

/** Um campo de filtro com etiqueta. A etiqueta é obrigatória: um campo sem nome adivinha-se. */
export function Campo({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-500">
      <span className="uppercase tracking-wide">{nome}</span>
      {children}
    </label>
  )
}

/** O aspecto comum dos controlos, para não haver três caixas de texto diferentes em três páginas. */
export const ESTILO_CAMPO =
  'rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#D2A63C] focus:outline-none'
