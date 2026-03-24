/**
 * Aviso legal exibido quando a transmissão está marcada como ao vivo (is_live).
 */
export default function LiveFinancialDisclaimer() {
  return (
    <div
      role="note"
      className="rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-3 text-[11px] leading-relaxed text-amber-100/90"
    >
      <p className="font-semibold text-amber-200/95 mb-2 uppercase tracking-wide text-[10px]">
        Aviso — natureza educativa do conteúdo
      </p>
      <p className="mb-2">
        Todo o conteúdo disponibilizado tem caráter estritamente <strong>educativo e informativo</strong>. Não constitui
        consultoria financeira, aconselhamento de investimento ou recomendação de compra ou venda de ativos.
      </p>
      <p className="mb-2">
        As informações são baseadas em pesquisas e análises que podem não estar atualizadas ou completas. A
        rentabilidade passada <strong>não representa garantia de resultados futuros</strong>.
      </p>
      <p>
        As decisões financeiras são da <strong>exclusiva responsabilidade do utilizador</strong>. O autor e este site não
        assumem responsabilidade por perdas diretas ou indiretas decorrentes da utilização destas informações.
        Recomenda-se a consulta a um <strong>consultor financeiro qualificado</strong> antes de qualquer decisão de
        investimento.
      </p>
    </div>
  )
}
