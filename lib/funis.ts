import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Os funis, desenhados em vez de descritos.
 *
 * O funil existia em três sítios ao mesmo tempo: no código que responde no Telegram, nas
 * mensagens que ele envia e na cabeça de quem o montou. Ninguém conseguia ver o desenho inteiro,
 * e por isso ninguém dava por um caminho que não levava a lado nenhum — como o passo do MTM Auto
 * que ficou meses sem ligação ao passo seguinte.
 *
 * Um funil aqui é um MAPA: caixas e setas. Cada caixa é um momento (uma mensagem, uma espera,
 * uma condição, um destino) e cada seta é o que acontece a seguir. É o mesmo modelo que as
 * ferramentas de funis usam, porque é o modelo certo: o que decide o desenho é a ligação entre
 * passos, não a lista deles.
 *
 * ── O que isto NÃO é ──────────────────────────────────────────────────────────────────────────
 * Não executa nada. O motor continua a ser o código do Telegram e do ManyChat. Isto é o desenho
 * e a documentação viva dele — para se VER onde trava antes de se mexer no que corre.
 * Prometer que arrastar uma caixa muda o comportamento seria mentir, e um mapa em que não se
 * confia é pior do que não haver mapa.
 */

const KEY = 'funis_desenho'

/**
 * Os blocos que um funil pode ter.
 *
 * A lista vem do que estas ferramentas convergiram a ter — ManyChat, n8n, os construtores de
 * funis — porque a convergência não é moda: são os momentos que um funil realmente tem. Uma
 * mensagem, uma espera, uma bifurcação, uma acção sobre a pessoa, um salto para outro fluxo.
 *
 * `acao` e `webhook` existem porque metade do nosso funil vive fora do Telegram: etiquetar um
 * lead, dar um cupão, chamar um automatismo. Sem blocos para isso, o mapa mostrava só metade do
 * caminho — e a metade que falta é onde as coisas costumam partir.
 */
export type TipoDeNo =
  | 'entrada'
  | 'mensagem'
  | 'espera'
  | 'condicao'
  | 'acao'
  | 'webhook'
  | 'divisao'
  | 'irpara'
  | 'destino'
  | 'saida'

export interface NoDoFunil {
  id: string
  tipo: TipoDeNo
  titulo: string
  detalhe?: string
  /** Posição no mapa, em píxeis. É o que o arrastar guarda. */
  x: number
  y: number
  /** Para onde vai a seguir. Vários = o caminho parte-se em dois. */
  seguintes: string[]
  /** Quando o nó corresponde a uma mensagem editável, a chave dela. */
  mensagem?: string
  /**
   * A configuração própria deste tipo de bloco — o quanto de uma espera, a condição de uma
   * condição, o endereço de uma automação.
   *
   * É um saco livre e não campos com nome fixo de propósito: os campos de cada tipo estão
   * descritos em `lib/funis-campos`, e acrescentar um bloco novo passa a ser acrescentar uma
   * entrada nessa tabela — sem migração e sem mexer no editor.
   */
  config?: Record<string, unknown>
}

export interface Funil {
  id: string
  nome: string
  descricao: string
  nos: NoDoFunil[]
}

/**
 * Os funis que existem HOJE, lidos do que o código faz.
 *
 * Não é um exemplo: é o desenho do que está a correr. Quando o código mudar e isto não mudar, o
 * mapa mente — e é por isso que cada nó diz de onde vem.
 */
