import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { carregarDireitos } from '@/lib/entitlements'

/**
 * Licenças do MTM Sensei EA — emitir, validar, revogar.
 *
 * O EA corre no computador do cliente, onde tudo é editável. A única coisa que ele não consegue
 * inventar é o número da conta MT5: quem lho diz é a corretora, não o ficheiro. Por isso a licença
 * prende-se ao login e a validação é feita aqui, no servidor.
 *
 * Duas portas para a mesma licença:
 *
 *   • Membro Premium/VIP/admin emite a sua na área de membro (plano 'incluida'). Não tem validade
 *     própria — vale enquanto a subscrição valer. Guardar aqui uma data de fim era guardar uma
 *     cópia de um estado que muda noutro sítio, e as cópias ficam desactualizadas.
 *   • Quem não é membro compra (plano 'anual' ou 'vitalicia'), com ou sem conta no site.
 *
 * A validação nunca responde "não" sem dizer porquê: o EA mostra a razão no separador de
 * Experts, e um cliente que vê "esta chave já está noutra conta" resolve-se sozinho.
 */

export const PRODUTO_EA = 'sensei_ea'

export const PRECO_ANUAL_EUR = 297
export const PRECO_VITALICIO_EUR = 1000

export type PlanoLicenca = 'anual' | 'vitalicia' | 'incluida'
export type OrigemLicenca = 'membro' | 'stripe' | 'admin'
export type EstadoLicenca = 'ativa' | 'revogada' | 'expirada'

export interface Licenca {
  id: string
  chave: string
  user_id: string | null
  email: string | null
  produto: string
  origem: OrigemLicenca
  plano: PlanoLicenca
  contas_permitidas: number
  mt5_login: string | null
  estado: EstadoLicenca
  expira_em: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_payment_intent: string | null
  notas: string | null
  criada_em: string
  atualizada_em: string
}

/**
 * Alfabeto sem os caracteres que se confundem ao ler em voz alta ou a copiar de um email:
 * 0/O, 1/I/L, 5/S, 8/B. A chave é lida por humanos antes de ser colada no MetaTrader.
 */
const ALFABETO = 'ACDEFGHJKMNPQRTUVWXYZ2346789'

function bloco(n: number): string {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length]
  return s
}

export function gerarChave(): string {
  return `MTM-${bloco(4)}-${bloco(4)}-${bloco(4)}`
}

/** Aceita a chave escrita à mão: minúsculas, espaços a mais, traços a menos. */
export function normalizarChave(bruta: string): string {
  const limpa = String(bruta || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!limpa.startsWith('MTM') || limpa.length !== 15) return String(bruta || '').trim().toUpperCase()
  const c = limpa.slice(3)
  return `MTM-${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`
}

/**
 * O login MT5 é só dígitos. O cliente escreve-o de todas as maneiras — com o nome da corretora
 * atrás, com espaços, com um `#` à frente — e o EA envia-o como o terminal lho dá.
 */
export function normalizarLogin(bruto: unknown): string {
  return String(bruto ?? '').replace(/\D/g, '')
}

/**
 * Quem tem direito à licença incluída na subscrição.
 *
 * Vive aqui, e não repetida em cada rota, porque há dois sítios a emitir — o botão da área de
 * membro e a emissão em lote do admin — e duas cópias desta regra divergiam no dia em que uma
 * delas fosse actualizada. A cópia automática (MTM Copy / MTM Auto) NÃO conta: o EA é outro
 * produto, e quem paga só a cópia não pagou este.
 */
export function temDireitoAIncluida(d: { admin: boolean; vip: boolean; premium: boolean }): boolean {
  return d.admin || d.vip || d.premium
}

// ---------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------

export interface PedidoEmissao {
  userId?: string | null
  email?: string | null
  plano: PlanoLicenca
  origem: OrigemLicenca
  mt5Login?: string | null
  contasPermitidas?: number
  expiraEm?: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePaymentIntent?: string | null
  notas?: string | null
}

