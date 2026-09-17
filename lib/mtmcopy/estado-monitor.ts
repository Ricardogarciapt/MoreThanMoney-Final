/**
 * Estado dos monitores guardado em `site_settings` — só se grava quando mudou.
 *
 * PORQUÊ: o monitor dos perpétuos corre a cada ~5 s (loop da VPS) e fazia `upsert` do estado no
 * fim de TODAS as passagens, mesmo quando o estado era `{}` e ficava `{}` (13 276 escritas em 46 h,
 * 4 ms cada, medido 15–17/09). Cada escrita gera WAL e trinca a linha de `site_settings` que o
 * resto do site lê. Ler, comparar e só gravar o que mudou dá o mesmo resultado sem o custo.
 */

/** JSON com as chaves ordenadas: o jsonb devolve as chaves por outra ordem que a do código. */
export function jsonCanonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** Fotografia do estado lido, para comparar no fim da passagem. */
export function fotografiaEstado(estado: unknown): string {
  return jsonCanonico(estado)
}

export function estadoMudou(fotografia: string, estado: unknown): boolean {
  return jsonCanonico(estado) !== fotografia
}
