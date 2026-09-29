/**
 * QUEM PODE MEXER NESTE PRODUTO — o único sítio onde essa pergunta se responde.
 *
 * ── O PONTO ONDE ISTO SE ESTRAGA ──────────────────────────────────────────────────────────
 *
 * «O educador pode ser admin dos produtos dele apenas.» Essa frase tem duas metades e a segunda é
 * a que se perde: *apenas*. Um educador nunca vê, edita, publica, apaga nem factura o produto de
 * outro, e nunca vê as vendas nem a partilha de outro.
 *
 * A maneira como isso se parte não é alguém escrever `if (true)`. É mais chato do que isso: nasce
 * uma rota nova — gerar uma imagem, sincronizar um preço, pedir uma descrição à IA — e essa rota
 * recebe um `produtoId` do corpo do pedido e vai buscá-lo por `id`. Autentica o educador
 * corretamente, confirma que há sessão, e depois trabalha sobre um produto que não é dele. A
 * sessão estava certa; faltava a pergunta.
 *
 * As rotas antigas não tinham esse buraco porque filtravam por `.eq('educator_id', educatorId)` em
 * cada `update` — mas isso é uma disciplina, não uma garantia, e uma disciplina que tem de ser
 * repetida em cada rota nova é uma disciplina que vai ser esquecida numa delas.
 *
 * Por isso a pergunta passa a ter uma função. Quem quiser mexer num produto chama isto e recebe o
 * produto, ou recebe uma recusa. Não há caminho que devolva o produto sem a verificação, porque
 * a verificação é a função que devolve o produto.
 *
 * ── AS DUAS IDENTIDADES, QUE NÃO SÃO A MESMA ──────────────────────────────────────────────
 *
 * Um educador NÃO é um utilizador do site. Tem email e password próprios e uma sessão paralela, no
 * cookie `mtm_educator_token`; a coluna `lms_educators.profile_id` existe mas não é lida em lado
 * nenhum e só um dos cinco educadores a tem preenchida. O admin, ao contrário, é um perfil do site
 * com `user_type = 'admin'`.
 *
 * São dois mecanismos diferentes e aqui coexistem sem se confundirem: o admin passa por
 * `verifyAdminAccess` (cookie ou Bearer, como o resto do /admin), o educador pelo JWT do cookie
 * dele. Um educador NUNCA se torna admin por esta via — o `papel` que sai daqui diz qual dos dois
 * é, e o que cada um pode fazer é decidido pelo chamador com essa informação à frente.
 *
 * Guarda: `npx tsx lib/marketplace/gestao.check.ts`
 */

import { cookies } from 'next/headers'
import { getEducatorCookieName, verifyEducatorToken } from '@/lib/lms-educator-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { donoValido } from './regras'

export type Papel =
  /** Um admin do site. Vê e mexe em tudo, incluindo nos produtos da casa. */
  | 'admin'
  /** Um educador. Vê e mexe SÓ no que é dele. */
  | 'educador'

export type Quem =
  | { papel: 'admin'; adminId: string; educatorId: null }
  | { papel: 'educador'; adminId: null; educatorId: string }

/**
 * Quem está do outro lado: admin, educador, ou ninguém.
 *
 * O ADMIN É TESTADO PRIMEIRO de propósito. Um admin que também tenha uma conta de educador aberta
 * no mesmo browser tem de continuar a ver o painel todo — se o cookie de educador ganhasse, o dono
 * perdia metade do /admin por ter entrado uma vez no estúdio para testar.
 */
export async function quemGere(): Promise<Quem | null> {
  try {
    const { verifyAdminAccess } = await import('@/lib/admin-api-helpers')
    const r = await verifyAdminAccess()
    if (r.isAdmin && r.userId) return { papel: 'admin', adminId: r.userId, educatorId: null }
  } catch {
    // Sem sessão de site. Segue para o educador.
  }

  const token = (await cookies()).get(getEducatorCookieName())?.value
  const educatorId = token ? verifyEducatorToken(token)?.educatorId ?? null : null
  if (educatorId) return { papel: 'educador', adminId: null, educatorId }

  return null
}

