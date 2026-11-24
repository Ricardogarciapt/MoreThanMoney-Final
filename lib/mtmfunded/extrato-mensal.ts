/**
 * EXTRATO MENSAL DE CONTA — o email que as corretoras mandam, na língua e no tom da casa.
 *
 * Puro: sem rede, sem base, sem transporte. Recebe o resumo que `mtm_funded_extrato` devolve
 * (migração 287) e devolve assunto e HTML. O envio e a escolha das contas ficam em
 * `./extrato-mensal-envio.ts`.
 *
 * Regras que o texto cumpre:
 *  · Conta simulada (MTM Funded) NÃO é prop firm nem conta real. O aviso diz isso em cada extrato.
 *  · Nenhum número inventado: tudo vem da base. Sem histórico, a linha não aparece.
 *  · Nunca se promete retorno. O rodapé diz que resultados passados não garantem futuros.
 *  · PT-PT, «tu», ouro sobre carvão (#D2A63C / #E9C46A sobre fundo quase preto).
 */

/** Resumo de uma conta num período, tal como `mtm_funded_extrato` o devolve. */
export interface DadosExtrato {
  conta_id: string
  etiqueta: string | null
  tipo: string
  capital_inicial: number
  saldo_inicio: number
  resultado: number
  comissoes: number
  ajustes: number
  levantamentos: number
  saldo_fim: number
  saldo_atual: number | null
  equity_atual: number | null
  pico_equity: number | null
  abertas_agora: number
  operacoes: number
  ganhos: number
  perdas: number
  ganho_bruto: number
  perda_bruta: number
  melhor: number | null
  pior: number | null
  diferenca_conciliacao: number
  conciliado: boolean
}

export interface PeriodoExtrato {
  ano: number
  mes: number
}

