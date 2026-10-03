/**
 * REGISTO DE DESTINOS DO SITE — a lista da navbar, num sítio só.
 *
 * Existia em duplicado: o array da navbar (com os rótulos já traduzidos lá dentro, e por isso
 * impossível de importar de fora) e depois outra vez em cada sítio que precisasse de saber que
 * páginas existem. O gestor de vídeos «Aprende a usar …» precisa exatamente dessa lista — e se a
 * copiasse, ficariam duas listas a divergir no primeiro destino novo.
 *
 * Por isso o registo guarda a CHAVE de tradução, não o rótulo: assim o módulo não depende do
 * idioma nem do React, e serve tanto a navbar como o servidor. `rotuloPt` é o que fica quando não
 * há tradutor à mão (painel de admin, textos de sistema).
 *
 * REGRA: um destino novo entra aqui e mais nada. O `id` é estável para sempre — é a chave usada na
 * base de dados (mtm_videos_intro.destino); o `href` pode mudar.
 */

export type GrupoNavegacao =
  | 'topo'
  | 'apresentacoes'
  | 'educacao'
  | 'trading'
  | 'apps'

export type DestinoNavegacao = {
  /** Chave estável. NUNCA mudar depois de usada na BD. */
  id: string
  href: string
  /** Chave i18n do rótulo (namespace navfooter). Ausente = usar `rotuloPt`. */
  chave?: string
  /** Rótulo PT-PT, usado no admin e como recurso quando não há tradução. */
  rotuloPt: string
  grupo: GrupoNavegacao
  /** Entrada de topo da navbar (as outras são submenu). */
  topo?: boolean
  /**
   * Há entradas de topo que voltam a aparecer como primeiro item do próprio submenu, com outro
   * nome: «Educação» abre um menu cujo primeiro item é «Educação MTM», para a mesma página.
   * Preencher isto é o que faz esse item repetido existir.
   */
  chaveSubmenu?: string
  rotuloSubmenuPt?: string
  /** Link para fora do site — não recebe vídeo de introdução. */
  externo?: boolean
  /**
   * Cabeçalho da secção dentro do submenu (só nos menus grandes).
   *
   * O menu de Trading tem doze destinos: uma lista de doze linhas iguais obriga a pessoa a ler
   * tudo de cima a baixo e a decidir por eliminação. Agrupados pelo que a pessoa quer FAZER
   * («Negociar», «Sinais e análise», «Ferramentas»), encontra-se pelo sítio onde se olha — é o que
   * distingue um menu que se lê de um que se percorre. Itens sem secção ficam soltos, como antes.
   */
  seccaoPt?: string
  /**
   * Como o botão se lê neste destino: «Aprende a usar » + isto.
   * O admin pode reescrever por destino; isto é só o que aparece por omissão.
   */
  comoUsar?: string
}

