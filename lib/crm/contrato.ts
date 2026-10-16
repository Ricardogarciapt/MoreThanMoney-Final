import { z } from 'zod'
import { createHash, timingSafeEqual } from 'node:crypto'

const texto = (max: number) => z.string().trim().min(1).max(max)
const canal = z.enum(['instagram', 'telegram', 'whatsapp', 'site', 'email'])
const etapas = z.enum(['NEW_LEAD', 'INSTAGRAM_ENGAGED', 'TELEGRAM_TRIAGE', 'QUALIFIED_SETTER', 'PRESENTATION_SCHEDULED', 'CLOSER_NEGOTIATION'])
const telefone = z.string().trim().transform(v => v.replace(/[\s().-]/g, '')).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Inclui o indicativo internacional (+351…).'))
const contacto = {
  name: texto(160),
  email: z.string().trim().email().max(200).transform(v => v.toLowerCase()).optional(),
  phone: telefone.optional(),
  instagram_id: texto(100).regex(/^\d+:\d+$/).optional(),
  telegram_id: z.string().regex(/^\d{1,20}$/).optional(),
  instagram_username: texto(30).regex(/^@?[\w.]+$/).transform(v => v.replace(/^@/, '').toLowerCase()).optional(),
}
const simples = z.object({
  ...contacto,
  channel: canal,
  aiScore: z.enum(['A', 'B', 'C']),
  aiSummary: texto(4000),
  stage: etapas.default('NEW_LEAD'),
}).strict()
const estruturado = z.object({
  lead_data: z.object({ ...contacto, channel: canal }).strict(),
  qualification: z.object({
    score: z.enum(['A', 'B', 'C']),
    capital_available: texto(100),
    detected_pain: texto(4000),
    target_product: texto(160),
  }).strict(),
  workflow_routing: z.object({
    action: z.enum(['ASSIGN_CLOSER', 'ASSIGN_SETTER', 'NURTURE']),
    target_stage: etapas,
    // Compatibilidade com o guia. Nunca é usado como URL de envio ou redirecção.
    cal_injection_url: z.string().url().max(500).optional(),
  }).strict(),
}).strict()

export const contratoLead = z.union([simples, estruturado]).transform(v => {
  const p = 'lead_data' in v ? {
    ...v.lead_data,
    aiScore: v.qualification.score,
    aiSummary: v.qualification.detected_pain,
    stage: v.workflow_routing.target_stage,
    qualification: v.qualification,
  } : { ...v, qualification: null }
  return p
}).superRefine((v, ctx) => {
  if (!v.email && !v.phone && !v.telegram_id && !v.instagram_username && !v.instagram_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'É necessário um contacto identificável.' })
  }
  if (v.channel === 'telegram' && !v.telegram_id && !v.email && !v.phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Falta telegram_id ou contacto.' })
  }
})
export type LeadOmnicanal = z.infer<typeof contratoLead>

/** O contrato externo não pode fechar vendas nem simular uma marcação confirmada. */
export function estadoInicial(p: LeadOmnicanal): 'lead' | 'contactado' | 'qualificado' {
  if (p.stage === 'NEW_LEAD') return 'lead'
  if (p.stage === 'INSTAGRAM_ENGAGED' || p.stage === 'TELEGRAM_TRIAGE') return 'contactado'
  return 'qualificado'
}

/** Ausência de configuração NUNCA autentica um pedido sem cabeçalho. */
export function segredoValido(recebido: string | null, esperado: string | undefined): boolean {
  if (!esperado || esperado.length < 32 || !recebido) return false
  const a = createHash('sha256').update(recebido).digest()
  const b = createHash('sha256').update(esperado).digest()
  return timingSafeEqual(a, b)
}

export function parametrosLead(p: LeadOmnicanal) {
  // Uma origem estável impede duplicados mesmo com event IDs diferentes.
  const identidade = p.instagram_id ? `instagram-id:${p.instagram_id}` : p.telegram_id ? `telegram:${p.telegram_id}`
    : p.phone ? `phone:${p.phone}` : p.email ? `email:${p.email}` : `instagram:${p.instagram_username}`
  return {
    chave: `crm:${createHash('sha256').update(identidade).digest('hex')}`,
    nome: p.name, email: p.email ?? null, telefone: p.phone ?? null,
    telegram_id: p.telegram_id ?? null, instagram_id: p.instagram_id ?? null, instagram_handle: p.instagram_username ?? null,
    origem: p.channel, estado: estadoInicial(p), papel: p.aiScore === 'A' ? 'closer' : 'setter',
    score: p.aiScore, resumo: p.aiSummary, qualificacao: p.qualification,
  }
}
