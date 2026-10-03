/**
 * APAGAR UMA ESTRATÉGIA = ESCONDÊ-LA. Nunca um DELETE.
 *
 * ═══ PORQUE NÃO SE APAGA A SÉRIO ════════════════════════════════════════════════════════════
 *
 * As FKs de `mtmauto_signals` e `mtmauto_subscriptions` para `mtmauto_providers` são ON DELETE
 * CASCADE (migração 084, que criou `apagado_em` exactamente por isto): um DELETE levava com ele o
 * histórico de sinais e de execuções dos clientes. Por isso a única forma de «apagar» é marcar
 * `apagado_em` — a linha fica, sai de todos os catálogos, e o histórico continua a poder nomear a
 * estratégia.
 *
 * É o mesmo padrão que já existe em `lib/mtmfunded/estrategias-sinais/calculo.ts`:
 * `ESTRATEGIAS_PRIMEVERSE` conhece TODAS (para fechar posições antigas e dar nome ao histórico) e
 * `ESTRATEGIAS_PRIMEVERSE_VIVAS` é só o que ainda se OFERECE. Uma estratégia com `apagado_em` está
 * do lado de «conhecida mas não oferecida».
 *
 * ═══ E PORQUE NEM ESCONDER É SEMPRE PERMITIDO ═══════════════════════════════════════════════
 *
 * Esconder uma estratégia que ainda tem posições abertas em contas de clientes cria um órfão: o
 * motor continua a gerir o que está aberto (e tem de continuar), mas ela desaparece do painel onde
 * se veria o problema. Uma estratégia que o motor executa em LIVE é pior ainda — esconder-se-ia uma
 * coisa que está a abrir ordens com dinheiro de clientes neste momento. Isto move dinheiro real;
 * por isso as guardas são DUAS (a desta função e a da base) e esta explica-se antes de o botão
 * chegar ao servidor.
 *
 * Puro: sem Supabase, sem React. Guardas em `lib/estrategias-admin/__tests__/apagar.check.ts`.
 */

export interface EstadoParaApagar {
  slug: string
  /** já tem `apagado_em` */
  apagada: boolean
  /** posições abertas (ou a enviar) nas rotas desta estratégia */
  abertas: number
  /** rotas que o motor decide executar em LIVE agora — não a coluna `copia_rotas.modo` */
  rotasLive: number
  /** clientes que ainda a escolheram (`strategy_lots` / `mtmauto_subscriptions`) */
  subscritores: number
  /** `mestres_estrategias.modo`; null = não tem mestre nossa */
  modoMotor: string | null
}

export type MotivoRecusa = 'ja-apagada' | 'posicoes-abertas' | 'executa-em-live' | 'tem-subscritores'

export type Veredicto =
  | { ok: true; aviso: string | null }
  | { ok: false; motivo: MotivoRecusa; mensagem: string }

/**
 * Pode esta estratégia ser escondida? A ordem das recusas é a da gravidade: primeiro o que está a
 * mexer dinheiro agora (live), depois o que está aberto, depois quem a segue.
 */
export function podeApagarEstrategia(e: EstadoParaApagar): Veredicto {
  if (e.apagada) {
    return { ok: false, motivo: 'ja-apagada', mensagem: `«${e.slug}» já está apagada.` }
  }
  if (e.rotasLive > 0 || e.modoMotor === 'live') {
    return {
      ok: false,
      motivo: 'executa-em-live',
      mensagem: `«${e.slug}» está a EXECUTAR EM LIVE (${e.rotasLive} rota(s))${e.modoMotor === 'live' ? ' e o motor tem-na em live' : ''}. `
        + 'Põe-na em sombra no motor das mestres antes de a esconder — esconder não para a execução.',
    }
  }
  if (e.abertas > 0) {
    return {
      ok: false,
      motivo: 'posicoes-abertas',
      mensagem: `«${e.slug}» tem ${e.abertas} posição(ões) aberta(s). Esconder não as fecha, só as tira da vista — `
        + 'fecha-as (ou espera que fechem) primeiro.',
    }
  }
  if (e.subscritores > 0) {
    return {
      ok: false,
      motivo: 'tem-subscritores',
      mensagem: `${e.subscritores} conta(s) ainda seguem «${e.slug}». Tira-as da estratégia (Centro › Cópia › Quadro) antes de a esconder.`,
    }
  }
  return { ok: true, aviso: AVISO_APAGAR }
}

export const AVISO_APAGAR =
  'A linha não é eliminada: fica com `apagado_em` e sai de todos os catálogos (site, app MTM Auto, T2T, '
  + 'MTM Funded, criação de contas). O histórico de sinais e execuções fica, e continua a poder dar nome '
  + 'às trades antigas. Dá-se sempre para restaurar.'

/** A palavra que o admin escreve. É o slug: quem escreve o slug leu qual é a estratégia. */
export function confirmacaoDeApagar(slug: string): string {
  return slug.toUpperCase()
}
