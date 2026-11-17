/**
 * O QUADRO DO PIPELINE (CRM Fase 3, 17/11/2026) — colunas por estado, separado por funil.
 *
 * A lista de `/backoffice/pipeline` continua a ser onde se trabalha linha a linha, com o passo
 * seguinte escrito. Aqui é a vista de cima: quantos há em cada estado de CADA funil da Conduta v2
 * (Educação, Rota Corretora, MTM Funded) e do B2B, e quem está parado.
 *
 * CONTAGENS EXACTAS, CARTÕES LIMITADOS. Cada coluna pede a contagem real à base e mostra os 25
 * mexidos mais recentemente; quando há mais, diz quantos ficam de fora e leva à lista filtrada. Um
 * quadro que só contasse o que desenha era o erro do `.limit(500)` outra vez.
 *
 * OS IMPORTADOS DO WHATSAPP FICAM DE FORA por omissão: são 3.969 contactos sem consentimento que
 * nunca se contactam por iniciativa nossa. Mostram-se a pedido, para se saber que existem.
 *
 * O mesmo filtro de participação da lista (e com a bolsa dentro do MESMO `or`): quem não participa
 * num negócio com dono não o vê aqui.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaPagina } from '@/lib/backoffice-equipa'
import { filtroDeParticipacao } from '@/lib/backoffice-negocios'
import { ESTADOS_PIPELINE, ESTADO_PIPELINE_NOME, ehEstadoFechado, type EstadoPipeline } from '@/lib/backoffice-vista'
import { diasParado } from '@/lib/backoffice-playbook'
import { lerDoCatalogo } from '@/lib/backoffice-paginacao'
import { FUNIS, FUNIL_NOME, FUNIL_RESUMO, SEM_FUNIL, nomeDoFunil, type FiltroFunil } from '@/lib/backoffice-funis'
import { faltaColunaFunil } from '@/lib/backoffice-ficha'
import { abrirPagina, SemAcesso } from '../../_partes/acesso'
import { Aviso, Cabecalho, Falhou } from '../../_partes/blocos'
import type { Params } from '../../_partes/navegar'
import { Mover } from '../mover'
import { EscolherFunil } from '../funil'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Quadro do pipeline · Backoffice MTM' }

const BASE = '/backoffice/pipeline/quadro'
const POR_COLUNA = 25
const FILTROS_FUNIL = [...FUNIS, SEM_FUNIL] as const

interface Cartao {
  id: string
  nome: string
  estado: string
  origem: string | null
  atualizado_em: string
  funil?: string | null
  agente_id: string | null
}

interface Coluna {
  estado: EstadoPipeline
  total: number
  cartoes: Cartao[]
}

function ligacao(p: { funil?: string | null; importados?: boolean }): string {
  const q = new URLSearchParams()
  if (p.funil) q.set('funil', p.funil)
  if (p.importados) q.set('importados', '1')
  const s = q.toString()
  return s ? `${BASE}?${s}` : BASE
}

export default async function QuadroPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const acesso = await abrirPagina('bo.pipeline_proprio')
  if (!acesso.ok) {
    return <SemAcesso motivo={acesso.motivo} oQue="O quadro é de quem trabalha os negócios: setters, closers e responsáveis de equipa." />
  }
  const { ctx } = acesso
  const { ambito, aviso } = await ambitoDaPagina(ctx, 'pipeline')

  const funil = lerDoCatalogo(params.funil, FILTROS_FUNIL) as FiltroFunil | null
  const importados = params.importados === '1'

  const filtro = ambito.todos ? null : filtroDeParticipacao(ambito.ids, { incluirSemDono: true })
  if (!ambito.todos && !filtro) {
    return (
      <div className="space-y-6">
        <Cabecalho titulo="Quadro do pipeline" sub="Os negócios por funil e por estado." />
        <Aviso>Não tens negócios no teu âmbito.</Aviso>
      </div>
    )
  }

  const db = getSupabaseAdmin()

  async function lerColuna(estado: EstadoPipeline, comFunil: boolean) {
    let q = db
      .from('vendas_negocios')
      .select(`id, nome, estado, origem, atualizado_em, agente_id${comFunil ? ', funil' : ''}`, { count: 'exact' })
      .eq('estado', estado)
      .order('atualizado_em', { ascending: false })
      .range(0, POR_COLUNA - 1)
    if (filtro) q = q.or(filtro)
    // `neq` também deixa de fora `origem` nula — não há nenhuma hoje (medido a 17/11), e usar um
    // segundo `or` aqui partia o filtro de segurança.
    if (!importados) q = q.neq('origem', 'whatsapp_import')
    if (comFunil && funil) q = funil === SEM_FUNIL ? q.is('funil', null) : q.eq('funil', funil)
    return q
  }

  let colunas: Coluna[]
  let semColuna = false
  try {
    let respostas = await Promise.all(ESTADOS_PIPELINE.map((e) => lerColuna(e, true)))
    if (respostas.some((r) => faltaColunaFunil(r.error))) {
      // Migração 261 por aplicar: mostra-se o quadro sem separar por funil, e diz-se porquê.
      semColuna = true
      respostas = await Promise.all(ESTADOS_PIPELINE.map((e) => lerColuna(e, false)))
    }
    const falha = respostas.find((r) => r.error)
    if (falha?.error) throw new Error(falha.error.message)
    colunas = ESTADOS_PIPELINE.map((estado, i) => ({
      estado,
      total: respostas[i].count ?? 0,
      cartoes: (respostas[i].data ?? []) as unknown as Cartao[],
    }))
  } catch (e) {
    return (
      <div className="space-y-6">
        <Cabecalho titulo="Quadro do pipeline" sub="Os negócios por funil e por estado." />
        <Falhou oQue="Não consegui ler o quadro." detalhe={e instanceof Error ? e.message : undefined} />
      </div>
    )
  }

  const total = colunas.reduce((t, c) => t + c.total, 0)

  return (
    <div className="space-y-6">
      <Cabecalho
        titulo="Quadro do pipeline"
        sub="Cada funil da Conduta v2 e o B2B, por estado. Os números são contagens exactas; cada coluna mostra os 25 mexidos há menos tempo. Clica num nome para abrir a ficha completa."
      />

      <p className="text-xs text-zinc-500">
        <a href="/backoffice/pipeline" className="text-[#D2A63C] hover:underline">← lista com o passo seguinte</a>
        {' · '}
        <a href="/backoffice/tarefas" className="text-[#D2A63C] hover:underline">tarefas</a>
      </p>

      {aviso && <Aviso>{aviso}</Aviso>}
      {semColuna && (
        <Aviso>
          Falta aplicar a migração 261 (coluna «funil»). Até lá o quadro mostra todos os negócios juntos e não dá para
          escolher o funil.
        </Aviso>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Funil">
        {[null, ...FILTROS_FUNIL].map((f) => {
          const activo = (f ?? null) === (funil ?? null)
          return (
            <a
              key={f ?? 'todos'}
              href={ligacao({ funil: f, importados })}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                activo ? 'border-[#D2A63C] bg-[#D2A63C]/10 text-[#E9C46A]' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {f === null ? 'Todos' : f === SEM_FUNIL ? 'Por classificar' : FUNIL_NOME[f]}
            </a>
          )
        })}
        <a
          href={ligacao({ funil, importados: !importados })}
          className="ml-auto rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-600"
        >
          {importados ? 'Esconder importados do WhatsApp' : 'Mostrar importados do WhatsApp'}
        </a>
      </nav>

      {funil && funil !== SEM_FUNIL && <p className="text-sm text-zinc-400">{FUNIL_RESUMO[funil]}</p>}

      <p className="text-sm text-zinc-400">
        {total} negócio{total === 1 ? '' : 's'}
        {funil ? ` em ${funil === SEM_FUNIL ? 'por classificar' : FUNIL_NOME[funil]}` : ''}
        {importados ? ', com os importados' : ''}.
      </p>

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex min-w-max gap-3">
          {colunas.map((c) => (
            <section
              key={c.estado}
              className={`w-64 shrink-0 rounded-xl border p-3 ${
                ehEstadoFechado(c.estado) ? 'border-zinc-900 bg-zinc-950/40' : 'border-zinc-800 bg-zinc-900/30'
              }`}
            >
              <header className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{ESTADO_PIPELINE_NOME[c.estado]}</h2>
                <span className={`text-sm font-semibold ${c.total ? 'text-[#E9C46A]' : 'text-zinc-600'}`}>{c.total}</span>
              </header>
              <ol className="space-y-2">
                {c.cartoes.map((n) => {
                  const dias = diasParado(n.atualizado_em)
                  const parado = !ehEstadoFechado(c.estado) && dias !== null && dias >= 7
                  return (
                    <li key={n.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2.5">
                      <a href={`/backoffice/pipeline/ficha/${n.id}`} className="block truncate text-sm font-medium text-white hover:text-[#E9C46A]">
                        {n.nome}
                      </a>
                      <p className={`mt-0.5 text-[11px] ${parado ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {n.origem ?? 'sem origem'}
                        {dias !== null ? ` · há ${dias} d` : ''}
                        {n.agente_id ? ' · agente IA' : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {semColuna ? null : funil && funil !== SEM_FUNIL ? (
                          <span className="text-[11px] text-zinc-500">{nomeDoFunil(n.funil)}</span>
                        ) : (
                          <EscolherFunil id={n.id} funil={n.funil ?? null} />
                        )}
                        <Mover id={n.id} estado={c.estado} nome={n.nome} />
                      </div>
                    </li>
                  )
                })}
              </ol>
              {c.total > c.cartoes.length && (
                <a href={`/backoffice/pipeline?estado=${c.estado}`} className="mt-2 block text-[11px] text-zinc-500 hover:text-[#D2A63C]">
                  +{c.total - c.cartoes.length} na lista →
                </a>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
