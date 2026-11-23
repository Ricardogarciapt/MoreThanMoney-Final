/**
 * REENCONTRO NO WHATSAPP (19/11/2026) — a 1.ª mensagem aos contactos que o Ricardo já tem.
 *
 * Sai o template `mtm_reencontro` (pede licença, com botões). Quem toca em «Sim, manda» entra no
 * funil híbrido (`lib/whatsapp/fluxo.ts`) e fica com opt-in gravado com prova.
 *
 * Travões, por esta ordem:
 *  1. interruptor `site_settings.whatsapp_reencontro` (desligado por omissão);
 *  2. tecto diário (omissão 40) e horário de Lisboa (10h–20h) — a qualidade do número depende de ir
 *     devagar (pesquisa 19/11: 250 conversas/dia no TIER_250, subir aos poucos);
 *  3. `enviarWhatsApp` com finalidade `campanha`: sem linha no livro do consentimento NÃO sai — a
 *     menos que o dono tenha dado licença (`licenca_dono`, decisão do Ricardo a 23/11/2026 para os
 *     3.965 contactos importados). A licença só cobre ESTE template (pedido de licença com botões);
 *     o que vem a seguir só sai com o «Sim, manda» dela;
 *  4. lista de exclusão (`contacto_exclusao`) e «SAIR» ganham sempre; cada número recebe isto uma vez.
 *
 * Corre dentro do cron do executor do pipeline (sem cron novo).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarWhatsApp } from '@/lib/whatsapp-mensageiro'
import { normalizarE164, variantesDoNumero } from '@/lib/whatsapp-envio'
import { primeiroNome } from '@/lib/whatsapp/templates-mtm'
import { TEMPLATE_REENCONTRO, TEMPLATE_REENCONTRO_V3 } from '@/lib/vendas/guiao-whatsapp'
import { INFO_LINGUA, linguaDoIndicativo, type Lingua } from '@/lib/whatsapp/linguas'

type Db = SupabaseClient
const CHAVE = 'whatsapp_reencontro'

interface Config {
  ligado: boolean
  por_dia: number
  hora_ini: number
  hora_fim: number
  /** Origens de `vendas_negocios` a abordar. */
  origens: string[]
  /** Licença do dono para os contactos sem linha no livro (quem decidiu e quando). */
  licenca_dono?: { por?: string; em?: string; nota?: string } | null
  /** Template da abertura (omissão `mtm_reencontro`; `mtm_reencontro_v2` apresenta o número). */
  template?: string
}

const OMISSAO: Config = { ligado: false, por_dia: 40, hora_ini: 10, hora_fim: 20, origens: ['whatsapp_import'] }

export interface ResultadoReencontro {
  ligado: boolean
  enviados: number
  recusados: Record<string, number>
  motivo?: string
}

/** Hora em Lisboa e o dia (AAAA-MM-DD). Puro. */
export function agoraLisboa(d = new Date()): { hora: number; dia: string } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, x) => ({ ...a, [x.type]: x.value }), {})
  return { hora: Number(p.hour), dia: `${p.year}-${p.month}-${p.day}` }
}

/** Quantos se mandam nesta volta: o que falta do dia, repartido pelas voltas que ainda há (cron de 2 em 2 h). Puro. */
export function quotaDaVolta(cfg: Pick<Config, 'por_dia' | 'hora_fim'>, hora: number, jaHoje: number): number {
  const falta = Math.max(0, cfg.por_dia - jaHoje)
  const voltas = Math.max(1, Math.ceil((cfg.hora_fim - hora) / 2))
  return Math.ceil(falta / voltas)
}

export async function correrReencontro(db: Db): Promise<ResultadoReencontro> {
  const { data: s } = await db.from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
  const v = (s?.value ?? {}) as Partial<Config> & { contagem?: { dia?: string; enviados?: number } }
  const cfg: Config = { ...OMISSAO, ...v }
  const r: ResultadoReencontro = { ligado: !!cfg.ligado, enviados: 0, recusados: {} }
  if (!cfg.ligado) return r

  const { hora, dia } = agoraLisboa()
  if (hora < cfg.hora_ini || hora >= cfg.hora_fim) return { ...r, motivo: 'fora de horas' }
  const jaHoje = v.contagem?.dia === dia ? v.contagem.enviados ?? 0 : 0
  const quota = quotaDaVolta(cfg, hora, jaHoje)
  if (quota <= 0) return { ...r, motivo: 'tecto do dia' }

  // Candidatos: ainda em «lead», com telefone. Os mais antigos primeiro (relação mais longa).
  const { data: cands } = await db
    .from('vendas_negocios')
    .select('id, nome, telefone')
    .in('origem', cfg.origens)
    .eq('estado', 'lead')
    .not('telefone', 'is', null)
    .order('criado_em', { ascending: true })
    .limit(quota * 5)

  for (const c of (cands ?? []) as Array<{ id: string; nome: string | null; telefone: string }>) {
    if (r.enviados >= quota) break
    const digitos = c.telefone.replace(/\D/g, '')
    if (!digitos) continue
    const { data: ja } = await db.from('telegram_leads').select('chat_id').eq('chat_id', `wa:${digitos}`).maybeSingle()
    if (ja) continue
    const { e164 } = normalizarE164(c.telefone)
    if (e164) {
      const { data: fora } = await db.from('contacto_exclusao').select('identificador').in('identificador', [...variantesDoNumero(e164), `+${digitos}`]).limit(1)
      if (fora?.length) {
        r.recusados.exclusao = (r.recusados.exclusao ?? 0) + 1
        await db.from('vendas_negocios').update({ estado: 'perdido', motivo_perda: 'pediu para sair (SAIR / lista de exclusão)' }).eq('id', c.id)
        continue
      }
    }
    // Língua pelo indicativo; só o v3 existe nas 5 línguas, os antigos são só em português.
    const tpl = cfg.template || TEMPLATE_REENCONTRO
    const lingua: Lingua = tpl === TEMPLATE_REENCONTRO_V3 ? linguaDoIndicativo(c.telefone) : 'pt'
    const res = await enviarWhatsApp({
      licencaDono: cfg.licenca_dono?.por ? `${cfg.licenca_dono.por} ${cfg.licenca_dono.em ?? ''}`.trim() : null,
      para: c.telefone,
      finalidade: 'campanha',
      template: { nome: tpl, idioma: INFO_LINGUA[lingua].codigoMeta, parametros: [primeiroNome(c.nome)] },
      agente: { funil: 'whatsapp:reencontro' },
    })
    if (!res.enviado) {
      const k = res.decisao?.codigo ?? 'erro'
      r.recusados[k] = (r.recusados[k] ?? 0) + 1
      continue
    }
    r.enviados++
    await db.from('telegram_leads').upsert(
      { chat_id: `wa:${digitos}`, source: 'whatsapp', stage: 'wa_reencontro', first_name: primeiroNome(c.nome), lang: lingua, updated_at: new Date().toISOString() },
      { onConflict: 'chat_id' },
    )
    await db.from('vendas_negocios').update({ estado: 'contactado' }).eq('id', c.id)
  }

  await db
    .from('site_settings')
    .upsert({ key: CHAVE, value: { ...cfg, contagem: { dia, enviados: jaHoje + r.enviados } } }, { onConflict: 'key' })
  return r
}