export const DESTINOS_NAVEGACAO: DestinoNavegacao[] = [
  { id: 'inicio', href: '/new-landing', chave: 'navfooter.navHome', rotuloPt: 'Início', grupo: 'topo', topo: true, comoUsar: 'o site' },

  {
    id: 'apresentacao', href: '/apresentacao', chave: 'navfooter.navPresentations', rotuloPt: 'Apresentações',
    grupo: 'apresentacoes', topo: true, comoUsar: 'as apresentações',
    chaveSubmenu: 'navfooter.subMtmSystem', rotuloSubmenuPt: 'Sistema MoreThanMoney',
  },

  { id: 'sessoes-gratuitas', href: '/FreeSession', chave: 'navfooter.navFreeSessions', rotuloPt: 'Sessões Gratuitas', grupo: 'topo', topo: true, comoUsar: 'as sessões gratuitas' },

  {
    id: 'educacao', href: '/mtm', chave: 'navfooter.navEducation', rotuloPt: 'Educação',
    grupo: 'educacao', topo: true, comoUsar: 'a Educação MTM',
    chaveSubmenu: 'navfooter.subMtmEducation', rotuloSubmenuPt: 'Educação MTM',
  },
  { id: 'docs', href: '/docs', chave: 'navfooter.subDocs', rotuloPt: 'Docs', grupo: 'educacao', comoUsar: 'a documentação' },
  // «Academias e Lives» e não «Live Sessions»: o que lá está são as academias dos educadores, e as
  // lives são uma parte delas. O nome antigo prometia só metade do que a página tem.
  { id: 'live-sessions', href: '/live-sessions', chave: 'navfooter.subLiveSessions', rotuloPt: 'Academias e Lives', grupo: 'educacao', comoUsar: 'as academias e as sessões ao vivo' },
  // Os DOIS pilares, lado a lado e pela mesma ordem em que a /mtm e a /new-landing os contam.
  // Separá-los era o erro antigo: o Content tinha página própria e o Markets não, o que fazia
  // parecer que o pilar maior da casa não existia.
  { id: 'mtm-markets', href: '/mtmmarkets', chave: 'navfooter.subMtmMarkets', rotuloPt: 'MTM Markets', grupo: 'educacao', comoUsar: 'o pilar dos mercados: Forex, cripto, ações e ETF, imobiliário' },
  { id: 'content-business', href: '/contentbussiness', chave: 'navfooter.subContentBusiness', rotuloPt: 'Content & Business', grupo: 'educacao', comoUsar: 'o pilar de conteúdo e negócio digital' },
  { id: 'avaliacoes', href: '/avaliacoes', chave: 'navfooter.subAvaliacoes', rotuloPt: 'Avaliações', grupo: 'educacao', comoUsar: 'as avaliações e certificados' },

  /**
   * TRADING — arrumado pelo que a pessoa vem fazer, e não pela ordem em que as páginas nasceram.
   *
   * Eram doze linhas iguais: para encontrar o WebTrader era preciso ler as doze. Agora abre-se em
   * «Negociar» (onde se abre uma posição), «Sinais e análise» (onde se decide) e «Ferramentas e
   * programas» (o que se instala ou se compra). Quem vem negociar vê o WebTrader na primeira linha.
   */
  {
    id: 'automacao', href: '/automation', chave: 'navfooter.navTrading', rotuloPt: 'Trading',
    grupo: 'trading', topo: true, comoUsar: 'a automatização',
    chaveSubmenu: 'navfooter.subAutomation', rotuloSubmenuPt: 'Automatização',
    seccaoPt: 'Ferramentas e programas',
  },
  { id: 'webtrader', href: '/webtrader', rotuloPt: 'WebTrader', grupo: 'trading', seccaoPt: 'Negociar', comoUsar: 'o WebTrader' },
  { id: 'mtmauto', href: '/mtmauto', rotuloPt: 'MTM Auto', grupo: 'trading', seccaoPt: 'Negociar', comoUsar: 'o MTM Auto' },
  { id: 'mtm-terminal', href: '/mtm-terminal', chave: 'navfooter.subMtmTerminal', rotuloPt: 'Terminal MTM', grupo: 'trading', seccaoPt: 'Negociar', comoUsar: 'o Terminal MTM' },

  { id: 'alertas-mtm', href: '/alertas-mtm', chave: 'navfooter.subMtmAlerts', rotuloPt: 'Alertas MTM', grupo: 'trading', seccaoPt: 'Sinais e análise', comoUsar: 'os alertas MTM' },
  { id: 'scanner-ao-vivo', href: '/scanner-access', chave: 'navfooter.subLiveScanner', rotuloPt: 'Scanner ao Vivo', grupo: 'trading', seccaoPt: 'Sinais e análise', comoUsar: 'o nosso scanner ao vivo' },
  { id: 'scanners', href: '/scanner', chave: 'navfooter.subOurScanners', rotuloPt: 'Os nossos Scanners', grupo: 'trading', seccaoPt: 'Sinais e análise', comoUsar: 'os nossos scanners' },
  { id: 'portfolios', href: '/portfolios', chave: 'navfooter.subPortfolios', rotuloPt: 'Portefólios', grupo: 'trading', seccaoPt: 'Sinais e análise', comoUsar: 'os portefólios' },

  { id: 'sensei-ea', href: '/sensei-ea', rotuloPt: 'MTM Sensei EA', grupo: 'trading', seccaoPt: 'Ferramentas e programas', comoUsar: 'o MTM Sensei EA' },
  { id: 'sensei-scalp', href: '/sensei-scalp', rotuloPt: 'Sensei Scalp Edition', grupo: 'trading', seccaoPt: 'Ferramentas e programas', comoUsar: 'o Sensei Scalp Edition' },
  // A entrada para o MTM Funded existe aqui, mas só neste sentido: lá dentro a marca é outra, com
  // navegação e rodapé próprios e sem caminho de volta. São dois negócios.
  { id: 'mtmfunded', href: '/mtmfunded', rotuloPt: 'MTM Funded', grupo: 'trading', seccaoPt: 'Ferramentas e programas', comoUsar: 'o MTM Funded' },

  { id: 'onboarding', href: '/onboarding', chave: 'navfooter.navOnboarding', rotuloPt: 'Onboarding', grupo: 'topo', topo: true, comoUsar: 'o arranque' },

  // O marketplace dos educadores. Fica no topo e não dentro de «Educação» de propósito: o que se
  // vende aqui é dos EDUCADORES, não da casa, e enterrá-lo num submenu da casa dizia o contrário.
  //
  // ATENÇÃO: a página respeita `site_settings.marketplace.ligado`, que nasce DESLIGADO. Enquanto
  // estiver assim, este link leva a uma montra vazia — é por isso que o interruptor existe.
  { id: 'marketplace', href: '/marketplace', rotuloPt: 'Marketplace', grupo: 'topo', topo: true, comoUsar: 'o marketplace dos educadores' },

  { id: 'apps-ia', href: '/app-mobile?tab=apps', chave: 'navfooter.navAiApps', rotuloPt: 'Apps IA', grupo: 'apps', topo: true, comoUsar: 'as Apps IA' },
  { id: 'mtmsocial', href: '/mtmsocial', rotuloPt: 'MTM Social', grupo: 'apps', comoUsar: 'o MTM Social' },
  { id: 'mtm-studio', href: 'https://mtmbrandbuilder.lovable.app', rotuloPt: 'MTM Studio', grupo: 'apps', externo: true },
  { id: 'mtm-partnership', href: 'https://mtmugcapp.lovable.app', rotuloPt: 'MTM Partnership Engine', grupo: 'apps', externo: true },
  { id: 'mtm-aios', href: 'https://mtmaios.lovable.app', rotuloPt: 'MTM AiOS', grupo: 'apps', externo: true },
]

