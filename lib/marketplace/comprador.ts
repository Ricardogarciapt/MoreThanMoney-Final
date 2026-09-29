/**
 * COMPRAR SEM LOGIN — a conta do comprador, e o que ela NÃO é.
 *
 * O checkout do marketplace exigia sessão e devolvia 401 a um visitante. Passa a aceitar o email: a
 * conta cria-se no checkout, antes do pagamento, e a compra fica agarrada a ela desde o primeiro
 * momento. É o que faz o acesso funcionar depois — a biblioteca lê `marketplace_compras`, que precisa
 * de um `comprador_id`.
 *
 * ── UM COMPRADOR NÃO É UM MEMBRO ──────────────────────────────────────────────────────────
 *
 * Esta é a regra que manda em tudo o que está aqui. O perfil criado aqui nasce SEM direitos: sem
 * `member_category`, sem `subscription_plan`, sem `subscription_status`, sem `subscription_expires_at`,
 * sem `subscription_platform`. Quem compra um curso de 40 € a um educador é um comprador desse curso
 * e mais nada.
 *
 * Por isso NÃO se reaproveita o `provisionStripeRegistrationFromSession` (o caminho do
 * `pending_registration` do webhook, que é o padrão desta casa para «registar e pagar no mesmo
 * checkout»). Fui ver como funciona: ele chama `createProfileAfterPayment`, que escreve
 * `member_category`, `subscription_plan`, `subscription_status: 'active'` e `is_active: true` — ou
 * seja, provisiona um MEMBRO PAGO. Está certo para o que ele faz (vender um pack do site) e está
 * errado para isto. O que se reaproveita dele é a parte que é mesmo comum: o email de definir
 * password (`generatePasswordRecoveryLink`), que é como a pessoa entra na conta a seguir.
 *
 * ── O EMAIL É A CHAVE, E NUNCA HÁ UMA SEGUNDA CONTA ───────────────────────────────────────
 *
 * Se já existir conta com aquele email, a compra liga-se a ela. Sempre. Esta casa já tem o problema
 * de pessoas com duas contas (o Supabase não as funde e os direitos têm de ser espelhados à mão), e
 * uma montra pública é a maneira mais fácil de o multiplicar.
 *
 * Um efeito disto que é preciso dizer em voz alta: quem escrever o email de outra pessoa está a
 * comprar-lhe um curso. Não ganha acesso nenhum à conta dela — não há sessão, não há password, e o
 * email de definir password vai para a caixa de correio do dono do endereço. O produto aparece na
 * biblioteca de quem é dono do email, que é a leitura menos má das duas (a outra seria criar uma
 * segunda conta com o mesmo email, e essa é a que esta casa já sabe que custa caro).
 *
 * ── PREÇO DE VISITANTE, SEMPRE ────────────────────────────────────────────────────────────
 *
 * Uma compra sem login é cotada como visitante, mesmo quando o email é de um Premium. As campanhas
 * com `campanha_tier` são um desconto de MEMBRO, e escrever o email de um membro não prova que se é
 * esse membro. Dar o preço de membro a quem só escreveu um endereço era publicar um cupão que
 * qualquer pessoa adivinha. Quem quer o preço de membro entra — e aí a sessão prova quem é.
 *
 * ── PAGAMENTO FALHADO: A CONTA FICA, MARCADA ──────────────────────────────────────────────
 *
 * A conta cria-se antes de o dinheiro entrar, logo um pagamento abandonado deixa-a para trás. A
 * decisão é: FICA.
 *
 *   · Apagar era o pior dos caminhos. A pessoa que desiste no Stripe volta muitas vezes no mesmo dia,
 *     e apagar significa que, se ela entretanto pediu a password ou o email já saiu, nada bate certo.
 *     E se ela voltar a comprar, apagar e recriar troca-lhe o `id` — que é a chave de tudo o que se
 *     lhe ligar a seguir.
 *   · Deixá-la a PARECER um membro também não: é exactamente o defeito que este trabalho fechou.
 *
 * Então fica com zero direitos e com uma marca em `profile_data.marketplace`:
 * `{ comprador: true, pendente_pagamento: true, criado_em }` (ver `comprador-marca.ts`). A marca cai quando a compra é
 * entregue (`compraEntregue`). Enquanto ela estiver de pé, a linha é identificável numa consulta e
 * distingue-se de um membro real por não ter direito nenhum — nem no site, nem nas apps, nem no MTM
 * Auto, porque todos eles leem `subscription_plan`/`member_category`, que aqui estão vazios.
 *
 * NÃO se envia email nenhum na criação, e é deliberado: um email de «define a tua password» enviado
 * antes de haver pagamento transformava esta rota numa forma de mandar emails nossos a qualquer
 * endereço que alguém escrevesse. O convite sai do webhook, depois de o dinheiro entrar.
 *
 * O QUE ISTO AINDA NÃO TEM, e o dono precisa de decidir: um limite de criações por IP/hora. Sem ele,
 * é possível encher a tabela de perfis sem direitos escrevendo emails inventados. Não dá acesso a
 * nada nem envia emails, mas é ruído numa tabela que a casa lê muito.
 */