/** Como se apresenta cada tipo de conta. Um tipo novo entra aqui, e só aqui. */
export const ROTULO_TIPO: Record<string, { nome: string; aviso: string }> = {
  financiada: {
    nome: 'MTM Funded',
    aviso:
      'Conta simulada. Não é uma conta real nem uma prop firm: é uma conta de Patrocínio de Desempenho MTM, com capital simulado. Os valores acima são simulados.',
  },
  real: {
    nome: 'Conta real',
    aviso: 'Conta com capital real acompanhada pela MTM. Os valores vêm do registo de movimentos da conta.',
  },
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function nomeDoMes(periodo: PeriodoExtrato): string {
  return MESES[periodo.mes - 1] ?? ''
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** Dinheiro em PT-PT: 1 234,56 $. Negativo com sinal de menos. */
export function fmtDolar(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const sinal = n < 0 && Math.abs(n) >= 0.005 ? '−' : ''
  return `${sinal}${abs} $`
}

/** Valor com sinal explícito (+/−) para movimentos. Zero fica sem sinal. */
function fmtMovimento(n: number): string {
  if (Math.abs(n) < 0.005) return fmtDolar(0)
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
}

function taxaGanho(d: DadosExtrato): string {
  if (!d.operacoes) return '—'
  return `${Math.round((d.ganhos / d.operacoes) * 100)} %`
}

function fatorLucro(d: DadosExtrato): string {
  if (!d.perda_bruta) return '—'
  return (d.ganho_bruto / Math.abs(d.perda_bruta)).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function assuntoDoExtrato(d: DadosExtrato, periodo: PeriodoExtrato): string {
  const etiqueta = d.etiqueta?.trim() || 'a tua conta'
  return `Extrato ${nomeDoMes(periodo)} ${periodo.ano} · ${etiqueta}`
}

function linha(rotulo: string, valor: string, destaque = false): string {
  const cor = destaque ? '#E9C46A' : '#d6d6d6'
  const peso = destaque ? '700' : '400'
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #2a2a2a;color:#a8a8a8;font-size:14px;">${rotulo}</td>
    <td align="right" style="padding:9px 0;border-bottom:1px solid #2a2a2a;color:${cor};font-weight:${peso};font-size:14px;font-variant-numeric:tabular-nums;">${valor}</td>
  </tr>`
}

function bloco(titulo: string, corpo: string): string {
  return `<tr><td style="padding:22px 28px 6px 28px;">
    <div style="color:#D2A63C;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;margin-bottom:8px;">${titulo}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${corpo}</table>
  </td></tr>`
}

export interface OpcoesExtrato {
  site: string
  logo: string
  /** Primeiro nome, se o houver. Sem nome, a saudação é neutra. */
  nome?: string | null
}

/**
 * Monta o email. O HTML usa tabelas e estilos em linha, para o Gmail e o Outlook não o estragarem.
 * O logo vem por `opts.logo` (CID inline, ver `mail-transport.ts`).
 */
export function montarExtratoEmail(
  d: DadosExtrato,
  periodo: PeriodoExtrato,
  opts: OpcoesExtrato,
): { assunto: string; html: string } {
  const rotulo = ROTULO_TIPO[d.tipo] ?? { nome: 'Conta', aviso: '' }
  const etiqueta = d.etiqueta?.trim() || 'Conta'
  const mes = nomeDoMes(periodo)
  const saudacao = opts.nome?.trim() ? `Olá, ${esc(opts.nome.trim())}.` : 'Olá.'

  const saldo = bloco(
    'Saldo do mês',
    [
      linha('Saldo de abertura', fmtDolar(d.saldo_inicio)),
      linha('Resultado das operações', fmtMovimento(d.resultado)),
      linha('Comissões', fmtMovimento(d.comissoes)),
      linha('Ajustes', fmtMovimento(d.ajustes)),
      d.levantamentos ? linha('Levantamentos', fmtMovimento(d.levantamentos)) : '',
      linha('Saldo de fecho', fmtDolar(d.saldo_fim), true),
    ].join(''),
  )

  const atividade = bloco(
    'Atividade',
    [
      linha('Operações fechadas', String(d.operacoes)),
      linha('Ganhos / perdas', `${d.ganhos} / ${d.perdas}`),
      linha('Taxa de ganho', taxaGanho(d)),
      linha('Fator de lucro', fatorLucro(d)),
      d.melhor != null ? linha('Melhor operação', fmtMovimento(d.melhor)) : '',
      d.pior != null ? linha('Pior operação', fmtMovimento(d.pior)) : '',
      linha('Posições abertas agora', String(d.abertas_agora)),
    ].join(''),
  )

  const situacao = bloco(
    'À data deste envio',
    [
      linha('Saldo atual', fmtDolar(d.saldo_atual)),
      linha('Equidade', fmtDolar(d.equity_atual)),
      linha('Pico de equidade', fmtDolar(d.pico_equity)),
    ].join(''),
  )

  const conciliacao = d.conciliado
    ? `<p style="margin:14px 0 0 0;color:#7d7d7d;font-size:12px;">Saldo conferido com o registo de movimentos da conta.</p>`
    : ''

  return {
    assunto: assuntoDoExtrato(d, periodo),
    html: `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Extrato ${esc(mes)} ${periodo.ano}</title></head>
<body style="margin:0;padding:0;background:#080808;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#080808;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#121212;border:1px solid #2a2a2a;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">

<tr><td style="padding:26px 28px 18px 28px;border-bottom:1px solid #2a2a2a;background:linear-gradient(135deg,#171717,#0e0e0e);">
  <img src="${opts.logo}" alt="MoreThanMoney" width="150" style="display:block;width:150px;height:auto;border:0;margin-bottom:18px;">
  <div style="color:#D2A63C;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;">Extrato mensal · ${esc(rotulo.nome)}</div>
  <div style="color:#E9C46A;font-size:24px;font-weight:700;margin-top:6px;">${esc(etiqueta)}</div>
  <div style="color:#a8a8a8;font-size:14px;margin-top:4px;">${esc(mes.charAt(0).toUpperCase() + mes.slice(1))} de ${periodo.ano}</div>
</td></tr>

<tr><td style="padding:22px 28px 4px 28px;color:#d6d6d6;font-size:15px;line-height:1.6;">
  <p style="margin:0 0 10px 0;">${saudacao}</p>
  <p style="margin:0;">Aqui está o resumo da tua conta em ${esc(mes)}. Cada número sai do registo de movimentos, sem arredondamentos à mão.</p>
</td></tr>

${saldo}
${atividade}
${situacao}

<tr><td style="padding:22px 28px 8px 28px;">
  <a href="${opts.site}/mtmfunded" style="display:inline-block;background:#D2A63C;color:#0b0b0b;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">Ver a minha conta</a>
  ${conciliacao}
</td></tr>

<tr><td style="padding:18px 28px 26px 28px;border-top:1px solid #2a2a2a;color:#7d7d7d;font-size:12px;line-height:1.6;">
  ${esc(rotulo.aviso)}
  <p style="margin:10px 0 0 0;">Conteúdo educativo. Resultados passados não garantem resultados futuros, e nada aqui é uma promessa de lucro.</p>
  <p style="margin:10px 0 0 0;color:#5f5f5f;">MoreThanMoney · <a href="${opts.site}" style="color:#7d7d7d;">morethanmoney.pt</a></p>
</td></tr>

</table>
</td></tr></table>
</body></html>`,
  }
}