export type ItemNavbar = {
  id: string
  name: string
  href: string
  external?: boolean
  submenu?: Array<{ id: string; name: string; href: string; external?: boolean; seccao?: string }>
}

/**
 * A navbar, montada a partir do registo.
 *
 * `traduzir` é o `t()` do i18n-provider; quando não há chave (ou tradução) fica o rótulo PT.
 */
export function construirNavbar(traduzir: (chave: string) => string): ItemNavbar[] {
  const rotulo = (chave: string | undefined, fallback: string) => {
    if (!chave) return fallback
    const tr = traduzir(chave)
    return tr && tr !== chave ? tr : fallback
  }

  return DESTINOS_NAVEGACAO.filter((d) => d.topo).map((cabeca) => {
    // O grupo 'topo' é o saco dos destinos que não abrem menu nenhum (Início, Sessões Gratuitas,
    // Onboarding). Não é um menu: se fosse tratado como tal, cada um deles abria um submenu com os
    // outros dois lá dentro.
    const filhos =
      cabeca.grupo === 'topo'
        ? []
        : DESTINOS_NAVEGACAO.filter((d) => d.grupo === cabeca.grupo && d.id !== cabeca.id)
    const proprio = cabeca.chaveSubmenu || cabeca.rotuloSubmenuPt
      ? [{
          id: cabeca.id,
          name: rotulo(cabeca.chaveSubmenu, cabeca.rotuloSubmenuPt || cabeca.rotuloPt),
          href: cabeca.href,
          seccao: cabeca.seccaoPt,
        }]
      : []
    // Com secções, a entrada da própria cabeça entra na secção dela (a «Automatização» é uma
    // ferramenta, não o primeiro sítio onde se vai negociar); sem secções, fica à frente como
    // sempre esteve.
    const tudo = [
      ...proprio,
      ...filhos.map((f) => ({ id: f.id, name: rotulo(f.chave, f.rotuloPt), href: f.href, external: f.externo, seccao: f.seccaoPt })),
    ]
    const temSeccoes = tudo.some((x) => x.seccao)
    // A ordem das secções é a do REGISTO (os filhos), não a da cabeça: senão «Automatização» —
    // que é uma ferramenta — puxava a secção dela para cima e o WebTrader deixava de ser a
    // primeira linha de quem vem negociar.
    const ordem = [...new Set([
      ...filhos.map((f) => f.seccaoPt ?? ''),
      ...proprio.map((x) => x.seccao ?? ''),
    ])]
    const submenu = temSeccoes
      ? ordem.flatMap((sec) => tudo.filter((x) => (x.seccao ?? '') === sec))
      : tudo
    return {
      id: cabeca.id,
      name: rotulo(cabeca.chave, cabeca.rotuloPt),
      href: cabeca.href,
      external: cabeca.externo,
      submenu: submenu.length > 0 ? submenu : undefined,
    }
  })
}

/** Destinos que podem receber um vídeo de introdução (os externos não são nossos). */
export function destinosComVideoIntro(): DestinoNavegacao[] {
  return DESTINOS_NAVEGACAO.filter((d) => !d.externo)
}

export function destinoPorId(id: string): DestinoNavegacao | null {
  return DESTINOS_NAVEGACAO.find((d) => d.id === id) ?? null
}

/**
 * Que destino é este caminho.
 *
 * O caminho mais específico ganha: `/live-sessions/abc` é a sala, mas o destino é `/live-sessions`;
 * `/mtm` não pode roubar `/mtm-terminal`, daí a comparação por segmento inteiro.
 */
export function destinoPorCaminho(caminho: string | null | undefined): DestinoNavegacao | null {
  const limpo = (caminho || '').split('?')[0].replace(/\/+$/, '') || '/'
  let melhor: DestinoNavegacao | null = null
  for (const d of DESTINOS_NAVEGACAO) {
    if (d.externo) continue
    const base = d.href.split('?')[0].replace(/\/+$/, '')
    if (!base) continue
    const bate = limpo === base || limpo.startsWith(`${base}/`)
    if (!bate) continue
    if (!melhor || base.length > melhor.href.split('?')[0].replace(/\/+$/, '').length) melhor = d
  }
  return melhor
}

/** «Aprende a usar o Terminal MTM» — o texto do botão para este destino. */
export function textoAprendeAUsar(destino: DestinoNavegacao, rotuloPersonalizado?: string | null): string {
  const cauda = (rotuloPersonalizado || '').trim() || destino.comoUsar || destino.rotuloPt
  return `Aprende a usar ${cauda}`
}
