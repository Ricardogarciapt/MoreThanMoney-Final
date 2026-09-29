/**
 * QUEM É O DONO DESTE CÓDIGO DE INDICAÇÃO — e a venda que ele gera no livro da equipa.
 *
 * ── PORQUE É QUE ESTE FICHEIRO PRECISOU DE EXISTIR ────────────────────────────────────────
 *
 * Esta casa tem QUATRO sistemas de código de indicação e nenhum deles resolve «código → pessoa»
 * numa função reutilizável:
 *
 *   · `sponsor_username` (metadata do checkout) → `profiles.username` — alimenta o MLM binário;
 *   · `referrals.referral_code` → `profiles.referral_code` — paga DIAS de Premium, não dinheiro;
 *   · `broker_referral_links` — devolve um URL, não uma pessoa;
 *   · `ib_membros` — é adesão, e não um papel de venda.
 *
 * A resolução está escrita à mão em sete sítios (`profiles.eq('username', …)`). O mais próximo de
 * um validador é `app/api/mlm/validate-sponsor`, que não devolve o id de propósito (é público); e
 * `lib/referral.ts` resolve o código MAS tem efeito secundário — oferece 15 dias de Premium ao
 * referente — por isso não serve para validar antes de cobrar.
 *
 * Daí esta função. Aceita os DOIS códigos que identificam uma pessoa desta casa (o username e o
 * `referral_code`), porque quem partilha um link não sabe qual dos dois lhe foi dado, e recusar o
 * que a pessoa tem na mão para depois lhe dizer «código inválido» é o pior dos dois mundos.
 *
 * ── A IDENTIDADE RESOLVE-SE NO CLIQUE E RECONFIRMA-SE NO WEBHOOK ──────────────────────────
 *
 * O `compra.ts` já tem esta regra escrita ao contrário e vale repeti-la: os ACORDOS viajam na
 * metadata (valem o que valiam no momento do clique), a IDENTIDADE vem da tabela. Um vendedor é
 * identidade. Por isso o checkout resolve o código e guarda o uuid na metadata para não voltar a
 * adivinhar — mas o webhook VOLTA a verificar que esse uuid é uma conta activa e que não é o
 * educador do produto, em vez de confiar no que lhe chega.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { referralAceitavel, type ReferralResolvido } from './referral'

/**
 * O código como se compara. Os `username` desta casa são minúsculos; os `referral_code` não são
 * necessariamente. Guarda-se o que a pessoa escreveu e compara-se dos dois lados.
 */
export function normalizarCodigoReferral(bruto: string | null | undefined): string {
  return String(bruto ?? '').trim().replace(/^@/, '').slice(0, 64)
}

/**
 * Código → pessoa. Só contas ACTIVAS.
 *
 * `is_active = false` é a alavanca que fecha tudo nesta casa (conta em pausa, activação pendente,
 * trial expirado). Pagar comissão a uma conta fechada é prometer dinheiro a alguém que não tem como
 * o receber, e depois é uma conversa.
 */
