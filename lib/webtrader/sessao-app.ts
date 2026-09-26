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

// ── A passagem pelo BROWSER (fora da casca nativa) ───────────────────────────

/**
 * O NOME DO CAMPO ONDE O TOKEN VIAJA — e porque é no FRAGMENTO e não na query.
 *
 * Dentro da app o token viaja como argumento de função (`__mtmAutoWTReceber`), que é o sítio mais
 * seguro que há: não existe fora da memória da página. No browser não há casca a chamar função
 * nenhuma, e a app corre noutro domínio (mtm-auto.vercel.app) — logo o token tem de atravessar a
 * fronteira pelo URL.
 *
 * Vai no FRAGMENTO (`#`) e nunca na query (`?`), e a diferença não é cosmética:
 *  · o fragmento NÃO é enviado ao servidor — não entra em logs de acesso, nem da Vercel nem de
 *    qualquer intermediário;
 *  · não viaja no cabeçalho `Referer` para terceiros;
 *  · a query faria as duas coisas.
 *
 * O que o fragmento ainda faz é ficar no histórico do browser — e por isso `limparFragmento()` é
 * chamado assim que o token é lido, antes de qualquer pedido de rede.
 *
 * O QUE ISTO NÃO RESOLVE, dito por escrito: quem apanhar o URL completo nos dez minutos seguintes
 * pode repeti-lo. A janela é curta (`IDADE_MAX_TOKEN_S`), o limitador trava a repetição
 * (`LIMITE_EMISSOES`), e o token é de acesso — não o de renovação, que nunca sai da app. Para
 * fechar mesmo essa janela é preciso um código de uso único emitido pela app, que é mais peça do
 * que isto precisava para arrancar.
 */
export const CAMPO_TOKEN_FRAGMENTO = 'mtmauto'

/**
 * Lê o token do fragmento do URL. Devolve `null` quando não há nada aproveitável — e `null` é o
 * caminho normal, porque a esmagadora maioria das visitas a esta página não traz token nenhum.
 *
 * Aceita `#mtmauto=<token>` e `#outra=x&mtmauto=<token>`. Um valor vazio, com espaços ou que não
 * tenha a forma de um JWT é tratado como ausência: é melhor mandar a pessoa para o ecrã de entrada
 * normal do que atirar um disparate ao servidor.
 */
export function tokenDoFragmento(hash: string | null | undefined): string | null {
  const h = String(hash ?? '').replace(/^#/, '')
  if (!h) return null
  let bruto: string | null = null
  for (const par of h.split('&')) {
    const i = par.indexOf('=')
    if (i < 0) continue
    if (decodeURIComponent(par.slice(0, i)) !== CAMPO_TOKEN_FRAGMENTO) continue
    try {
      bruto = decodeURIComponent(par.slice(i + 1))
    } catch {
      bruto = par.slice(i + 1)
    }
  }
  const t = (bruto ?? '').trim()
  // Três partes separadas por ponto: a forma de um JWT. Não se valida a assinatura aqui — isso é do
  // servidor, e fazê-lo no browser só daria uma falsa sensação de garantia.
  if (!t || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(t)) return null
  return t
}

/**
 * O URL que a app MTM Auto abre no browser para entregar a sessão ao WebTrader.
 *
 * `base` é a origem do site (www.morethanmoney.pt). `destino` é o que se quer ver DEPOIS da
 * passagem, e viaja na query — porque não é segredo nenhum e a página precisa dele para reencaminhar.
 */
export function urlDaPassagem(base: string, token: string, destino?: string | null): string {
  const raiz = base.replace(/\/+$/, '')
  const q = destino && destino !== '?' ? (destino.startsWith('?') ? destino : `?${destino}`) : ''
  return `${raiz}/webtrader/app${q}#${CAMPO_TOKEN_FRAGMENTO}=${encodeURIComponent(token)}`
}
