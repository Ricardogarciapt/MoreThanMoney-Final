/**
 * SESSÃO DA APP MTM AUTO → WEBTRADER — as regras, sem rede (testadas em
 * lib/webtrader/__tests__/sessao-app.check.ts).
 *
 * O problema: a app iOS MTM Auto mostra o WebTrader num separador, mas a página da app vive em
 * mtm-auto.vercel.app e o WebTrader em www.morethanmoney.pt. O Supabase é o mesmo, a ORIGEM não:
 * a sessão de uma não se vê na outra, e o cliente teria de entrar duas vezes.
 *
 * Porque NÃO se copia a sessão da app: o refresh token do Supabase roda a cada renovação e o
 * Supabase deteta reutilização — duas páginas a renovar o MESMO refresh token acabam, cedo ou tarde,
 * com a família de tokens revogada e as DUAS sessões fora. Por isso o WebTrader recebe uma sessão
 * PRÓPRIA (magic link gerado no servidor, sem email), a partir do access token da app.
 *
 * O caminho do token (nunca num URL — ficava em históricos e logs):
 *   página MTM Auto → casca nativa (mensagem JS) → página /webtrader/app (argumento de função)
 *   → POST /api/webtrader/sessao-app (cabeçalho Authorization) → sessão nova no corpo da resposta.
 *
 * O que trava abusos (um access token roubado não pode virar uma sessão longa sem limites):
 *   · o token tem de ser RECENTE (emitido há ≤ 10 min) — a app renova-o antes de o entregar;
 *   · só para quem é cliente MTM Auto (tem ficha em mtmauto_users);
 *   · limite por utilizador (6 sessões / 10 min) e registo de cada emissão (sem tokens).
 * O reforço que falta é atestar a APP (App Attest) — ver o relatório da frente webtrader-tab.
 */

export const IDADE_MAX_TOKEN_S = 10 * 60
export const LIMITE_EMISSOES = 6
export const JANELA_EMISSOES_MS = 10 * 60_000

/** Payload de um JWT SEM verificar a assinatura — só depois de o Supabase o ter validado. */
export function payloadJwt(token: string): Record<string, unknown> | null {
  const partes = String(token ?? '').split('.')
  if (partes.length !== 3) return null
  try {
    const json = Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const o = JSON.parse(json) as unknown
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** O token foi emitido há pouco? (`iat` em segundos; relógios com 60 s de folga para o futuro.) */
export function tokenRecente(payload: Record<string, unknown> | null, agoraMs = Date.now()): boolean {
  const iat = Number(payload?.iat)
  if (!Number.isFinite(iat) || iat <= 0) return false
  const idade = agoraMs / 1000 - iat
  return idade >= -60 && idade <= IDADE_MAX_TOKEN_S
}

/** Limitador por chave em memória (por instância — um travão, não uma contabilidade). */
export function criarLimitadorEmissoes(limite = LIMITE_EMISSOES, janelaMs = JANELA_EMISSOES_MS) {
  const marcas = new Map<string, number[]>()
  return {
    permitir(chave: string, agora = Date.now()): boolean {
      const recentes = (marcas.get(chave) ?? []).filter((t) => agora - t < janelaMs)
      if (recentes.length >= limite) {
        marcas.set(chave, recentes)
        return false
      }
      recentes.push(agora)
      marcas.set(chave, recentes)
      if (marcas.size > 5000) marcas.clear()
      return true
    },
  }
}

/**
 * O que a página /webtrader/app faz com o que a casca lhe entrega.
 *   · 'sair'    — a app não tem sessão: o WebTrader também não pode ficar com a de ninguém
 *                 (telemóvel partilhado, ou a pessoa saiu da app);
 *   · 'manter'  — o WebTrader já tem a sessão desta mesma pessoa: não se emite outra;
 *   · 'trocar'  — sem sessão, ou de OUTRA pessoa: sai e pede uma nova.
 */
export function decidirPassagem(p: { tokenApp: string | null | undefined; userIdApp: string | null | undefined; userIdAtual: string | null | undefined }): 'sair' | 'manter' | 'trocar' {
  if (!p.tokenApp || !p.userIdApp) return 'sair'
  if (p.userIdAtual && p.userIdAtual === p.userIdApp) return 'manter'
  return 'trocar'
}

/** Destino depois da passagem: /webtrader com a query da própria entrada (símbolo de um alerta, etc.). */
export function destinoDaEntrada(search: string | null | undefined): string {
  const q = String(search ?? '')
  if (!q || q === '?') return '/webtrader'
  return `/webtrader${q.startsWith('?') ? q : `?${q}`}`
}
