import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * O interruptor do MTM Funded.
 *
 * O produto financiado nasce DESLIGADO e assim fica até o Ricardo o ligar. Com ele
 * desligado, o /mtmfunded não vende nada e encaminha para os torneios — que existem à
 * parte e continuam a funcionar. Ligar/desligar não pode exigir um deploy: uma venda que
 * corre mal tem de poder ser travada no minuto seguinte.
 */
const CHAVE = 'mtmfunded_config'

export interface MtmFundedConfig {
  /** O produto MTM Funded existe e aparece no site? */
  ativo: boolean
  /** As vendas estão abertas? (pode estar ativo em modo montra, sem checkout) */
  vendas_abertas: boolean
  /** Slug do torneio para onde se encaminha quando o funded está desligado. */
  torneio_ativo: string | null
  /** Minutos entre leituras das contas para actualizar a classificação. */
  minutos_entre_leituras: number
}

export const MTMFUNDED_DEFAULT: MtmFundedConfig = {
  ativo: false,          // por decisão: só o Ricardo o liga
  vendas_abertas: false,
  torneio_ativo: '2026-q3',
  minutos_entre_leituras: 60,
}

export async function getMtmFundedConfig(): Promise<MtmFundedConfig> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
    const v = (data?.value ?? {}) as Partial<MtmFundedConfig>
    return {
      // Falha fechada: sem valor guardado, o funded fica desligado.
      ativo: v.ativo === true,
      vendas_abertas: v.vendas_abertas === true && v.ativo === true,
      torneio_ativo: typeof v.torneio_ativo === 'string' ? v.torneio_ativo : MTMFUNDED_DEFAULT.torneio_ativo,
      minutos_entre_leituras:
        Number.isFinite(Number(v.minutos_entre_leituras)) && Number(v.minutos_entre_leituras) >= 5
          ? Number(v.minutos_entre_leituras)
          : MTMFUNDED_DEFAULT.minutos_entre_leituras,
    }
  } catch {
    return MTMFUNDED_DEFAULT
  }
}

export async function setMtmFundedConfig(patch: Partial<MtmFundedConfig>): Promise<MtmFundedConfig> {
  const atual = await getMtmFundedConfig()
  const novo: MtmFundedConfig = {
    ...atual,
    ...patch,
    // Desligar o produto desliga as vendas com ele. Deixar vendas abertas num produto
    // invisível era vender uma porta que já não existe.
    vendas_abertas: (patch.ativo ?? atual.ativo) ? (patch.vendas_abertas ?? atual.vendas_abertas) : false,
  }
  await getSupabaseAdmin().from('site_settings').upsert(
    {
      key: CHAVE,
      value: novo,
      description: 'MTM Funded: interruptor do produto, das vendas e do torneio activo',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  return novo
}
