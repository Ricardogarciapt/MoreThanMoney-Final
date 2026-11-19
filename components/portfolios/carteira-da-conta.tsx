"use client"

/**
 * A CARTEIRA DA CONTA — o que a conta real tem hoje, activo a activo.
 *
 * 19/11 (pedido do Ricardo): a /portfolios mostrava a lista do PLANO e a conta não batia com ela.
 * Esta tabela lê o mesmo registo que o DCA de sexta escreve (`portefolio_movimentos`), marcado ao
 * preço de `portfolio_cotacoes` de 15 em 15 minutos. Investido = compras − vendas de cada activo.
 */

export interface PosicaoDaConta {
  symbol: string
  unidades: number
  investido: number
  preco: number | null
  valor: number | null
  peso: number | null
}

const usd = (v: number | null | undefined, casas = 2) =>
  v == null ? "—" : `$${v.toLocaleString("pt-PT", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`

const nome = (s: string) => s.replace(/USDT$/, "")

function quando(iso: string | null | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })
}

export default function CarteiraDaConta({
  posicoes,
  caixa,
  valorEm,
  dca,
}: {
  posicoes: PosicaoDaConta[]
  caixa: number
  valorEm?: string | null
  dca?: string
}) {
  if (!posicoes?.length) return null
  const em = quando(valorEm)
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[#D2A63C]/20 bg-black/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-[#E9C46A]">Carteira da conta, hoje</div>
          <div className="text-[11px] text-gray-500">
            {dca ? `${dca} · ` : ""}reforço automático às sextas{em ? ` · preços de ${em}` : ""}
          </div>
        </div>
        {caixa > 0 && <div className="text-[11px] text-gray-400">Caixa {usd(caixa)}</div>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Activo</th>
              <th className="px-3 py-2 text-right font-medium">Unidades</th>
              <th className="px-3 py-2 text-right font-medium">Investido</th>
              <th className="px-3 py-2 text-right font-medium">Preço</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 text-right font-medium">Peso</th>
            </tr>
          </thead>
          <tbody>
            {posicoes.map((p) => {
              const res = p.valor == null || p.investido <= 0 ? null : (p.valor - p.investido) / p.investido
              return (
                <tr key={p.symbol} className="border-t border-white/5">
                  <td className="px-4 py-2 font-semibold text-gray-200">{nome(p.symbol)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{p.unidades.toLocaleString("pt-PT", { maximumFractionDigits: 4 })}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{usd(p.investido)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{usd(p.preco, p.preco != null && p.preco < 1 ? 4 : 2)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-gray-100">{usd(p.valor)}</span>
                    {res != null && (
                      <span className={`ml-1.5 ${res >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {res >= 0 ? "+" : ""}{(res * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400">{p.peso == null ? "—" : `${p.peso.toLocaleString("pt-PT")}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-white/5 px-4 py-2 text-[10px] text-gray-500">
        Conteúdo educativo, não constitui consultoria financeira. Resultados passados não garantem resultados futuros.
      </p>
    </div>
  )
}
