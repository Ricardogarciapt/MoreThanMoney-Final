/**
 * AS LINHAS DIÁRIAS DE PUBLICAÇÕES do @morethanmoney.pt (ordem do Ricardo, 17/11/2026).
 *
 * Além do carrossel de valor das 12:30 (motor.ts, fica como está), saem por dia mais 5:
 *   · uma por funil: Educação, Rota Corretora, MTM Funded (cada uma leva às páginas /f/*);
 *   · uma para ganhar seguidores (valor puro, feito para guardar e partilhar);
 *   · uma de CTA (convite directo para começar).
 *
 * Cada linha tem a sua palavra de comentário, ligada a uma automação ACTIVA do Instagram
 * (APRENDER, CORRETORA, FUNDED → páginas dos funis; GUIA → guia das estratégias; COMEÇAR → registo).
 * O tema roda: sai o que não sai há mais tempo. O texto é da IA gratuita e passa pelas mesmas
 * regras do carrossel diário (PT-PT, sem promessas, sem números de desempenho).
 *
 * Interruptor: `site_settings.carrossel_diario.linhas` (sem a chave = ligado).
 * Idempotente: uma linha por dia (created_by `carrossel-diario:mtm:<linha>`).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { uploadBufferToBucket } from '@/lib/instagram/publish'
import { verificarObjecto } from '@/lib/conteudo-magnetico/regras'
import { gerarCarrossel } from './gerar'
import { desenharCarrossel, diaN } from './motor'
import { CHAVE_INTERRUPTOR } from './interruptor'
import { ARROBA, IG_ID } from './tipos'
import type { Tema } from './temas'

export type Linha = 'funil-educacao' | 'funil-corretora' | 'funil-funded' | 'seguidores' | 'cta'

export interface LinhaPost {
  linha: Linha
  /** Hora UTC (Lisboa = UTC no inverno). */
  hora: { h: number; m: number }
  temas: Tema[]
}

const SEGUE = 'Guarda para releres e segue @morethanmoney.pt para receberes o próximo.'

const EDUCACAO = {
  area: 'Educação MTM',
  palavraChave: 'APRENDER',
  oQue: 'o caminho para começares a aprender connosco',
  objetivo:
    'Funil Educação: quem lê percebe que aprender trading e finanças com método, em comunidade e com aulas organizadas, é o primeiro passo. A última lâmina convida a comentar APRENDER.',
  fecho: [SEGUE],
}
const CORRETORA = {
  area: 'Rota Corretora',
  palavraChave: 'CORRETORA',
  oQue: 'o passo a passo da Rota Corretora',
  objetivo:
    'Funil Rota Corretora: explicar porque o dinheiro deve estar numa conta em teu nome, numa corretora regulada (a MTM recomenda a PU Prime como parceira). A MTM nunca gere o teu dinheiro nem a tua carteira: é uma recomendação e tu decides. A última lâmina convida a comentar CORRETORA.',
  fecho: [SEGUE],
}
const FUNDED = {
  area: 'MTM Funded',
  palavraChave: 'FUNDED',
  oQue: 'como funciona o MTM Funded',
  objetivo:
    'Funil MTM Funded: desafios em contas SIMULADAS para treinar disciplina com regras claras; quem cumpre pode receber o Patrocínio de Desempenho MTM para abrir a sua própria conta. NÃO é uma prop firm, ninguém opera dinheiro de terceiros. A última lâmina convida a comentar FUNDED.',
  fecho: [SEGUE],
}
const SEGUIDORES = {
  area: 'valor',
  palavraChave: 'GUIA',
  oQue: 'o guia das 10 estratégias MTM',
  objetivo:
    'Ganhar SEGUIDORES: valor puro e prático, do tipo que se guarda e se envia a um amigo. Nada de venda; a última lâmina pede para guardar, partilhar e seguir @morethanmoney.pt.',
  fecho: ['📌 Guarda, envia a quem precisa de ler isto e segue @morethanmoney.pt.'],
}
const CTA = {
  area: 'começar',
  palavraChave: 'COMEÇAR',
  oQue: 'o link para começares',
  objetivo:
    'CTA directo: convidar a pessoa a começar hoje (conta gratuita, aulas, app e o Premium com experiência de 3 dias sem cartão). Honesto, sem urgência falsa e sem prometer resultados. Todas as lâminas empurram para comentar COMEÇAR.',
}

