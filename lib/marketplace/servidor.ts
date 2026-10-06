/**
 * O MARKETPLACE DO LADO DE CÁ — as leituras e escritas que precisam da chave de serviço.
 *
 * As REGRAS vivem em `regras.ts` e são puras. Isto é só o que vai à base de dados, e existe
 * separado por um motivo prático: a chave de serviço não pode ser importada por um componente de
 * browser, e se as regras vivessem aqui nenhum ecrã as podia usar para esconder um botão. É a
 * mesma divisão que `perfil-ui.ts` (desenhar) faz com `entitlements.ts` (executar).
 *
 * TUDO O QUE SAI DAQUI PARA A VITRINE JÁ VEM SEM O `conteudo_url`. Não é por distracção que ele
 * falta nos `select` — é a decisão. O cadeado de um produto pago não pode ser o ecrã a esconder
 * um link que o servidor já mandou: foi assim que as playlists VIP do /live acabaram a chegar a
 * toda a gente.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  DEFINICOES_PADRAO,
  PARTILHA_PADRAO_PCT,
  calcularPartilha,
  donoValido,
  partilhaValida,
  type Definicoes,
  type DonoProduto,
} from './regras'

export const CHAVE_DEFINICOES = 'marketplace'

/** As colunas que a MONTRA pode ver. `conteudo_url` e `conteudo_nota` não estão aqui de propósito. */
export const COLUNAS_VITRINE =
  'id, slug, titulo, subtitulo, descricao, tipo, imagem_url, imagens, preco_cents, moeda, estado, activo, educator_id, publicado_em, ' +
  // A periodicidade É O PREÇO. Sem ela o cartão escrevia «624,00 €/mês» num produto anual, porque
  // `recorrente` só diz que repete. A galeria vem com ela porque é a ficha que a desenha, e a ficha
  // lê-se desta mesma rota (`?slug=`).
  'periodicidade, ' +
  // O destaque é ORDEM, não visibilidade (158): decide quem vai ao cimo, entre os que já iam
  // aparecer. Vem na mesma leitura para a montra não ter de perguntar duas vezes.
  'destaque, destaque_ordem, ' +
  // A campanha entra na montra porque o preço com desconto é o preço que se MOSTRA. Sem estas
  // colunas o cartão desenhava o preço de tabela e o checkout cobrava outro — e mostrar um preço
  // e cobrar outro é a única coisa que uma loja não pode fazer nunca.
  'dono, vendedor_nome, recorrente, requer_morada, checkout_externo_url, campanha_pct, campanha_inicio, campanha_fim, campanha_tier, ' +
  // 193 — a subcategoria (ex.: «Tech Crypto») e o «antes» da loja oficial (lido pelo cron de preços).
  'subcategoria, preco_base_cents, ' +
  // 195 — variantes agrupadas: a montra desenha um cartão por grupo, a ficha um selector.
  'grupo, variante_nome, variante_ordem, ' +
  // 196 — a frase do cartão de grupo (sem periodicidade).
  'grupo_subtitulo'

export type ProdutoVitrine = {
  id: string
  slug: string
  titulo: string
  subtitulo: string | null
  descricao: string | null
  tipo: string
  imagem_url: string | null
  /** A galeria, sem a capa. A ficha desenha capa + isto; a montra desenha só a capa. */
  imagens: string[] | null
  periodicidade: string
  /** 158 — vai ao cimo da montra. É ordem, não visibilidade. */
  destaque: boolean
  destaque_ordem: number
  preco_cents: number
  moeda: string
  estado: string
  activo: boolean
  educator_id: string | null
  publicado_em: string | null
  dono: string
  /** Nome de ecrã do vendedor. Nulo = o nome do educador. Ver `nomeDoAutor`. */
  vendedor_nome: string | null
  recorrente: boolean
  requer_morada: boolean
  checkout_externo_url: string | null
  campanha_pct: number | null
  campanha_inicio: string | null
  campanha_fim: string | null
  campanha_tier: string | null
  subcategoria: string | null
  preco_base_cents: number | null
  grupo: string | null
  variante_nome: string | null
  variante_ordem: number
  grupo_subtitulo: string | null
  educador?: { id: string; display_name: string; avatar_url: string | null; specialty: string | null } | null
  jaComprou?: boolean
}

// ── Definições ────────────────────────────────────────────────────────────────────────────

/**
 * Lê o interruptor geral de `site_settings`.
 *
 * O `value` é jsonb em produção, mas as linhas antigas desta tabela são strings — por isso o
 * `typeof === 'string'` fica, como em todo o resto da casa. E o `catch` devolve DESLIGADO: um
 * marketplace que abre por não conseguir perguntar se pode abrir é um marketplace a vender sem
 * autorização.
 */