export async function resolverReferral(
  codigo: string | null | undefined,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<ReferralResolvido | null> {
  const c = normalizarCodigoReferral(codigo)
  if (!c) return null

  // Duas consultas e não um `or(...)`: o `or` do PostgREST recebe o valor dentro de uma string de
  // filtro, e um código com vírgula ou parêntesis torna-se injecção de filtro. É a mesma decisão,
  // e pela mesma razão, que `atribuicao-leitura.ts` tomou para os emails.
  const porUsername = await db
    .from('profiles')
    .select('id, is_active')
    .eq('username', c.toLowerCase())
    .maybeSingle()

  if (porUsername.data?.id) {
    return { userId: porUsername.data.id as string, codigo: c, activo: porUsername.data.is_active !== false }
  }

  const porCodigo = await db
    .from('profiles')
    .select('id, is_active')
    .eq('referral_code', c)
    .maybeSingle()

  if (porCodigo.data?.id) {
    return { userId: porCodigo.data.id as string, codigo: c, activo: porCodigo.data.is_active !== false }
  }

  return null
}

/**
 * O perfil do site do educador de um produto — a ponte entre as duas identidades desta casa.
 *
 * Um educador NÃO é um utilizador do site: tem sessão própria, e `lms_educators.profile_id` é
 * escrita no admin por correspondência de email. Hoje está preenchida em 1 dos 5 educadores.
 *
 * Quando está vazia não há como comparar, e devolve-se `null`. A regra «o educador não pode ser
 * referral de si próprio» fica, nesse caso, por verificar aqui — e é exactamente por isso que ela
 * está fechada em três sítios (checkout, cálculo e trigger da base de dados) em vez de um.
 *
 * DÍVIDA A REGISTAR: enquanto `profile_id` estiver vazia para 4 dos 5 educadores, um educador com
 * conta de site consegue pôr o próprio código numa compra do produto dele e a verificação do
 * checkout não o apanha. O trigger também não (compara a mesma coluna). Fechar isto é preencher a
 * coluna, não escrever mais código.
 */
export async function perfilDoEducador(
  educatorId: string | null | undefined,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<string | null> {
  if (!educatorId) return null
  const { data } = await db.from('lms_educators').select('profile_id').eq('id', educatorId).maybeSingle()
  return (data?.profile_id as string | null) ?? null
}

/**
 * Valida um código antes de cobrar. Devolve a pessoa, ou o motivo pelo qual não conta.
 *
 * Chamada pelo checkout. Um código errado TEM de ser dito: se desaparecer em silêncio, quem
 * comprou acredita que a indicação contou e quem indicou nunca percebe porque é que a comissão não
 * apareceu — e essa conversa acontece semanas depois, sem dados para a resolver.
 */
export async function validarReferralParaCompra(entrada: {
  codigo: string | null | undefined
  compradorId: string
  educatorIdDoProduto: string | null | undefined
  db?: SupabaseClient
}): Promise<ReturnType<typeof referralAceitavel>> {
  const db = entrada.db ?? getSupabaseAdmin()
  const referral = await resolverReferral(entrada.codigo, db)
  const perfilEducador = await perfilDoEducador(entrada.educatorIdDoProduto, db)
  return referralAceitavel({
    referral,
    codigoEscrito: entrada.codigo,
    compradorId: entrada.compradorId,
    perfilDoEducadorDoProduto: perfilEducador,
  })
}

/**
 * O NEGÓCIO que leva a comissão ao livro da equipa.
 *
 * ── PORQUE É QUE ISTO NÃO ESCREVE COMISSÕES DIRECTAMENTE ──────────────────────────────────
 *
 * Porque o livro da equipa (`lib/vendas/livro.ts`) só sabe pagar a partir de um `vendas_negocios`:
 * lê `prospector_id`, `setter_id`, `closer_id`, `team_leader_id` e `afiliado_id`, e mais nada. Uma
 * venda com um código de indicação e sem negócio produz zero comissões — em silêncio.
 *
 * Então cria-se (ou encontra-se) o negócio, com quem indicou no papel de `afiliado`. Uma venda do
 * marketplace com referral passa a produzir EXACTAMENTE o mesmo tipo de linha que uma venda de pack,
 * pelas mesmas `vendas_regras_comissao`, e aparece nos mesmos extractos. Era esse o requisito.
 *
 * ── O EFEITO SECUNDÁRIO QUE O DONO TEM DE SABER ───────────────────────────────────────────
 *
 * `vendaPagaPelaEquipa(compradorId)` responde «sim» quando o comprador tem um negócio com um papel
 * preenchido — e responde por COMPRADOR, não por venda. Ou seja: criar este negócio faz com que as
 * OUTRAS compras dessa pessoa (um pack do site, por exemplo) deixem de pagar comissão binária de
 * MLM, porque o sistema passa a considerar que ela é uma venda da equipa.
 *
 * Isso não é um defeito deste código — é a regra de exclusividade da casa («o mesmo euro não paga
 * duas vezes») a funcionar. Mas é uma consequência real de aceitar um código de indicação num curso
 * de 40 €, e tem de ser uma decisão do dono e não um efeito colateral que ninguém viu.
 *
 * Por isso o negócio criado aqui leva `origem: 'marketplace'` e uma nota que diz de onde veio:
 * quando alguém for perceber porque é que o binário de uma pessoa parou, a resposta está escrita.
 *
 * ── O QUE A COMPRA SEM LOGIN ACRESCENTA A ISTO (e ainda não está decidido) ────────────────
 *
 * Com a compra sem login, este negócio passa a poder nascer para alguém que NUNCA foi membro: uma
 * pessoa que chega à montra pelo link de um afiliado, escreve o email, compra um curso de 40 € e
 * fica com um `vendas_negocios` em nome dela antes de existir como cliente da casa.
 *
 * A consequência é a de sempre, mas agora atinge um desconhecido em vez de um membro já nosso:
 * quando essa pessoa comprar, meses depois, um Premium de 65 €/mês com um sponsor de MLM, o
 * `vendaPagaPelaEquipa` responde «sim» e o binário NÃO paga a quem a recrutou — porque um código de
 * indicação de um curso de 40 € já a reclamou.
 *
 * O código não decide isto sozinho: a regra da casa («o mesmo euro não paga duas vezes») é do dono,
 * e a escolha entre as três saídas — deixar como está, limitar o negócio do marketplace a um
 * afiliado por VENDA em vez de por comprador, ou não criar negócio quando a conta foi criada pela
 * própria compra — é de negócio e não de implementação. Fica escrito aqui para a conversa ter dados.
 */
export async function negocioParaComissao(entrada: {
  compradorId: string
  emailComprador?: string | null
  referralUserId: string
  produtoTitulo: string
  db?: SupabaseClient
}): Promise<string | null> {
  const db = entrada.db ?? getSupabaseAdmin()
  const chave = `perfil:${entrada.compradorId}`

  try {
    // Já existe um negócio deste comprador? Então é esse, e NÃO se lhe toca no afiliado: pode ter
    // sido trabalhado por uma pessoa da equipa, e sobrepor-lhe um código de indicação era tirar a
    // comissão a quem fez o trabalho.
    const { data: existente } = await db
      .from('vendas_negocios')
      .select('id, afiliado_id, prospector_id, setter_id, closer_id, team_leader_id')
      .eq('chave_origem', chave)
      .maybeSingle()

    if (existente?.id) {
      const temAlguem =
        existente.afiliado_id || existente.prospector_id || existente.setter_id ||
        existente.closer_id || existente.team_leader_id
      if (temAlguem) return existente.id as string

      // Existe mas está vazio: o código de indicação preenche o lugar do afiliado.
      await db.from('vendas_negocios').update({ afiliado_id: entrada.referralUserId }).eq('id', existente.id)
      return existente.id as string
    }

    const { data: criado, error } = await db
      .from('vendas_negocios')
      .insert({
        nome: entrada.produtoTitulo.slice(0, 120),
        email: entrada.emailComprador ?? null,
        comprador_id: entrada.compradorId,
        chave_origem: chave,
        afiliado_id: entrada.referralUserId,
        pack_previsto: 'marketplace',
        origem: 'marketplace',
        estado: 'ganho',
        nota: `Criado por uma compra no marketplace com código de indicação. Ver a nota em lib/marketplace/referral-servidor.ts sobre o efeito na exclusividade do MLM.`,
      })
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('[marketplace] não foi possível criar o negócio para a comissão:', error.message)
      return null
    }
    return (criado?.id as string) ?? null
  } catch (e) {
    // Nunca rebenta: a venda já aconteceu e o acesso já foi dado. Uma comissão por registar é um
    // problema humano; um webhook a falhar é o Stripe a repetir o evento todo.
    console.error('[marketplace] negócio para comissão falhou:', e)
    return null
  }
}