export const LINHAS_POSTS: LinhaPost[] = [
  {
    linha: 'funil-educacao',
    hora: { h: 9, m: 0 },
    temas: [
      { slug: 'edu-primeiro-mes', tema: 'O que aprender no primeiro mês de trading, por esta ordem', ...EDUCACAO },
      { slug: 'edu-sozinho-vs-metodo', tema: 'Aprender sozinho no YouTube vs aprender com método e comunidade', ...EDUCACAO },
      { slug: 'edu-15-minutos', tema: 'Como estudar mercados 15 minutos por dia sem largar o emprego', ...EDUCACAO },
      { slug: 'edu-demo-primeiro', tema: 'Porque é que se começa em conta demo e quando faz sentido sair dela', ...EDUCACAO },
      { slug: 'edu-erros-iniciante', tema: 'Os erros de quem começa no trading e como a formação os evita', ...EDUCACAO },
      { slug: 'edu-literacia', tema: 'Literacia financeira: o que a escola não te ensinou sobre dinheiro', ...EDUCACAO },
      { slug: 'edu-plano-estudo', tema: 'Um plano de estudo semanal simples para aprender a ler o gráfico', ...EDUCACAO },
    ],
  },
  {
    linha: 'funil-corretora',
    hora: { h: 15, m: 0 },
    temas: [
      { slug: 'cor-conta-em-teu-nome', tema: 'Porque o teu dinheiro deve estar sempre numa conta em teu nome', ...CORRETORA },
      { slug: 'cor-regulada', tema: 'Como verificar se uma corretora é regulada antes de depositar', ...CORRETORA },
      { slug: 'cor-sinais-alerta', tema: 'Sinais de alerta: quando alguém te pede para lhe entregares o dinheiro', ...CORRETORA },
      { slug: 'cor-spread-comissao', tema: 'Spread, comissão e swap: os custos de uma corretora explicados', ...CORRETORA },
      { slug: 'cor-abrir-conta', tema: 'Abrir conta numa corretora passo a passo: documentos, verificação e primeiro depósito', ...CORRETORA },
      { slug: 'cor-demo-real', tema: 'Da conta demo à conta real na corretora: o que muda e o que não muda', ...CORRETORA },
    ],
  },
  {
    linha: 'funil-funded',
    hora: { h: 18, m: 0 },
    temas: [
      { slug: 'fun-regras', tema: 'As regras de um desafio em conta simulada: perda diária, perda máxima e consistência', ...FUNDED },
      { slug: 'fun-disciplina', tema: 'Porque um desafio com regras treina a disciplina melhor do que operar sem limites', ...FUNDED },
      { slug: 'fun-patrocinio', tema: 'O que é o Patrocínio de Desempenho MTM e porque não é uma prop firm', ...FUNDED },
      { slug: 'fun-chumbar', tema: 'Os motivos mais comuns para chumbar num desafio e como evitá-los', ...FUNDED },
      { slug: 'fun-plano', tema: 'Como montar um plano para passar um desafio sem pressa', ...FUNDED },
      { slug: 'fun-simulada', tema: 'Conta simulada não é brincadeira: treinar como se fosse a sério', ...FUNDED },
    ],
  },
  {
    linha: 'seguidores',
    hora: { h: 11, m: 0 },
    temas: [
      { slug: 'seg-mitos', tema: 'Mitos sobre trading em que quase toda a gente acredita', ...SEGUIDORES },
      { slug: 'seg-glossario', tema: 'Glossário de bolso: 8 palavras que qualquer trader tem de conhecer', ...SEGUIDORES },
      { slug: 'seg-habitos', tema: 'Hábitos de dinheiro que mudam a tua vida em 12 meses', ...SEGUIDORES },
      { slug: 'seg-juros-compostos', tema: 'Juros compostos explicados com um exemplo simples (ilustração)', ...SEGUIDORES },
      { slug: 'seg-checklist', tema: 'A checklist antes de abrir qualquer operação', ...SEGUIDORES },
      { slug: 'seg-fundo-emergencia', tema: 'Fundo de emergência: quanto, onde e porquê antes de investir', ...SEGUIDORES },
      { slug: 'seg-psicologia', tema: 'Os enganos da cabeça que custam dinheiro: FOMO, vingança e excesso de confiança', ...SEGUIDORES },
      { slug: 'seg-golpes', tema: 'Como reconhecer um esquema de dinheiro fácil em 30 segundos', ...SEGUIDORES },
    ],
  },
  {
    linha: 'cta',
    hora: { h: 20, m: 30 },
    temas: [
      { slug: 'cta-comeca-hoje', tema: 'Começa hoje: conta gratuita, aulas e app num só sítio', ...CTA },
      { slug: 'cta-premium-3-dias', tema: 'Experimenta o Premium 3 dias sem cartão e decide depois', ...CTA },
      { slug: 'cta-tres-caminhos', tema: 'Três caminhos na MTM: aprender, abrir a tua conta ou treinar num desafio', ...CTA },
      { slug: 'cta-comunidade', tema: 'Não aprendas sozinho: entra na comunidade MTM', ...CTA },
      { slug: 'cta-app', tema: 'A app MTM no telemóvel: aulas, alertas e treino num só lugar', ...CTA },
    ],
  },
]

export const criadoPorLinha = (l: Linha) => `carrossel-diario:mtm:${l}`

export interface ResultadoLinha {
  linha: Linha
  estado: 'agendado' | 'ja_havia' | 'desligado' | 'falhou'
  id?: string
  agendado_para?: string
  capa?: string
  motivo?: string
}

async function linhasLigadas(): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE_INTERRUPTOR).maybeSingle()
  const v = (data?.value && typeof data.value === 'object' ? data.value : {}) as Record<string, unknown>
  return v.mtm !== false && v.linhas !== false
}