export type ProdutoGerido = {
  id: string
  educator_id: string | null
  dono: string
  slug: string
  titulo: string
  subtitulo: string | null
  descricao: string | null
  tipo: string
  imagem_url: string | null
  preco_cents: number
  moeda: string
  recorrente: boolean
  /** De quanto em quanto tempo se cobra (157). Decide o `interval` do Stripe. */
  periodicidade: string
  /** A galeria, SEM a capa — a capa é `imagem_url`. Máximo 8 (157). */
  imagens: string[] | null
  requer_morada: boolean
  conteudo_url: string | null
  conteudo_nota: string | null
  estado: string
  activo: boolean
  partilha_pct: number | null
  stripe_product_id: string | null
  stripe_price_id: string | null
  checkout_externo_url: string | null
  campanha_pct: number | null
  campanha_inicio: string | null
  campanha_fim: string | null
  campanha_tier: string | null
  campanha_stripe_coupon_id: string | null
  motivo_recusa: string | null
  publicado_em: string | null
  created_at: string
  updated_at: string
}

export const COLUNAS_GESTAO =
  'id, educator_id, dono, slug, titulo, subtitulo, descricao, tipo, imagem_url, imagens, preco_cents, moeda, ' +
  'recorrente, periodicidade, requer_morada, conteudo_url, conteudo_nota, estado, activo, partilha_pct, ' +
  'stripe_product_id, stripe_price_id, checkout_externo_url, campanha_pct, campanha_inicio, ' +
  'campanha_fim, campanha_tier, campanha_stripe_coupon_id, motivo_recusa, publicado_em, created_at, updated_at'

/**
 * Esta pessoa pode mexer NESTE produto? — a função pura, para se poder testar o caso mau.
 *
 * Separada da que vai à base de dados porque é a decisão, e uma decisão que só existe dentro de
 * uma query não se testa sem uma base de dados. O `gestao.check.ts` corre isto com os quatro casos
 * que interessam, e três deles são «não».
 */
export function podeGerir(
  quem: Quem | null | undefined,
  produto: { educator_id?: string | null; dono?: string | null } | null | undefined,
): boolean {
  if (!quem || !produto) return false
  if (quem.papel === 'admin') return true

  // Um educador não mexe num produto da casa, mesmo que o `educator_id` viesse por engano
  // preenchido com o dele. O dono do produto manda mais do que a coluna.
  if (donoValido(produto.dono) === 'casa') return false

  // E é aqui que a frase «dos produtos dele apenas» vive. Sem educador no produto não há dono a
  // quem ele possa corresponder, logo não é dele.
  if (!produto.educator_id) return false
  return produto.educator_id === quem.educatorId
}

/**
 * Vai buscar o produto E confirma o direito, na mesma chamada.
 *
 * As duas coisas juntas de propósito: é o que faz com que não exista maneira de obter o produto sem
 * passar pela verificação. Devolver `{ produto: null, motivo }` e não lançar mantém as rotas a
 * poderem escolher o código HTTP — 401 quando não há sessão, 404 quando não é dele (e 404 e não
 * 403, para não confirmar a existência de um produto de outra pessoa a quem anda a adivinhar ids).
 */
export async function produtoSobGestao(
  produtoId: string,
  quem?: Quem | null,
): Promise<{ produto: ProdutoGerido; quem: Quem } | { produto: null; motivo: 'sem_sessao' | 'nao_encontrado' }> {
  const q = quem ?? (await quemGere())
  if (!q) return { produto: null, motivo: 'sem_sessao' }

  const { data } = await getSupabaseAdmin()
    .from('marketplace_produtos')
    .select(COLUNAS_GESTAO)
    .eq('id', produtoId)
    .maybeSingle()

  const p = data as unknown as ProdutoGerido | null
  if (!p || !podeGerir(q, p)) return { produto: null, motivo: 'nao_encontrado' }
  return { produto: p, quem: q }
}

