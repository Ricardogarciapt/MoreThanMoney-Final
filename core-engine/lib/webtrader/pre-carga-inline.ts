import { APELIDOS } from '@/lib/mtmfunded/simulado/ordens'

/**
 * PRÉ-CARGA NO HTML de /webtrader — os pedidos públicos saem durante o parse da página, em paralelo
 * com o JavaScript (antes: só depois de descarregar, avaliar e hidratar ~600 KB de JS).
 *
 * Um <script> pequeno, inline, lê o `?symbol=` do link (ou o ouro) e o timeframe guardado, pede a
 * ficha+preço e, assim que sabe o nome do símbolo, as 300 velas recentes — e deixa as promessas em
 * `window.__mtmPre[url]`. A pre-carga.ts e o armazém de velas apanham-nas pelo URL exato (e só uma
 * vez); se não estiverem lá, pedem como sempre. A página continua estática na CDN: o script corre no
 * browser, não no servidor.
 *
 * `candidatosInline` é o `candidatosDeTicker` escrito sem dependências (vai para o HTML por
 * `toString`); a verificação rapido.check.ts garante que dão o mesmo.
 */

export function candidatosInline(ticker: string, apelidos: Record<string, string>): string[] {
  const semBolsa = String(ticker || '').split(':').pop()!.trim().toUpperCase()
  const limpo = semBolsa.split(/[._]/)[0].replace(/[^A-Z0-9]/g, '')
  const out: string[] = []
  const add = (s: string) => { if (s && out.indexOf(s) < 0) out.push(s) }
  add(limpo)
  if (apelidos[limpo]) add(apelidos[limpo])
  add(limpo.replace(/(USDT|USDC|BUSD)$/, 'USD'))
  add(limpo.replace(/\d+$/, ''))
  const seis = limpo.match(/^[A-Z]{6}/)
  if (seis) add(seis[0])
  add(semBolsa.replace(/[^A-Z0-9]/g, ''))
  return out
}

/** Corre no browser (serializada por toString): não pode usar nada de fora dos argumentos. */
function arrancar(candidatos: typeof candidatosInline, apelidos: Record<string, string>, chaveTf: string) {
  try {
    const w = window as unknown as { __mtmPre?: Record<string, Promise<unknown>> }
    const pre = (w.__mtmPre = w.__mtmPre || {})
    const q = new URLSearchParams(location.search)
    const s = q.get('symbol')
    const csv = s ? candidatos(s, apelidos).join(',') : 'XAUUSD'
    let tf = 'M5'
    try {
      const v = JSON.parse(localStorage.getItem(chaveTf) || 'null')
      if (typeof v === 'string' && /^(M1|M5|M15|H1|H4|D1)$/.test(v)) tf = v
    } catch { /* sem localStorage */ }
    const uf = '/api/mtmfunded/simulado/precos?symbols=' + encodeURIComponent(csv) + '&specs=1'
    const fichas = fetch(uf).then((r) => r.json())
    pre[uf] = fichas
    fichas.then((d: { simbolos?: Array<{ symbol: string }> }) => {
      const lista = (d && d.simbolos) || []
      let escolhido: string | null = null
      for (const c of csv.split(',')) { if (lista.some((x) => x.symbol === c)) { escolhido = c; break } }
      if (!escolhido) return
      const uv = '/api/mtmfunded/simulado/velas?symbol=' + encodeURIComponent(escolhido) + '&tf=' + tf + '&limit=300&f=a'
      pre[uv] = fetch(uv).then((r) => (r.ok ? r.json() : Promise.reject(new Error('velas'))))
      pre[uv].catch(() => { delete pre[uv] })
    }).catch(() => { delete pre[uf] })
  } catch { /* a pré-carga é só um atalho */ }
}

export function scriptPreCarga(): string {
  return `(${arrancar.toString()})(${candidatosInline.toString()},${JSON.stringify(APELIDOS)},"mtmfunded_tf")`
}