function inicioDoDia(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())).toISOString()
}

/** O tema que nunca saiu nesta linha ou, se já saíram todos, o que saiu há mais tempo. */
async function proximoTema(def: LinhaPost): Promise<Tema> {
  const { data } = await getSupabaseAdmin()
    .from('social_scheduled_posts')
    .select('pillar')
    .eq('created_by', criadoPorLinha(def.linha))
    .order('created_at', { ascending: false })
    .limit(200)
  const usados = (data ?? []).map((r) => String(r.pillar || '').replace(/^carrossel:/, ''))
  const ultimaVez = (t: Tema) => {
    const i = usados.findIndex((u) => u.startsWith(`ia-${t.slug}-`))
    return i < 0 ? Infinity : i
  }
  return [...def.temas].sort((a, b) => ultimaVez(b) - ultimaVez(a))[0]
}

export async function agendarLinha(linha: Linha, opts: { forcar?: boolean; agora?: Date } = {}): Promise<ResultadoLinha> {
  const agora = opts.agora ?? new Date()
  const def = LINHAS_POSTS.find((l) => l.linha === linha)
  if (!def) return { linha, estado: 'falhou', motivo: 'linha desconhecida' }
  if (!(await linhasLigadas())) return { linha, estado: 'desligado' }
  const db = getSupabaseAdmin()
  if (!opts.forcar) {
    const { data: hoje } = await db.from('social_scheduled_posts').select('pillar')
      .eq('created_by', criadoPorLinha(linha)).gte('created_at', inicioDoDia(agora)).limit(1)
    if (hoje?.length) return { linha, estado: 'ja_havia', id: String(hoje[0].pillar) }
  }

  const tema = await proximoTema(def)
  const id = `ia-${tema.slug}-${agora.toISOString().slice(0, 10).replace(/-/g, '')}`
  const r = await gerarCarrossel('mtm', tema, id)
  if (!r.carrossel) return { linha, estado: 'falhou', id, motivo: r.motivo }
  const c = r.carrossel
  const avisos = verificarObjecto(c)
  if (avisos.length) return { linha, estado: 'falhou', id, motivo: avisos.map((a) => `${a.tipo}: ${a.trecho}`).join('; ') }

  const pngs = await desenharCarrossel(c, diaN(agora) + LINHAS_POSTS.indexOf(def) + 1)
  const urls: string[] = []
  for (const png of pngs) urls.push(await uploadBufferToBucket(png, 'image/png', `carrossel-diario/mtm-${linha}`))

  const alvo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), def.hora.h, def.hora.m))
  const quando = alvo.getTime() > agora.getTime() + 5 * 60_000 ? alvo : new Date(agora.getTime() + 15 * 60_000)
  const { error } = await db.from('social_scheduled_posts').insert({
    channel: 'instagram',
    ig_account_id: IG_ID.mtm,
    ig_username: ARROBA.mtm.slice(1),
    pillar: `carrossel:${c.id}`,
    media_type: 'CAROUSEL',
    media_urls: urls,
    caption: c.legenda,
    scheduled_at: quando.toISOString(),
    status: 'approved',
    approved_by: 'linhas diárias (ordem do Ricardo, 17/11/2026)',
    approved_at: agora.toISOString(),
    created_by: criadoPorLinha(linha),
  })
  if (error) return { linha, estado: 'falhou', id, motivo: error.message }
  return { linha, estado: 'agendado', id, agendado_para: quando.toISOString(), capa: urls[0] }
}

/**
 * Chamada pelo ig-publish (de 5 em 5 minutos) a partir das 07:20 UTC: agenda NO MÁXIMO uma linha
 * em falta por ronda, para cada ronda caber no tempo e a IA gratuita não ser martelada.
 * Uma linha que falhou hoje volta a tentar-se na ronda seguinte, até 3 vezes.
 */
const falhasHoje = new Map<string, number>()

export async function garantirLinhasDoDia(agora = new Date()): Promise<ResultadoLinha[]> {
  if (agora.getUTCHours() * 60 + agora.getUTCMinutes() < 7 * 60 + 20) return []
  const { data, error } = await getSupabaseAdmin()
    .from('social_scheduled_posts')
    .select('created_by')
    .like('created_by', 'carrossel-diario:mtm:%')
    .gte('created_at', inicioDoDia(agora))
  if (error) return []
  const feitos = new Set((data ?? []).map((r) => String(r.created_by)))
  const dia = agora.toISOString().slice(0, 10)
  for (const def of LINHAS_POSTS) {
    if (feitos.has(criadoPorLinha(def.linha))) continue
    const chave = `${dia}:${def.linha}`
    if ((falhasHoje.get(chave) ?? 0) >= 3) continue
    let r: ResultadoLinha
    try {
      r = await agendarLinha(def.linha, { agora })
    } catch (e) {
      r = { linha: def.linha, estado: 'falhou', motivo: e instanceof Error ? e.message : String(e) }
    }
    if (r.estado === 'falhou') falhasHoje.set(chave, (falhasHoje.get(chave) ?? 0) + 1)
    return [r]
  }
  return []
}