export const FUNIS_BASE: Funil[] = [
  {
    id: 'telegram-leads',
    nome: 'Telegram · do lead ao acesso',
    descricao: 'O que acontece a quem entra no grupo de leads. Motor: app/api/telegram/webhook.',
    nos: [
      { id: 'entrada', tipo: 'entrada', titulo: 'Entra no grupo de leads', detalhe: 'handleLeadsGroupNewMembers', config: { origem: 'grupo_telegram' }, x: 40, y: 40, seguintes: ['boas-vindas'] },
      { id: 'boas-vindas', tipo: 'mensagem', titulo: 'Boas-vindas no grupo', detalhe: 'Com botão para falar em privado', mensagem: 'boas_vindas_grupo', config: { canal: 'telegram', mensagem: 'boas_vindas_grupo' }, x: 40, y: 150, seguintes: ['privado'] },
      { id: 'privado', tipo: 'condicao', titulo: 'Falou em privado?', detalhe: 'Sem isto o funil pára aqui — é o primeiro sítio onde se perde gente', config: { campo: 'respondeu', operador: 'existe' }, x: 40, y: 260, seguintes: ['perguntar', 'sem-resposta'] },
      { id: 'sem-resposta', tipo: 'saida', titulo: 'Ficou no grupo, calado', detalhe: 'Não há follow-up automático: é a maior fuga do funil', config: { motivo: 'Entrou no grupo e nunca escreveu. Ninguém lhe volta a falar.', recuperavel: true }, x: 330, y: 260, seguintes: [] },
      { id: 'perguntar', tipo: 'mensagem', titulo: 'O que procuras?', detalhe: 'Sinais à mão · Tap to Trade · automático', mensagem: 'boas_vindas', config: { canal: 'telegram', mensagem: 'boas_vindas' }, x: 40, y: 380, seguintes: ['escolha'] },
      { id: 'escolha', tipo: 'condicao', titulo: 'Quer testar ou entrar já?', config: { campo: 'interesse', operador: 'e', valor_interesse: 'ecossistema' }, x: 40, y: 490, seguintes: ['gratis', 'corretora'] },
      { id: 'gratis', tipo: 'mensagem', titulo: 'Porta grátis · 14 dias', detalhe: 'App + código 14DayTrial, sem depósito', mensagem: 'porta_gratis', config: { canal: 'telegram', mensagem: 'porta_gratis' }, x: 40, y: 610, seguintes: ['app'] },
      { id: 'corretora', tipo: 'mensagem', titulo: 'Passo da corretora', detalhe: 'PU Prime, depósito mínimo, UID + print', mensagem: 'passo_corretora', config: { canal: 'telegram', mensagem: 'passo_corretora' }, x: 330, y: 610, seguintes: ['validar'] },
      { id: 'app', tipo: 'destino', titulo: 'Regista-se na app', detalhe: '14 dias Premium', config: { conta_como: 'registo' }, x: 40, y: 720, seguintes: ['corretora'] },
      { id: 'validar', tipo: 'condicao', titulo: 'UID validado?', detalhe: 'broker_clients, depósito ≥ mínimo', config: { campo: 'broker_uid', operador: 'existe' }, x: 330, y: 720, seguintes: ['acesso'] },
      { id: 'acesso', tipo: 'destino', titulo: 'Grupos + cupão Premium', detalhe: 'granted_at preenchido', config: { conta_como: 'deposito' }, x: 330, y: 830, seguintes: [] },
    ],
  },
  {
    id: 'mtmauto',
    nome: 'MTM Auto · só a app',
    descricao: 'Para quem quer apenas o copytrading automático. Motor: lib/telegram-mtmauto-funnel.',
    nos: [
      { id: 'inicio', tipo: 'entrada', titulo: 'Diz que quer automático', detalhe: 'telegram_leads.interesse', config: { origem: 'dm_telegram' }, x: 40, y: 40, seguintes: ['corretora'] },
      { id: 'corretora', tipo: 'mensagem', titulo: 'Abre conta na corretora', detalhe: 'mtmauto_passo = corretora', config: { canal: 'telegram' }, x: 40, y: 150, seguintes: ['valida'] },
      { id: 'valida', tipo: 'condicao', titulo: 'Conta validada?', config: { campo: 'mtmauto_passo', operador: 'e', valor_passo: 'validado' }, x: 40, y: 260, seguintes: ['app', 'parado'] },
      { id: 'parado', tipo: 'saida', titulo: 'Parou na corretora', detalhe: 'O gargalo conhecido deste funil', config: { motivo: 'Abrir conta e depositar é o passo mais caro do funil — é aqui que quase todos param.', recuperavel: true }, x: 330, y: 260, seguintes: [] },
      { id: 'app', tipo: 'destino', titulo: 'Instala a app MTM Auto', config: { conta_como: 'app' }, x: 40, y: 380, seguintes: ['liga'] },
      { id: 'liga', tipo: 'destino', titulo: 'Liga a conta MT5', detalhe: 'mtmauto_accounts', config: { conta_como: 'conta_ligada' }, x: 40, y: 490, seguintes: ['copia'] },
      { id: 'copia', tipo: 'destino', titulo: 'Cópia automática a correr', config: { conta_como: 'conta_ligada' }, x: 40, y: 600, seguintes: [] },
    ],
  },
  {
    id: 'instagram',
    nome: 'Instagram · do post ao registo',
    descricao: 'Conteúdo publicado nas duas contas. Motor: cron content-draft + ig-publish.',
    nos: [
      { id: 'post', tipo: 'entrada', titulo: 'Post publicado', detalhe: 'social_scheduled_posts', config: { origem: 'comentario_ig' }, x: 40, y: 40, seguintes: ['comentario'] },
      { id: 'comentario', tipo: 'condicao', titulo: 'Comenta a palavra do CTA?', config: { campo: 'respondeu', operador: 'existe' }, x: 40, y: 150, seguintes: ['dm', 'nada'] },
      { id: 'nada', tipo: 'saida', titulo: 'Só viu', config: { motivo: 'Viu o post e não comentou. Não há como lhe falar.', recuperavel: false }, x: 330, y: 150, seguintes: [] },
      { id: 'dm', tipo: 'mensagem', titulo: 'Resposta pública com o link', detalhe: 'Contas Essential: sem automação de DM', config: { canal: 'instagram_comentario' }, x: 40, y: 260, seguintes: ['telegram'] },
      { id: 'telegram', tipo: 'destino', titulo: 'Vai para o Telegram ou /register', config: { conta_como: 'registo' }, x: 40, y: 380, seguintes: [] },
    ],
  },
]

/** O desenho guardado, ou o base quando ainda ninguém mexeu. */
export async function lerFunis(): Promise<Funil[]> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', KEY).maybeSingle()
    const v = data?.value
    const obj = typeof v === 'string' ? JSON.parse(v) : v
    if (Array.isArray(obj) && obj.length) return obj as Funil[]
  } catch {
    /* sem desenho guardado mostra-se o que o código faz hoje */
  }
  return FUNIS_BASE
}

export async function guardarFunis(funis: Funil[]): Promise<{ ok: boolean; erro?: string }> {
  if (!Array.isArray(funis)) return { ok: false, erro: 'Formato inválido' }
  const { error } = await getSupabaseAdmin()
    .from('site_settings')
    .upsert({ key: KEY, value: funis, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return error ? { ok: false, erro: error.message } : { ok: true }
}
