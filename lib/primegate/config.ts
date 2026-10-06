/**
 * PrimeGate — a chave da API (SÓ servidor).
 *
 * Ordem: `PRIMEGATE_API_KEY` (env da Vercel) ganha; senão, a chave colada no /admin, guardada
 * CIFRADA (AES-256-GCM, a mesma cifra das credenciais MT5: `lib/mtmfunded/credenciais`,
 * `MTMFUNDED_CRED_KEY`) na tabela `primegate_config`.
 *
 * Porque não em `site_settings`: essa tabela tem a política «Anyone can read site settings» —
 * qualquer pessoa a lê. Mesmo cifrada, uma chave não tem nada que fazer num sítio público.
 *
 * A chave em claro NUNCA sai deste ficheiro para o browser: o painel só recebe os últimos 4
 * caracteres e a data. Sem chave nenhuma, `lerChave()` devolve null e todo o PrimeGate fica
 * adormecido — o funil continua exactamente como era (validação manual / export).
 */
import { cifrar, decifrar, cifraDisponivel } from '@/lib/mtmfunded/credenciais'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chaveComFormato, ultimos4 } from './resultado'
import { LIMITES_POR_OMISSAO, type LimitesQuota } from './quota'

export interface ConfigPrimeGate {
  chave: string | null
  origem: 'env' | 'admin' | null
  limites: LimitesQuota
}

export interface EstadoChave {
  configurada: boolean
  origem: 'env' | 'admin' | null
  ultimos4: string | null
  gravadaEm: string | null
  gravadaPor: string | null
  cifraDisponivel: boolean
  limites: LimitesQuota
}

let cache: { valor: ConfigPrimeGate; ate: number } | null = null

export function limparCacheConfig() {
  cache = null
}

export async function lerConfig(): Promise<ConfigPrimeGate> {
  if (cache && cache.ate > Date.now()) return cache.valor
  let limites = LIMITES_POR_OMISSAO
  let chaveAdmin: string | null = null
  try {
    const { data } = await getSupabaseAdmin()
      .from('primegate_config')
      .select('chave_cifrada, limite_minuto, limite_dia')
      .eq('id', 'primegate')
      .maybeSingle()
    if (data) {
      limites = {
        porMinuto: Number(data.limite_minuto) > 0 ? Number(data.limite_minuto) : LIMITES_POR_OMISSAO.porMinuto,
        porDia: Number(data.limite_dia) > 0 ? Number(data.limite_dia) : LIMITES_POR_OMISSAO.porDia,
      }
      if (data.chave_cifrada && cifraDisponivel()) chaveAdmin = decifrar(String(data.chave_cifrada))
    }
  } catch {
    /* sem tabela ou sem base → sem chave do admin; a env ainda pode servir */
  }
  const env = (process.env.PRIMEGATE_API_KEY || '').trim()
  const valor: ConfigPrimeGate = env
    ? { chave: env, origem: 'env', limites }
    : chaveAdmin
      ? { chave: chaveAdmin, origem: 'admin', limites }
      : { chave: null, origem: null, limites }
  cache = { valor, ate: Date.now() + 30_000 }
  return valor
}

/** O PrimeGate está ligado? (há chave) */
export async function primeGateAtivo(): Promise<boolean> {
  return Boolean((await lerConfig()).chave)
}

/** O que o painel pode ver. Sem a chave. */
export async function estadoDaChave(): Promise<EstadoChave> {
  const cfg = await lerConfig()
  const { data } = await getSupabaseAdmin()
    .from('primegate_config')
    .select('ultimos4, gravada_em, gravada_por')
    .eq('id', 'primegate')
    .maybeSingle()
  const env = (process.env.PRIMEGATE_API_KEY || '').trim()
  return {
    configurada: Boolean(cfg.chave),
    origem: cfg.origem,
    ultimos4: env ? ultimos4(env) : (data?.ultimos4 as string | null) ?? null,
    gravadaEm: env ? null : (data?.gravada_em as string | null) ?? null,
    gravadaPor: env ? 'variável PRIMEGATE_API_KEY' : (data?.gravada_por as string | null) ?? null,
    cifraDisponivel: cifraDisponivel(),
    limites: cfg.limites,
  }
}

export async function gravarChave(chave: string, quem: string | null): Promise<{ ok: true } | { ok: false; erro: string }> {
  const c = chave.trim()
  if (!chaveComFormato(c)) return { ok: false, erro: 'A chave tem de começar por pg_ib_ (copia-a inteira do hub.primeverse.ca → Developer API).' }
  if (!cifraDisponivel()) return { ok: false, erro: 'MTMFUNDED_CRED_KEY não está configurada no servidor — sem ela não se guarda nada em claro.' }
  const { error } = await getSupabaseAdmin()
    .from('primegate_config')
    .upsert(
      {
        id: 'primegate',
        chave_cifrada: cifrar(c),
        ultimos4: ultimos4(c),
        gravada_em: new Date().toISOString(),
        gravada_por: quem,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
  limparCacheConfig()
  if (error) return { ok: false, erro: 'não consegui gravar a chave' }
  return { ok: true }
}

export async function apagarChave(): Promise<void> {
  await getSupabaseAdmin()
    .from('primegate_config')
    .upsert(
      { id: 'primegate', chave_cifrada: null, ultimos4: null, gravada_em: null, gravada_por: null, atualizado_em: new Date().toISOString() },
      { onConflict: 'id' },
    )
  limparCacheConfig()
}