/**
 * Os produtos que esta pessoa pode ver na lista.
 *
 * Um educador vê os dele. O admin vê tudo. A filtragem é feita na QUERY e não depois em memória:
 * filtrar depois significa que a resposta já trouxe os produtos dos outros do servidor, e um erro
 * de serialização ou um log passa a expor o que nunca devia ter saído da base de dados.
 */
export async function produtosSobGestao(quem: Quem, limite = 300): Promise<ProdutoGerido[]> {
  let q = getSupabaseAdmin().from('marketplace_produtos').select(COLUNAS_GESTAO)
  if (quem.papel === 'educador') q = q.eq('educator_id', quem.educatorId).eq('dono', 'educador')
  const { data } = await q.order('created_at', { ascending: false }).limit(limite)
  return (data ?? []) as unknown as ProdutoGerido[]
}

/**
 * Os campos que cada papel pode escrever.
 *
 * ── PORQUE É QUE ISTO É UMA LISTA E NÃO UM `if` ───────────────────────────────────────────
 *
 * Porque a diferença entre os dois papéis não é «o admin pode mais»: é que há campos que o educador
 * NÃO PODE TOCAR por serem o contrato dele, e não um formulário.
 *
 *   · `partilha_pct` — é o acordo. Se o educador o pudesse escrever, escrevia o tecto (90) no
 *     próprio contrato e a margem mínima da casa deixava de ser mínima — e é de dentro dela que sai
 *     a comissão de quem indica vendas. (Esta já estava protegida na rota antiga, com um comentário
 *     a dizer isto; fica aqui para não depender de a próxima rota se lembrar.)
 *   · `dono` — quem decide que um produto é da casa é a casa. Um educador a marcar o produto dele
 *     como sendo da casa perdia o direito a receber por ele; a marcar um da casa como dele,
 *     passava a facturar um scanner da MTM.
 *   · `activo` — é o interruptor do DONO, o que lhe permite tirar um produto de circulação sem
 *     mexer no estado que o educador vê. O educador tem o `retirar` para o que é dele.
 *   · `estado`, `publicado_em`, `motivo_recusa` — publicar é um acto de revisão. O educador PEDE
 *     (accao 'publicar'), não decide.
 *   · `checkout_externo_url` — manda o comprador para fora. Só a casa aponta para fora.
 *
 * Um campo que não esteja em lista nenhuma não se escreve por via nenhuma. É a escolha certa para
 * o erro por omissão: uma coluna nova nasce fechada e alguém tem de a abrir a pensar, em vez de
 * nascer aberta e alguém ter de se lembrar de a fechar.
 */
export const CAMPOS_DO_EDUCADOR = [
  'titulo', 'subtitulo', 'descricao', 'tipo', 'imagem_url', 'conteudo_url', 'conteudo_nota',
  'preco_cents', 'recorrente', 'requer_morada',
  // A periodicidade é do educador porque é ele que sabe se a mentoria dele é mensal ou anual — e
  // porque foi a falta dela que fez a montra escrever «/mês» num produto anual. A coerência com
  // `recorrente` é forçada na rota (`periodicidadeParaGravar`), não confiada ao formulário.
  'periodicidade',
  // A galeria. O tecto de 8 e a ausência da capa são impostos na rota (`galeriaParaGravar`) antes
  // de a restrição da base ter de o fazer com um erro do Postgres à frente de quem está a editar.
  'imagens',
  // A campanha é marketing do produto dele, e o dono pediu que ambos a pudessem mexer. O intervalo
  // (0–90) está preso no `check` da coluna, por isso não há aqui nada que ele possa exagerar.
  'campanha_pct', 'campanha_inicio', 'campanha_fim', 'campanha_tier',
] as const

export const CAMPOS_SO_DO_ADMIN = [
  'partilha_pct', 'dono', 'activo', 'checkout_externo_url', 'apple_product_id',
] as const

export function camposPermitidos(papel: Papel): readonly string[] {
  return papel === 'admin' ? [...CAMPOS_DO_EDUCADOR, ...CAMPOS_SO_DO_ADMIN] : CAMPOS_DO_EDUCADOR
}