export async function lerDefinicoes(): Promise<Definicoes> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings')
      .select('value')
      .eq('key', CHAVE_DEFINICOES)
      .maybeSingle()
    const v = data?.value
    const o = (typeof v === 'string' ? JSON.parse(v) : v) as Partial<Definicoes> | null
    if (!o || typeof o !== 'object') return DEFINICOES_PADRAO
    return {
      ligado: o.ligado === true,
      revisaoObrigatoria: o.revisaoObrigatoria !== false,
      iosVitrine: o.iosVitrine === 'esconder' ? 'esconder' : 'ver_sem_comprar',
    }
  } catch {
    return DEFINICOES_PADRAO
  }
}

export async function guardarDefinicoes(patch: Partial<Definicoes>, quem?: string): Promise<Definicoes> {
  const actual = await lerDefinicoes()
  const novo: Definicoes = { ...actual, ...patch }
  await getSupabaseAdmin()
    .from('site_settings')
    .upsert(
      { key: CHAVE_DEFINICOES, value: novo, updated_at: new Date().toISOString(), updated_by: quem ?? null },
      { onConflict: 'key' },
    )
  return novo
}

// ── Vendedores ────────────────────────────────────────────────────────────────────────────

export type Vendedor = {
  educator_id: string
  activo: boolean
  partilha_pct: number
  stripe_connect_account_id: string | null
  notas: string | null
}

export async function lerVendedor(educatorId: string): Promise<Vendedor | null> {
  const { data } = await getSupabaseAdmin()
    .from('marketplace_educadores')
    .select('educator_id, activo, partilha_pct, stripe_connect_account_id, notas')
    .eq('educator_id', educatorId)
    .maybeSingle()
  return (data as Vendedor) ?? null
}

/**
 * Todos os vendedores, por id. Uma consulta e não N: a vitrine precisa de saber, para cada
 * produto, se o autor dele está ligado, e perguntar isso produto a produto é o N+1 clássico.
 */
export async function mapaDeVendedores(): Promise<Map<string, Vendedor>> {
  const { data } = await getSupabaseAdmin()
    .from('marketplace_educadores')
    .select('educator_id, activo, partilha_pct, stripe_connect_account_id, notas')
  const m = new Map<string, Vendedor>()
  for (const v of (data ?? []) as Vendedor[]) m.set(v.educator_id, v)
  return m
}

/** O educador passa a poder vender. Idempotente — chamar duas vezes não muda nada nem rebenta. */
export async function garantirVendedor(educatorId: string): Promise<Vendedor | null> {
  const existente = await lerVendedor(educatorId)
  if (existente) return existente
  const { data } = await getSupabaseAdmin()
    .from('marketplace_educadores')
    .insert({ educator_id: educatorId, activo: false, partilha_pct: PARTILHA_PADRAO_PCT })
    .select('educator_id, activo, partilha_pct, stripe_connect_account_id, notas')
    .maybeSingle()
  return (data as Vendedor) ?? null
}

// ── Educadores (o autor que aparece no cartão) ────────────────────────────────────────────

export type AutorPublico = { id: string; display_name: string; avatar_url: string | null; specialty: string | null }

/**
 * Aceita nulos na lista de propósito: os produtos da casa não têm educador, e obrigar cada
 * chamador a filtrá-los antes era garantir que um deles se esquecia e passava um `null` ao `.in()`.
 */
export async function mapaDeAutores(entrada: (string | null | undefined)[]): Promise<Map<string, AutorPublico>> {
  const m = new Map<string, AutorPublico>()
  const ids = entrada.filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (!ids.length) return m
  const { data } = await getSupabaseAdmin()
    .from('lms_educators')
    // Só o que é público. Esta tabela tem `password_hash` e chaves de ingestão ao lado.
    .select('id, display_name, avatar_url, specialty')
    .in('id', Array.from(new Set(ids)))
  for (const a of (data ?? []) as AutorPublico[]) m.set(a.id, a)
  return m
}

// ── Compras ───────────────────────────────────────────────────────────────────────────────

export type Compra = {
  id: string
  produto_id: string
  educator_id: string
  comprador_id: string
  estado: string
  bruto_cents: number
  parte_educador_cents: number
  moeda: string
  acesso_expira_em: string | null
  pago_em: string
}

export async function comprasDoMembro(userId: string): Promise<Compra[]> {
  const { data } = await getSupabaseAdmin()
    .from('marketplace_compras')
    .select('id, produto_id, educator_id, comprador_id, estado, bruto_cents, parte_educador_cents, moeda, acesso_expira_em, pago_em')
    .eq('comprador_id', userId)
    .order('pago_em', { ascending: false })
  return (data ?? []) as Compra[]
}

export async function vendasDoEducador(educatorId: string, limite = 200): Promise<Compra[]> {
  const { data } = await getSupabaseAdmin()
    .from('marketplace_compras')
    .select('id, produto_id, educator_id, comprador_id, estado, bruto_cents, parte_educador_cents, moeda, acesso_expira_em, pago_em')
    .eq('educator_id', educatorId)
    .order('pago_em', { ascending: false })
    .limit(limite)
  return (data ?? []) as Compra[]
}

