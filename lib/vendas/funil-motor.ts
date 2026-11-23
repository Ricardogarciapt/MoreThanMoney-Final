/**
 * MOTOR DAS FASES (21/11/2026) — corre dentro do executor do pipeline (cron 2/2 h), sem cron novo.
 *
 * Faz três coisas, por esta ordem:
 *   1. CLASSIFICA o funil de quem está «por classificar», só com sinais explícitos
 *      (`classificarFunil`); o resto fica para a qualificação do setter.
 *   2. RECRUTADOR — marca `recruta` em quem vem como parceiro/educador.
 *   3. RASCUNHA os emails das fases que o seguimento normal não cobre — Edificação (apresentado),
 *      Onboarding (ganho) e Recrutador — SÓ para emails com consentimento vivo. Os rascunhos vão
 *      para a fila de sempre (`aios_tasks envio:*`) e saem pela passagem legal (`autoAprovarFilaSite`
 *      → `decidirContacto`), que o executor chama logo a seguir. Nada sai daqui directamente.
 *
 * Os 3.965 importados do WhatsApp (`whatsapp_import`) nunca são tocados.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { KIND_ENVIO } from '@/lib/envios-aprovacao'
import { linkSaida } from '@/lib/vendas/executor-pipeline'
import { classificarFunil, ehRecruta, ETQ_CANDIDATO_EQUIPA, ETQ_EDIFICADO, ETQ_ONBOARDING_OK, ETQ_RECRUTA } from '@/lib/vendas/funil-fases'

type Db = SupabaseClient
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').replace(/\/$/, '')

type Negocio = {
  id: string
  nome: string | null
  email: string | null
  estado: string
  funil: string | null
  origem: string | null
  interesse: string | null
  broker_uid: string | null
  etiquetas: string[] | null
}

export type ResultadoFases = { classificados: number; recrutas: number; rascunhos: number; erros: string[] }

function rodape(email: string): string {
  return (
    `\n\n—\nRicardo Garcia · MoreThanMoney (morethanmoney.pt)\n` +
    `Conteúdo educativo, não constitui consultoria financeira. Resultados passados não garantem resultados futuros.\n` +
    `Recebes isto porque aceitaste receber novidades da MoreThanMoney. Para deixar de receber: ${linkSaida(email)}`
  )
}

/** Os emails das três fases. Puro: tom do framework, preço nunca inventado, saída em todos. */
export function emailDaFase(
  fase: 'edificacao' | 'onboarding' | 'recrutador',
  primeiroNome: string | null,
  email: string,
  etiquetas: string[] = [],
): { assunto: string; texto: string; link: string } {
  const ola = primeiroNome ? `Olá ${primeiroNome},` : 'Olá,'
  if (fase === 'edificacao') {
    const link = `${SITE}/apresentacao`
    return {
      link,
      assunto: 'Como medimos o que mostramos',
      texto:
        `${ola}\n\nDepois da nossa conversa, deixo-te a parte que mais importa antes de decidires: como se mede. ` +
        `Cada ideia é mostrada do início ao fim, em pips, com a origem dita — as que correm bem e as que correm mal.\n\n` +
        `A apresentação completa (com o caminho passo a passo) está aqui: ${link}\n\n` +
        `Se ficou alguma dúvida, responde a este email ou marca 15 minutos: ${SITE}/agendar` +
        rodape(email),
    }
  }
  if (fase === 'onboarding') {
    const link = `${SITE}/onboarding/mtm`
    return {
      link,
      assunto: 'Bem-vindo à MoreThanMoney: os teus primeiros passos',
      texto:
        `${ola}\n\nBem-vindo. Para tirares partido de tudo desde o primeiro dia, segue os cinco passos ` +
        `(conta, app, corretora, sinais e chamada de boas-vindas), com um vídeo curto em cada um:\n\n${link}\n\n` +
        `Se encravares num passo, responde a este email e ajudamos-te.` +
        rodape(email),
    }
  }
  // Candidatos à equipa comercial (formulário /work): a proposta é de função, não de parceria de educador.
  if (etiquetas.includes(ETQ_CANDIDATO_EQUIPA) || etiquetas.includes('form:work')) {
    const link = `${SITE}/agendar?t=entrevista-equipa`
    return {
      link,
      assunto: 'A tua candidatura à equipa MoreThanMoney',
      texto:
        `${ola}\n\nObrigado por te candidatares. Estamos a montar a equipa comercial (prospectors, setters e closers, ` +
        `100% remoto) e o próximo passo é uma conversa de 30 minutos por Google Meet.\n\n` +
        `Como funciona: comissão por cada venda fechada, registada no back-office com o teu código ` +
        `(prospector 5%, setter 10%, closer 20% a 30% conforme o volume do mês, mais 5% nas renovações). ` +
        `Formação interna no back-office antes de começares, com guiões e as nossas ferramentas.\n\n` +
        `Marca aqui a tua entrevista: ${link}\nDetalhes da função: ${SITE}/work` +
        rodape(email),
    }
  }
  const link = `${SITE}/educador/marketplace`
  return {
    link,
    assunto: 'Parceria com a MoreThanMoney',
    texto:
      `${ola}\n\nObrigado pelo interesse em trabalhar connosco. Damos a educadores e criadores as ferramentas ` +
      `para servirem a sua própria comunidade: marketplace, mentor IA com a tua marca e cursos narrados.\n\n` +
      `Vê como funciona: ${link}\nE se fizer sentido, marcamos uma conversa: ${SITE}/agendar` +
      rodape(email),
  }
}