import { randomBytes } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/** O email como se compara e se grava. Minúsculas, sem espaços. */
export function emailNormalizado(bruto: unknown): string {
  return String(bruto ?? '').trim().toLowerCase().slice(0, 254)
}

/**
 * Serve para cobrar? Um teste deliberadamente simples.
 *
 * Quem valida o email a sério é o Stripe (manda o recibo) e o nosso email de definir password (que
 * chega ou não chega). Uma expressão regular ambiciosa aqui só recusa endereços válidos e estranhos —
 * e recusar uma compra por causa de um `+` ou de um domínio novo é perder dinheiro para nada.
 */
export function emailServeParaComprar(bruto: unknown): boolean {
  const e = emailNormalizado(bruto)
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(e)
}

/** O nome de utilizador de partida, a partir do email. Só o que a coluna aceita. */
export function baseDoUsername(email: string): string {
  const local = emailNormalizado(email).split('@')[0] ?? ''
  const limpo = local.replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+|[._-]+$/g, '').slice(0, 24)
  return limpo.length >= 3 ? limpo : `comprador${randomBytes(3).toString('hex')}`
}

export type ContaDoComprador = {
  userId: string
  email: string
  /** `true` quando esta compra criou a conta. É o que decide se há convite para enviar depois. */
  criada: boolean
}

/**
 * Um username livre. A coluna é única, e um choque aqui fazia o insert falhar e a compra morrer
 * antes de chegar ao Stripe — por uma coisa que se resolve com quatro caracteres a mais.
 */