export async function emitirLicenca(p: PedidoEmissao): Promise<Licenca> {
  const db = getSupabaseAdmin()
  const login = normalizarLogin(p.mt5Login)

  // Uma colisão de chave é improvável (28^12), mas a base de dados é que manda: se a chave já
  // existir o insert falha no índice único e tentamos outra, em vez de escrever por cima.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data, error } = await db
      .from('licencas')
      .insert({
        chave: gerarChave(),
        user_id: p.userId ?? null,
        email: p.email?.trim().toLowerCase() ?? null,
        produto: PRODUTO_EA,
        origem: p.origem,
        plano: p.plano,
        contas_permitidas: p.contasPermitidas ?? 1,
        mt5_login: login || null,
        estado: 'ativa',
        expira_em: p.expiraEm ?? null,
        stripe_customer_id: p.stripeCustomerId ?? null,
        stripe_subscription_id: p.stripeSubscriptionId ?? null,
        stripe_payment_intent: p.stripePaymentIntent ?? null,
        notas: p.notas ?? null,
      })
      .select('*')
      .single()

    if (!error && data) return data as Licenca
    if (error && error.code !== '23505') throw new Error(error.message)
  }
  throw new Error('Não foi possível gerar uma chave única')
}

/** Um ano a contar de agora — a validade das licenças anuais compradas. */
export function daquiAUmAno(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Validação (é isto que o EA chama)
// ---------------------------------------------------------------------------

export interface ResultadoValidacao {
  ok: boolean
  /** Código curto e estável — o EA decide o comportamento por aqui, não pela frase. */
  codigo:
    | 'valida'
    | 'sem_chave'
    | 'sem_conta'
    | 'desconhecida'
    | 'revogada'
    | 'expirada'
    | 'sem_subscricao'
    | 'conta_diferente'
    | 'limite_contas'
    | 'erro'
  /** Frase para o cliente ler no separador de Experts. */
  mensagem: string
  plano?: PlanoLicenca
  expiraEm?: string | null
  contasUsadas?: number
  contasPermitidas?: number
}

export interface ContextoValidacao {
  chave: string
  mt5Login: string
  corretora?: string | null
  servidor?: string | null
  terminal?: string | null
}

export async function validarLicenca(ctx: ContextoValidacao): Promise<ResultadoValidacao> {
  const chave = normalizarChave(ctx.chave)
  const login = normalizarLogin(ctx.mt5Login)

  if (!chave) return { ok: false, codigo: 'sem_chave', mensagem: 'Falta a chave de licença.' }
  if (!login)
    return { ok: false, codigo: 'sem_conta', mensagem: 'Não foi possível ler o número da conta MT5.' }

  const db = getSupabaseAdmin()
  const { data: lic, error } = await db
    .from('licencas')
    .select('*')
    .eq('chave', chave)
    .maybeSingle()

  if (error) return { ok: false, codigo: 'erro', mensagem: 'Erro a validar a licença.' }
  if (!lic) return { ok: false, codigo: 'desconhecida', mensagem: 'Chave de licença desconhecida.' }

  const licenca = lic as Licenca

  if (licenca.estado === 'revogada')
    return { ok: false, codigo: 'revogada', mensagem: 'Esta licença foi revogada.' }

  if (licenca.expira_em && new Date(licenca.expira_em) <= new Date()) {
    // Marcar o estado poupa a leitura da data nas próximas vezes, mas não é isso que decide:
    // a data acima é que manda, mesmo que a marcação falhe.
    await db.from('licencas').update({ estado: 'expirada' }).eq('id', licenca.id)
    return {
      ok: false,
      codigo: 'expirada',
      mensagem: 'A licença expirou. Renova em morethanmoney.pt/sensei-ea',
      plano: licenca.plano,
      expiraEm: licenca.expira_em,
    }
  }

  // Licença de membro: quem manda é a subscrição, não esta linha. Se o cliente deixou de ser
  // Premium, a chave que emitiu deixa de funcionar sem ninguém ter de a ir revogar à mão.
  if (licenca.plano === 'incluida') {
    if (!licenca.user_id)
      return { ok: false, codigo: 'sem_subscricao', mensagem: 'Licença de membro sem utilizador associado.' }
    const d = await carregarDireitos(licenca.user_id)
    if (!d.admin && !d.vip && !d.premium) {
      return {
        ok: false,
        codigo: 'sem_subscricao',
        mensagem: 'A licença está ligada a uma subscrição Premium que já não está activa.',
      }
    }
  }

  // A licença ficou presa a uma conta na emissão? Então é essa e mais nenhuma.
  if (licenca.mt5_login && licenca.mt5_login !== login) {
    return {
      ok: false,
      codigo: 'conta_diferente',
      mensagem: `Esta licença está emitida para a conta ${licenca.mt5_login}.`,
    }
  }

  const { data: ativacoes } = await db
    .from('licenca_ativacoes')
    .select('id, mt5_login, validacoes')
    .eq('licenca_id', licenca.id)

  const jaAtivas = ativacoes ?? []
  const minha = jaAtivas.find((a) => a.mt5_login === login)

  if (!minha && jaAtivas.length >= licenca.contas_permitidas) {
    return {
      ok: false,
      codigo: 'limite_contas',
      mensagem:
        licenca.contas_permitidas === 1
          ? `Esta licença já está a ser usada na conta ${jaAtivas[0]?.mt5_login}.`
          : `Esta licença já está no limite de ${licenca.contas_permitidas} contas.`,
      contasUsadas: jaAtivas.length,
      contasPermitidas: licenca.contas_permitidas,
    }
  }

  await db.from('licenca_ativacoes').upsert(
    {
      licenca_id: licenca.id,
      mt5_login: login,
      corretora: ctx.corretora ?? null,
      servidor: ctx.servidor ?? null,
      terminal: ctx.terminal ?? null,
      ultima_em: new Date().toISOString(),
      validacoes: (minha?.validacoes ?? 0) + 1,
    },
    { onConflict: 'licenca_id,mt5_login' },
  )

  // Primeira conta a usar uma licença que ficou em aberto: prende-se aqui. É o caso de quem
  // compra sem saber ainda o número da conta — escolhe-a ao ligar o EA pela primeira vez.
  if (!licenca.mt5_login && licenca.contas_permitidas === 1) {
    await db.from('licencas').update({ mt5_login: login }).eq('id', licenca.id)
  }

  return {
    ok: true,
    codigo: 'valida',
    mensagem: 'Licença válida.',
    plano: licenca.plano,
    expiraEm: licenca.expira_em,
    contasUsadas: minha ? jaAtivas.length : jaAtivas.length + 1,
    contasPermitidas: licenca.contas_permitidas,
  }
}

// ---------------------------------------------------------------------------
// Leitura e gestão
// ---------------------------------------------------------------------------

export async function licencasDoUtilizador(userId: string): Promise<Licenca[]> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('licencas')
    .select('*')
    .eq('user_id', userId)
    .eq('produto', PRODUTO_EA)
    .order('criada_em', { ascending: false })
  return (data ?? []) as Licenca[]
}

export async function revogarLicenca(id: string, notas?: string): Promise<void> {
  const db = getSupabaseAdmin()
  await db
    .from('licencas')
    .update({ estado: 'revogada', ...(notas ? { notas } : {}) })
    .eq('id', id)
}

export async function reativarLicenca(id: string): Promise<void> {
  const db = getSupabaseAdmin()
  await db.from('licencas').update({ estado: 'ativa' }).eq('id', id)
}

/**
 * Liberta as contas de uma licença para que possa ser usada noutra máquina/conta.
 * O cliente que muda de corretora precisa disto; sem ele, a alternativa era emitir outra chave.
 */
export async function libertarAtivacoes(id: string): Promise<void> {
  const db = getSupabaseAdmin()
  await db.from('licenca_ativacoes').delete().eq('licenca_id', id)
  await db.from('licencas').update({ mt5_login: null }).eq('id', id)
}