/**
 * Regista uma venda. É aqui que a partilha fica CONGELADA na linha.
 *
 * Devolve `{ novo: false }` quando a referência já existe. O webhook do Stripe reentrega o mesmo
 * evento quando a nossa resposta demora, e sem isto o educador via a mesma venda duas vezes e um
 * extracto que ninguém conseguia explicar. O índice único faz o resto do trabalho no servidor —
 * esta verificação é só para não gastar um erro a dizer uma coisa normal.
 */
export async function registarCompra(entrada: {
  produtoId: string
  /** Null num produto da casa: não há educador a quem pagar. */
  educatorId: string | null
  compradorId: string
  fonte: 'stripe' | 'apple' | 'manual' | 'oferta'
  referencia: string
  brutoCents: number
  comissaoLojaCents?: number
  partilhaPct?: number | null
  dono?: DonoProduto | null
  moeda?: string
  acessoExpiraEm?: string | null
  /** O contexto do preço, para a venda se poder explicar. Ver a migração 154. */
  precoTabelaCents?: number | null
  descontoPct?: number | null
  cupaoId?: string | null
  cupaoCodigo?: string | null
  /** Quem trouxe a compra. Separado do cupão: aquele é desconto, este é medição. */
  agenteCodigo?: string | null
  referralId?: string | null
  referralCodigo?: string | null
}): Promise<{ novo: boolean; compraId?: string }> {
  const db = getSupabaseAdmin()
  const { data: ja } = await db
    .from('marketplace_compras')
    .select('id')
    .eq('fonte', entrada.fonte)
    .eq('referencia', entrada.referencia)
    .maybeSingle()
  if (ja?.id) return { novo: false, compraId: ja.id }

  const p = calcularPartilha({
    brutoCents: entrada.brutoCents,
    comissaoLojaCents: entrada.comissaoLojaCents ?? 0,
    partilhaPct: entrada.partilhaPct,
    dono: entrada.dono,
  })

  const { data, error } = await db
    .from('marketplace_compras')
    .insert({
      produto_id: entrada.produtoId,
      educator_id: entrada.educatorId,
      comprador_id: entrada.compradorId,
      fonte: entrada.fonte,
      referencia: entrada.referencia,
      estado: 'paga',
      bruto_cents: p.brutoCents,
      comissao_loja_cents: p.comissaoLojaCents,
      liquido_cents: p.liquidoCents,
      parte_educador_pct: p.parteEducadorPct,
      parte_educador_cents: p.parteEducadorCents,
      parte_casa_cents: p.parteCasaCents,
      moeda: entrada.moeda ?? 'eur',
      acesso_expira_em: entrada.acessoExpiraEm ?? null,
      // Sem estas colunas, uma venda descontada só se lê de uma maneira do lado do educador: «a
      // casa pagou-me menos do que devia». O preço de tabela e o desconto são a explicação.
      preco_tabela_cents: Math.max(0, Math.round(Number(entrada.precoTabelaCents) || 0)) || p.brutoCents,
      desconto_pct: Math.min(90, Math.max(0, Number(entrada.descontoPct) || 0)),
      desconto_cents: Math.max(
        0,
        (Math.max(0, Math.round(Number(entrada.precoTabelaCents) || 0)) || p.brutoCents) - p.brutoCents,
      ),
      cupao_id: entrada.cupaoId || null,
      cupao_codigo: entrada.cupaoCodigo || null,
      agente_codigo: entrada.agenteCodigo || null,
      referral_id: entrada.referralId || null,
      referral_codigo: entrada.referralCodigo || null,
    })
    .select('id')
    .maybeSingle()

  // Corrida: dois eventos ao mesmo tempo, o índice único apanha o segundo. Não é erro.
  if (error) {
    const { data: agora } = await db
      .from('marketplace_compras')
      .select('id')
      .eq('fonte', entrada.fonte)
      .eq('referencia', entrada.referencia)
      .maybeSingle()
    if (agora?.id) return { novo: false, compraId: agora.id }
    throw error
  }
  return { novo: true, compraId: data?.id }
}

/**
 * A percentagem que se aplica a ESTE produto: a do produto se houver, senão a do educador, senão
 * a do acordo por omissão. Nunca devolve nada fora de 50–90.
 */
export function pctDoProduto(
  produto: { partilha_pct?: number | null; dono?: string | null },
  vendedor?: Vendedor | null,
): number {
  // Produto da casa: não há partilha. Devolver 90 aqui era escrever na linha da compra que a casa
  // deve 90% de um scanner a um educador que não existe.
  if (donoValido(produto.dono) === 'casa') return 0
  if (produto.partilha_pct != null) return partilhaValida(produto.partilha_pct)
  if (vendedor?.partilha_pct != null) return partilhaValida(vendedor.partilha_pct)
  return PARTILHA_PADRAO_PCT
}