async function usernameLivre(email: string): Promise<string> {
  const db = getSupabaseAdmin()
  const base = baseDoUsername(email)
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const nome = tentativa === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`
    const { data } = await db.from('profiles').select('id').eq('username', nome).maybeSingle()
    if (!data?.id) return nome
  }
  return `${base}-${randomBytes(4).toString('hex')}`
}

/**
 * A conta que vai ficar dona desta compra. Encontra ou cria — nunca duplica.
 *
 * Devolve `null` quando não foi possível (e aí o checkout recusa em vez de cobrar sem saber a quem
 * entregar: cobrar primeiro e resolver a identidade depois é como se fica com dinheiro de alguém que
 * não se consegue identificar).
 */
export async function contaDoComprador(entrada: {
  email: string
  nome?: string | null
}): Promise<ContaDoComprador | null> {
  const email = emailNormalizado(entrada.email)
  if (!emailServeParaComprar(email)) return null
  const db = getSupabaseAdmin()

  // 1. Já há perfil com este email? Então é este, e não se lhe toca em nada. Em NADA: um perfil
  //    existente não ganha marca de comprador nem perde o que já tem.
  const { data: existente } = await db
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  if (existente?.id) return { userId: existente.id as string, email, criada: false }

  const nome = String(entrada.nome ?? '').trim().slice(0, 120) || email.split('@')[0]
  const username = await usernameLivre(email)

  // 2. Criar o utilizador de autenticação. A password é aleatória e ninguém a sabe — a pessoa define
  //    a sua pelo link que recebe depois de pagar. `email_confirm: true` porque o endereço vai ser
  //    confirmado pelo pagamento e pelo recibo do Stripe.
  let userId: string
  const { data: criado, error: erroAuth } = await db.auth.admin.createUser({
    email,
    password: randomBytes(32).toString('base64url'),
    email_confirm: true,
    user_metadata: { full_name: nome, username },
  })

  if (erroAuth) {
    // Existe autenticação sem perfil (o caso do OAuth que nunca completou registo). Reaproveita-se o
    // id — criar outro era criar a segunda conta que esta casa não quer.
    if (!/already\s+(been\s+)?registered|already\s+exists/i.test(erroAuth.message)) {
      console.error('[marketplace] não foi possível criar a conta do comprador:', erroAuth.message)
      return null
    }
    const { findAuthUserByEmail } = await import('@/lib/stripe-complete-registration')
    const antigo = await findAuthUserByEmail(email).catch(() => null)
    if (!antigo?.id) {
      console.error('[marketplace] email já registado mas utilizador não encontrado:', email)
      return null
    }
    userId = antigo.id
  } else {
    userId = criado.user.id
  }

  // 3. O perfil SEM DIREITOS. A lista de campos é curta de propósito: tudo o que não está aqui é
  //    coisa que um comprador não tem — nem categoria, nem plano, nem estado de subscrição, nem data
  //    de expiração. O que marca esta conta é `profile_data.marketplace`, e o porquê de não ser um
  //    `user_type` novo está em `comprador-marca.ts` (resumo: o CHECK da coluna não o aceita, e «de
  //    onde veio a conta» não é a mesma pergunta que «que tipo de conta é»).
  const { error: erroPerfil } = await db.from('profiles').upsert(
    {
      id: userId,
      email,
      full_name: nome,
      username,
      user_type: 'member',
      is_active: true,
      checkout_source: 'marketplace',
      profile_data: {
        marketplace: { comprador: true, pendente_pagamento: true, criado_em: new Date().toISOString() },
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (erroPerfil) {
    console.error('[marketplace] não foi possível criar o perfil do comprador:', erroPerfil.message)
    return null
  }

  return { userId, email, criada: true }
}

/**
 * A COMPRA FOI ENTREGUE — tira a marca de «pendente» e convida a pessoa a entrar.
 *
 * Chamado pelo webhook, depois de a linha de `marketplace_compras` estar escrita. Idempotente: a
 * marca cai na primeira passagem, por isso um evento reentregue pelo Stripe não manda um segundo
 * email.
 *
 * O convite é o email de definir password que o registo pago já usa. Sem ele, a pessoa pagou, tem a
 * compra na conta e não tem como entrar nela — que é a mesma coisa que não ter comprado.
 */
export async function compraEntregue(userId: string): Promise<void> {
  try {
    const db = getSupabaseAdmin()
    const { data: perfil } = await db
      .from('profiles')
      .select('id, email, full_name, username, profile_data')
      .eq('id', userId)
      .maybeSingle()
    if (!perfil) return

    const dados = (perfil.profile_data && typeof perfil.profile_data === 'object'
      ? perfil.profile_data
      : {}) as Record<string, unknown>
    const mkt = (dados.marketplace && typeof dados.marketplace === 'object'
      ? dados.marketplace
      : {}) as Record<string, unknown>
    if (mkt.pendente_pagamento !== true) return

    await db
      .from('profiles')
      .update({
        profile_data: {
          ...dados,
          marketplace: { ...mkt, pendente_pagamento: false, pago_em: new Date().toISOString() },
        },
      })
      .eq('id', userId)

    const email = String(perfil.email ?? '')
    if (!email) return
    const { generatePasswordRecoveryLink } = await import('@/lib/stripe-complete-registration')
    const { sendPasswordRecoveryEmail } = await import('@/lib/email-service')
    const link = await generatePasswordRecoveryLink(email)
    if (!link) {
      console.warn('[marketplace] sem link de acesso para o comprador — enviar à mão:', email)
      return
    }
    await sendPasswordRecoveryEmail(
      email,
      String(perfil.full_name ?? '') || email.split('@')[0],
      String(perfil.username ?? '') || email.split('@')[0],
      link,
    )
  } catch (e) {
    // Engolido: a compra já está escrita e o acesso já existe. Um convite que não saiu é um email a
    // reenviar à mão; um webhook a falhar faz o Stripe repetir o evento inteiro.
    console.error('[marketplace] falhou o convite de acesso ao comprador:', e)
  }
}
