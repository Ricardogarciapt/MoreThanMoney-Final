/**
 * A MARCA DE COMPRADOR — onde ela vive, e porque não vive no `user_type`.
 *
 * A primeira versão disto escrevia `user_type = 'comprador'`. Estava errada, e a base de dados
 * dizia-o: `profiles_user_type_check` só aceita
 * ('member','admin','pending','guest','presentation','inactive','vip','tournament'). O insert
 * falhava, a rota recusava a compra com «não foi possível preparar a tua conta» e o visitante não
 * comprava nada. Um valor novo ali obrigava a uma migração — ou seja, a funcionalidade nascia morta
 * até alguém a aplicar.
 *
 * Então a marca vive em `profile_data.marketplace`, que é jsonb e não precisa de esquema novo. É o
 * mesmo sítio e o mesmo idioma do portão de activação (`profile_data.activation`), e pela mesma
 * razão que está escrita lá: «o middleware já traz `profile_data`, por isso não precisa de coluna
 * nova».
 *
 * E é melhor do que um tipo de conta. «Comprador» não é o que a pessoa É — é como a conta NASCEU.
 * Quem hoje só comprou um curso pode amanhã pagar um Premium, e nesse dia nada tem de ser
 * desmarcado: os direitos vêm de `subscription_plan`/`member_category`, que é onde sempre vieram. A
 * marca só continua a responder a «de onde veio esta conta?» e a «esta conta pode entrar?».
 *
 * ── PURO E SEM DEPENDÊNCIAS, DE PROPÓSITO ─────────────────────────────────────────────────
 *
 * Quem lê isto é `lib/member-access.ts` e `lib/role-redirect.ts` — que correm no BROWSER e no
 * middleware (edge). Nenhum dos dois pode importar `lib/marketplace/comprador.ts`, que puxa o
 * cliente de serviço do Supabase. Por isso a leitura vive aqui, sem um único import.
 */

type ComProfileData = { profile_data?: unknown } | null | undefined
type ComPack = ComProfileData & { subscription_plan?: unknown; member_category?: unknown }

function marcaDoMarketplace(profile: ComProfileData): Record<string, unknown> {
  const dados = profile?.profile_data
  if (!dados || typeof dados !== 'object') return {}
  const m = (dados as Record<string, unknown>).marketplace
  return m && typeof m === 'object' ? (m as Record<string, unknown>) : {}
}

/** Esta conta nasceu de uma compra na montra? */
export function ehCompradorDoMarketplace(profile: ComProfileData): boolean {
  return marcaDoMarketplace(profile).comprador === true
}

/**
 * A compra que criou a conta ainda não foi paga?
 *
 * É isto que distingue uma conta órfã (alguém desistiu no Stripe) de um comprador a sério, sem
 * nunca a fazer parecer um membro — porque nem uma nem outra tem direito nenhum.
 */
export function compradorPendenteDePagamento(profile: ComProfileData): boolean {
  return ehCompradorDoMarketplace(profile) && marcaDoMarketplace(profile).pendente_pagamento === true
}

/**
 * COMPRADOR E SÓ COMPRADOR — nasceu da montra e não tem pack nenhum.
 *
 * É esta, e não `ehCompradorDoMarketplace`, que as portas do site usam. A diferença importa: a marca
 * FICA no perfil para sempre (é a história de como a conta nasceu), e se as portas lessem só a marca,
 * um comprador que mais tarde pagasse um Premium continuava a passar mesmo depois de a subscrição
 * dele expirar — a marca de um curso de 40 € a servir de chave permanente ao que se deixou de pagar.
 *
 * Com pack — activo ou expirado — as regras normais decidem. Sem pack, é um comprador: entra na conta
 * e abre o que comprou, e mais nada.
 */
export function compradorSemPack(profile: ComPack): boolean {
  if (!ehCompradorDoMarketplace(profile)) return false
  const plano = String(profile?.subscription_plan ?? '').trim()
  const categoria = String(profile?.member_category ?? '').trim()
  return !plano && !categoria
}
