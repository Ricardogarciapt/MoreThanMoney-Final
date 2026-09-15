/** CSV (RFC 4180, separador «;» para o Excel PT abrir sem assistente). Puro e testado. */

export function celulaCsv(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  // Fórmulas no Excel: uma célula que começa por = + - @ é neutralizada.
  const seguro = /^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

export function paraCsv(colunas: string[], linhas: Record<string, unknown>[]): string {
  const cab = colunas.map(celulaCsv).join(';')
  const corpo = linhas.map((l) => colunas.map((c) => celulaCsv(l[c])).join(';'))
  return '﻿' + [cab, ...corpo].join('\r\n') + '\r\n'
}