async function emailsComConsentimento(db: Db): Promise<Set<string>> {
  const { data } = await db
    .from('captacao_consentimento')
    .select('email, canal, base_legal, retirado_em')
    .not('email', 'is', null)
    .limit(5000)
  const vivos = new Set<string>()
  const retirados = new Set<string>()
  for (const c of (data ?? []) as Array<{ email: string; canal: string | null; base_legal: string; retirado_em: string | null }>) {
    const e = String(c.email).trim().toLowerCase()
    if (c.retirado_em) retirados.add(e)
    else if (c.base_legal === 'consentimento' && ['email', 'checkout', 'marketplace'].includes(String(c.canal ?? ''))) vivos.add(e)
  }
  for (const e of retirados) vivos.delete(e)
  return vivos
}

export async function correrFases(db: Db, limite = 20): Promise<ResultadoFases> {
  const r: ResultadoFases = { classificados: 0, recrutas: 0, rascunhos: 0, erros: [] }
  const { data, error } = await db
    .from('vendas_negocios')
    .select('id, nome, email, estado, funil, origem, interesse, broker_uid, etiquetas')
    .neq('origem', 'whatsapp_import')
    .not('estado', 'eq', 'perdido')
    .limit(2000)
  if (error) {
    r.erros.push(`ler: ${error.message}`)
    return r
  }
  const negocios = (data ?? []) as Negocio[]

  // 1 + 2. Funil e recrutador
  for (const n of negocios) {
    const patch: Record<string, unknown> = {}
    if (!n.funil) {
      const f = classificarFunil(n)
      if (f) patch.funil = f
    }
    const etq = n.etiquetas ?? []
    if (!etq.includes(ETQ_RECRUTA) && ehRecruta(n)) patch.etiquetas = [...etq, ETQ_RECRUTA]
    if (!Object.keys(patch).length) continue
    patch.atualizado_em = new Date().toISOString()
    const { error: e } = await db.from('vendas_negocios').update(patch).eq('id', n.id)
    if (e) { r.erros.push(`patch ${n.id}: ${e.message}`); continue }
    if (patch.funil) {
      r.classificados++
      n.funil = String(patch.funil)
    }
    if (patch.etiquetas) {
      r.recrutas++
      n.etiquetas = patch.etiquetas as string[]
    }
  }

  // 3. Rascunhos das fases sem seguimento próprio
  const consent = await emailsComConsentimento(db)
  if (!consent.size) return r
  const { criarEnvioPorAprovar } = await import('@/lib/envios-fila')
  for (const n of negocios) {
    if (r.rascunhos >= limite) break
    if (!n.email) continue
    const email = n.email.trim().toLowerCase()
    if (!consent.has(email)) continue
    const etq = n.etiquetas ?? []
    let fase: 'edificacao' | 'onboarding' | 'recrutador' | null = null
    if (n.estado === 'apresentado' && !etq.includes(ETQ_EDIFICADO)) fase = 'edificacao'
    else if (n.estado === 'ganho' && !etq.includes(ETQ_ONBOARDING_OK)) fase = 'onboarding'
    else if (etq.includes(ETQ_RECRUTA) && ['lead', 'contactado', 'qualificado'].includes(n.estado)) fase = 'recrutador'
    if (!fase) continue
    const nome = (n.nome ?? '').split(' ')[0] || null
    const m = emailDaFase(fase, nome, email, etq)
    const c = await criarEnvioPorAprovar({
      kind: KIND_ENVIO.EMAIL_SEGUIMENTO,
      chave: `fase:${fase}:${n.id}`,
      titulo: `Email · ${fase} · ${nome ?? email}`,
      detalhes: `Negócio em «${n.estado}» (fase ${fase}) com consentimento de email. Assunto: ${m.assunto}\n\n${m.texto}`,
      payload: {
        email,
        assunto: m.assunto,
        texto: m.texto,
        link: m.link,
        origem: 'vendas_negocios',
        referencia: n.id,
        negocio_id: n.id,
        toque: 0,
        fase,
      } as never,
    })
    if (c.criado) r.rascunhos++
  }
  return r
}

/**
 * Quando o email da fase sai, marca a etiqueta: Edificação → `edificado` (passa a Fecho),
 * Onboarding → `onboarding_ok`. Chamado pelo executor depois da passagem legal.
 */
export async function marcarFasesEnviadas(db: Db): Promise<number> {
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data } = await db
    .from('aios_tasks')
    .select('payload')
    .eq('kind', KIND_ENVIO.EMAIL_SEGUIMENTO)
    .eq('status', 'enviado')
    .gte('enviado_em', desde)
    .like('chave', 'fase:%')
    .limit(500)
  let n = 0
  for (const t of (data ?? []) as Array<{ payload: { negocio_id?: string; fase?: string } }>) {
    const etqNova = t.payload?.fase === 'edificacao' ? ETQ_EDIFICADO : t.payload?.fase === 'onboarding' ? ETQ_ONBOARDING_OK : null
    if (!etqNova || !t.payload.negocio_id) continue
    const { data: neg } = await db.from('vendas_negocios').select('etiquetas').eq('id', t.payload.negocio_id).maybeSingle()
    const etq = ((neg as { etiquetas: string[] | null } | null)?.etiquetas ?? []) as string[]
    if (etq.includes(etqNova)) continue
    await db.from('vendas_negocios').update({ etiquetas: [...etq, etqNova], atualizado_em: new Date().toISOString() }).eq('id', t.payload.negocio_id)
    n++
  }
  return n
}
