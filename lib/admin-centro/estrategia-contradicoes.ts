/**
 * QUANDO DOIS ELOS DA CADEIA SE CONTRADIZEM — puro. Testado em
 * `lib/admin-centro/__tests__/estrategia-contradicoes.check.ts`.
 *
 * A página de uma estratégia mostra a cadeia inteira: fonte → mestre → rotas → subscritores. Cada elo
 * tem o seu interruptor, e cada interruptor está certo sozinho. O que parte é a COMBINAÇÃO: uma fonte
 * desligada com a mestre em live (o motor está pronto para executar sinais que já não chegam — ou,
 * pior, que chegam de um sítio que o dono fechou), uma rota activa para quem já não tem direito, uma
 * subscrição em auto-aceitar sem rota que a sirva. Estas linhas dizem-no em voz alta, no topo.
 */

export type Gravidade = 'grave' | 'aviso' | 'info'

export interface Contradicao {
  /** chave estável — o ecrã usa-a para a chave do React e o teste para comparar */
  id: string
  gravidade: Gravidade
  /** os dois elos em conflito, na ordem da cadeia */
  elos: [Elo, Elo]
  texto: string
}

export type Elo = 'fonte' | 'mestre' | 'rotas' | 'subscritores' | 't2t' | 'estrategia'

export interface EntradaContradicoes {
  ativo: boolean
  apagada: boolean
  fonte: { desligada: boolean; porLigar: boolean; semFonte: boolean }
  /** null = estratégia sem mestre nossa (não está na cadeia) */
  mestre: null | {
    modo: string
    sinalModo: string
    t2tModo: string
    temConta: boolean
    copyfactoryPorCortar: number
  }
  motor: { ligado: boolean; kill: boolean }
  rotas: Array<{ id: string; activa: boolean; pausada: boolean; efectivo: string; temDireito: boolean | null; quem: string; tipo: string }>
  subscricoes: Array<{ id: string; ativo: boolean; autoAceitar: boolean; temRota: boolean; temDireito: boolean | null; quem: string }>
  /** interruptores das rotas provider (site_settings): null = estratégia sem rota provider */
  rotaProvider: null | { copia: boolean; t2t: boolean }
}

const algumLive = (m: NonNullable<EntradaContradicoes['mestre']>) => m.modo === 'live' || m.sinalModo === 'live' || m.t2tModo === 'live'

export function contradicoesDaEstrategia(e: EntradaContradicoes): Contradicao[] {
  const out: Contradicao[] = []
  const m = e.mestre

  if (m && algumLive(m)) {
    if (e.fonte.desligada) out.push({ id: 'fonte-desligada-mestre-live', gravidade: 'grave', elos: ['fonte', 'mestre'], texto: 'Fonte desligada com a mestre em live — o motor está pronto para executar sinais de uma fonte que foi fechada. Passa a mestre a sombra ou religa a fonte.' })
    if (e.fonte.porLigar) out.push({ id: 'fonte-por-ligar-mestre-live', gravidade: 'grave', elos: ['fonte', 'mestre'], texto: 'Fonte MT5 «por ligar» com a mestre em live — não há caminho de leitura da conta, nada chega à mestre.' })
    if (e.fonte.semFonte) out.push({ id: 'sem-fonte-mestre-live', gravidade: 'aviso', elos: ['fonte', 'mestre'], texto: 'Sem fonte declarada e a mestre em live.' })
    if (e.apagada) out.push({ id: 'apagada-mestre-live', gravidade: 'grave', elos: ['estrategia', 'mestre'], texto: 'Estratégia escondida (apagada) e a mestre continua em live.' })
    else if (!e.ativo) out.push({ id: 'inactiva-mestre-live', gravidade: 'aviso', elos: ['estrategia', 'mestre'], texto: 'Estratégia inactiva (não listada) com a mestre em live — os clientes não a vêem, mas o motor executa nas rotas.' })
    if (!m.temConta) out.push({ id: 'mestre-sem-conta', gravidade: 'grave', elos: ['mestre', 'rotas'], texto: 'Mestre em live sem conta mestre ligada.' })
    if (m.modo === 'live' && m.copyfactoryPorCortar > 0) out.push({ id: 'cf-por-cortar', gravidade: 'grave', elos: ['mestre', 'rotas'], texto: `Propagação em live com ${m.copyfactoryPorCortar} estratégia(s) CopyFactory por cortar — ordens em dobro nas contas dos clientes.` })
    if (e.motor.kill) out.push({ id: 'kill', gravidade: 'info', elos: ['mestre', 'rotas'], texto: 'Kill-switch accionado: a mestre diz live mas o motor não envia nada.' })
    else if (!e.motor.ligado) out.push({ id: 'motor-desligado', gravidade: 'aviso', elos: ['mestre', 'rotas'], texto: 'A mestre diz live mas o motor das mestres está desligado.' })
  }

  if (m && m.t2tModo === 'live' && e.rotaProvider && !e.rotaProvider.t2t) {
    out.push({ id: 't2t-live-canal-off', gravidade: 'aviso', elos: ['mestre', 't2t'], texto: 'T2T da mestre em live mas o Tap to Trade desta estratégia está desligado — ninguém consegue aceitar.' })
  }
  if (e.rotaProvider && !e.rotaProvider.copia && e.ativo) {
    out.push({ id: 'copia-pausada-ativa', gravidade: 'aviso', elos: ['rotas', 'estrategia'], texto: 'Cópia da rota provider pausada mas a estratégia continua activa na MTM Auto — a pausa não chegou à app.' })
  }

  for (const r of e.rotas) {
    if (r.activa && !r.pausada && r.temDireito === false) {
      out.push({ id: `rota-sem-direito:${r.id}`, gravidade: r.efectivo === 'live' ? 'grave' : 'aviso', elos: ['rotas', 'subscritores'], texto: `Rota activa${r.efectivo === 'live' ? ' em LIVE' : ''} para ${r.quem}, que não tem direito ao MTM Auto.` })
    }
  }
  if (m) {
    for (const s of e.subscricoes) {
      if (s.ativo && s.autoAceitar && !s.temRota && s.temDireito !== false) {
        out.push({ id: `subscricao-sem-rota:${s.id}`, gravidade: 'aviso', elos: ['subscritores', 'rotas'], texto: `${s.quem} segue em auto-aceitar mas não há rota que o sirva — falta sincronizar as rotas (registar na cadeia).` })
      }
    }
  }
  if (!m && e.subscricoes.some((s) => s.ativo) && !e.apagada) {
    out.push({ id: 'sem-mestre-com-seguidores', gravidade: 'info', elos: ['mestre', 'subscritores'], texto: 'Há seguidores mas a estratégia não está registada na cadeia (sem mestre nossa) — executa o caminho antigo.' })
  }
  const ordem: Record<Gravidade, number> = { grave: 0, aviso: 1, info: 2 }
  return out.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade])
}
