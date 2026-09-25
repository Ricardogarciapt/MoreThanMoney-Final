/**
 * Os blocos que as quatro páginas repetem: cabeçalho, cartão de número, vazio explicado e aviso.
 *
 * Estão juntos por uma razão de honestidade, não de arrumação: o BLOCO VAZIO. Quatro páginas que
 * inventem cada uma a sua maneira de dizer «não há nada» acabam com três a dizê-lo e uma a mostrar
 * uma tabela em branco — e uma tabela em branco lê-se como avaria, não como «ainda não vendeste».
 * Aqui só existe uma forma de mostrar o vazio, e ela obriga a escrever o passo seguinte.
 *
 * O dourado é o `#D2A63C` da marca, como no resto do site.
 */

export function Cabecalho({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">{titulo}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">{sub}</p>
    </div>
  )
}

/**
 * Um número com nome e explicação.
 *
 * `nota` não é decoração: um número sem dizer o que conta é um número que a pessoa interpreta à
 * sorte, e o dinheiro é a pior coisa para se interpretar à sorte. `tom` marca a negativo o que
 * desconta — uma dívida pintada da mesma cor que um ganho lê-se como ganho.
 */
export function Numero({
  nome,
  valor,
  nota,
  tom = 'normal',
}: {
  nome: string
  valor: string
  nota?: string
  tom?: 'normal' | 'destaque' | 'negativo'
}) {
  const cor =
    tom === 'destaque' ? 'text-[#D2A63C]' : tom === 'negativo' ? 'text-red-400' : 'text-white'
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{nome}</div>
      <div className={`mt-1 text-2xl font-bold ${cor}`}>{valor}</div>
      {nota && <div className="mt-1 text-xs leading-relaxed text-gray-500">{nota}</div>}
    </div>
  )
}

/**
 * O VAZIO, dito como um facto e não como uma avaria.
 *
 * `seguinte` é obrigatório de propósito. «Não há tarefas» deixa a pessoa a olhar; «não há tarefas,
 * as tuas aparecem aqui quando o Ricardo as criar» fecha a pergunta. Zero é um resultado legítimo —
 * o que não é legítimo é não se saber se o zero é verdade ou se o ecrã se enganou.
 */
export function Vazio({ titulo, seguinte }: { titulo: string; seguinte: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-800 bg-gray-900/20 p-6 text-center">
      <p className="text-sm font-medium text-gray-300">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-gray-500">{seguinte}</p>
    </div>
  )
}

/** Um aviso que a pessoa precisa de ler para não interpretar mal o que está a ver. */
export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-4 text-sm leading-relaxed text-gray-300">
      {children}
    </div>
  )
}

/** Etiqueta pequena — estados, papéis, origens. */
export function Etiqueta({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'bom' | 'mau' | 'aviso' }) {
  const cor =
    tom === 'bom'
      ? 'border-emerald-700/60 text-emerald-300'
      : tom === 'mau'
        ? 'border-red-800/60 text-red-300'
        : tom === 'aviso'
          ? 'border-[#D2A63C]/50 text-[#D2A63C]'
          : 'border-gray-700 text-gray-400'
  return <span className={`rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${cor}`}>{children}</span>
}

/**
 * Uma falha de leitura, mostrada como falha.
 *
 * O contrário disto — um `catch` que devolve lista vazia — é o defeito que já custou caro nos
 * Alertas de Trading: o ecrã mostrava zeros e a pessoa concluía que não tinha nada, quando o que
 * havia era um erro de servidor. Zero e «não consegui ler» têm de ser dois ecrãs diferentes.
 */
export function Falhou({ oQue, detalhe }: { oQue: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-200">
      <p className="font-medium">{oQue}</p>
      <p className="mt-1 text-xs leading-relaxed text-red-300/70">
        Isto é uma falha de leitura, não um resultado: não estás a ver zeros, estás a ver um erro.
        Recarrega a página e, se continuar, diz ao Ricardo.
      </p>
      {detalhe && <p className="mt-1 font-mono text-[11px] text-red-400/60">{detalhe}</p>}
    </div>
  )
}
