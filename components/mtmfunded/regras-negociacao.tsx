/**
 * As regras de NEGOCIAÇÃO, à vista e sem eufemismos.
 *
 * Separadas em duas colunas de propósito: o que é medido pela plataforma e o que é verificado
 * na revisão de quem passa. Um regulamento que apresenta tudo como automático dá a ideia de
 * que o resto não é fiscalizado — e depois um trader que passou vê a conta anulada por uma
 * regra que julgava decorativa. Dizer qual é qual é mais honesto e evita a discussão.
 */

export interface RegrasNegociacao {
  tempo_minimo_seg?: number
  noticias_permitidas?: boolean
  ea_na_avaliacao?: boolean
  ea_na_financiada?: boolean
  copytrading?: string
  hedge_permitido?: boolean
  max_posicoes_par_direcao?: number
  risco_max_pct?: number
}

export function RegrasDeNegociacao({ r, cor = '#D2A63C' }: { r: RegrasNegociacao; cor?: string }) {
  const linhas: Array<{ titulo: string; texto: string; permitido: boolean }> = []

  if (r.tempo_minimo_seg) {
    linhas.push({
      permitido: false,
      titulo: `Mínimo de ${Math.round(r.tempo_minimo_seg / 60)} minutos por operação`,
      texto:
        'Abrir e fechar em segundos não é negociar: é apanhar uma oscilação de spread. Operações abaixo deste tempo não contam para o resultado.',
    })
  }
  if (r.risco_max_pct) {
    linhas.push({
      permitido: false,
      titulo: `Risco máximo de ${r.risco_max_pct}% por operação`,
      texto:
        'Sobre o saldo da conta, em todos os tamanhos — numa conta de 3.000 USD são 45 USD por operação. É o que distingue gerir risco de atirar a moeda ao ar.',
    })
  }
  if (r.max_posicoes_par_direcao) {
    linhas.push({
      permitido: false,
      titulo: `Máximo de ${r.max_posicoes_par_direcao} posições no mesmo par e direcção`,
      texto:
        'Três entradas no mesmo sítio são uma posição repartida. À quarta, deixa de ser gestão e passa a ser reforço de uma aposta que correu mal.',
    })
  }
  if (r.hedge_permitido === false) {
    linhas.push({
      permitido: false,
      titulo: 'Sem hedge',
      texto:
        'Nada de posições opostas no mesmo instrumento, na mesma conta ou entre contas. Congela o resultado sem o resolver, e serve sobretudo para contornar limites de perda.',
    })
  }
  if (r.ea_na_financiada === false) {
    linhas.push({
      permitido: false,
      titulo: r.ea_na_avaliacao ? 'EAs na avaliação, não na conta financiada' : 'Sem EAs',
      texto: r.ea_na_avaliacao
        ? 'Podes usar robôs para passar a avaliação. Na conta financiada, não: o que se financia é o teu critério, e é por ele que respondes.'
        : 'Robôs de negociação não são permitidos.',
    })
  }
  if (r.copytrading === 'mtm_auto') {
    linhas.push({
      permitido: false,
      titulo: 'Copytrading só pelo MTM Auto',
      texto:
        'Copiar sinais de fora não mostra nada sobre quem os copia. Sincronizado com o MTM Auto é permitido, porque aí a origem e a gestão são conhecidas.',
    })
  }
  if (r.noticias_permitidas) {
    linhas.push({
      permitido: true,
      titulo: 'Negociar em notícias é permitido',
      texto:
        'Sem janelas fechadas à volta de indicadores. O mercado é o que é a essa hora, e saber negociá-lo faz parte do que se avalia.',
    })
  }

  if (!linhas.length) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {linhas.map((l) => (
        <div
          key={l.titulo}
          className={`rounded-xl border p-4 ${
            l.permitido ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-zinc-800 bg-zinc-950/50'
          }`}
        >
          <p className="text-sm font-semibold" style={{ color: l.permitido ? '#34d399' : cor }}>
            {l.permitido ? '✓ ' : ''}
            {l.titulo}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{l.texto}</p>
        </div>
      ))}
    </div>
  )
}
