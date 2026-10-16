import Link from 'next/link'
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Aviso, Cabecalho, Etiqueta, Vazio } from '../_partes/blocos'
import { Campo, ESTILO_CAMPO, Filtros, Paginacao, type Params } from '../_partes/navegar'
import { ambitoDaPagina, nomesDe } from '@/lib/backoffice-equipa'
import { negociosDoAmbito, papeisNoNegocio, type NegocioLinha } from '@/lib/backoffice-negocios'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerDoCatalogo, lerPagina, lerProcura } from '@/lib/backoffice-paginacao'
import { ESTADOS_PIPELINE, ESTADO_PIPELINE_NOME, ehEstadoPipeline, dataCurta } from '@/lib/backoffice-vista'
import { PAPEIS, PAPEL_NOME, ehPapel } from '@/lib/backoffice-papeis'
import { COLUNA_DO_PAPEL } from '@/lib/backoffice-escrita'
import { estaSemDono } from '@/lib/backoffice-bolsa'
import { Contactar } from '@/components/backoffice-contactar'
import { NegocioNovo } from '../pipeline/novo'
import { Pegar } from '../pipeline/pegar'
import { Mover } from '../pipeline/mover'
import { Trabalhar } from '../pipeline/trabalhar'
import { Historico } from '../pipeline/historico'
import { ActualizarPipeline } from '../pipeline/actualizar'
import { TarefaNova } from '../tarefas/nova'
import { linkAgendar } from '@/lib/agenda/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'CRM da equipa · Backoffice MTM' }
const BASE = '/backoffice/crm'

/** A mesma leitura e as mesmas rotas de escrita do pipeline; nunca uma lista global de contactos. */
export default async function CrmPage({ searchParams }: { searchParams: Promise<Params> }) {
  const acesso = await abrirPagina('bo.pipeline_proprio')
  if (!acesso.ok) return <SemAcesso motivo={acesso.motivo} oQue="O CRM é para a equipa que trabalha o pipeline." />
  const { ctx } = acesso
  const params = await searchParams
  const estado = lerDoCatalogo(params.estado, ESTADOS_PIPELINE)
  const procura = lerProcura(params.procura)
  const pagina = lerPagina(params)
  const { ambito, aviso } = await ambitoDaPagina(ctx, 'pipeline')
  let linhas: NegocioLinha[]
  let haMais: boolean
  try {
    const r = await negociosDoAmbito(getSupabaseAdmin(), ambito, {
      incluirSemDono: true, estado, procura, pagina,
    })
    linhas = r.linhas
    haMais = r.haMais
  } catch {
    return <div className="space-y-4"><Cabecalho titulo="CRM da equipa" sub="Contactos, qualificação e acompanhamento humano." />
      <Aviso>Não foi possível ler o CRM. Isto é um erro de leitura, não uma lista vazia. Tenta novamente; se continuar, pede ao administrador para verificar a ligação e as migrações.</Aviso></div>
  }
  const nomes = await nomesDe(linhas.flatMap(n => PAPEIS.map(p => n[COLUNA_DO_PAPEL[p]]).filter((v): v is string => !!v)))
  return <div className="space-y-6">
    <ActualizarPipeline />
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Cabecalho titulo="CRM da equipa" sub="Uma ficha por negócio. Trabalha os teus contactos, assume leads da bolsa e passa da triagem IA ao acompanhamento humano — sem listas paralelas." />
      <Link href="/backoffice/pipeline" className="text-sm text-[#D2A63C] hover:underline">Ver pipeline por etapas →</Link>
    </div>
    {aviso && <Aviso>{aviso}</Aviso>}
    <div className="flex flex-wrap gap-4 rounded-xl border border-[#D2A63C]/20 bg-[#D2A63C]/5 p-4 text-sm">
      <Link href="/backoffice/tarefas" className="text-[#E9C46A] hover:underline">As minhas tarefas</Link>
      <a href={linkAgendar('apresentacao')} target="_blank" rel="noreferrer" className="text-[#E9C46A] hover:underline">Abrir agenda de apresentações ↗</a>
      <span className="text-gray-400">A agenda abre a página de marcação; não reserva um horário automaticamente.</span>
    </div>
    <NegocioNovo papeis={ctx.papeis} ehDono={ctx.admin} />
    <Filtros base={BASE} activo={!!estado || !!procura}>
      <Campo nome="Nome"><input name="procura" defaultValue={procura ?? ''} maxLength={100} placeholder="Procurar contacto" className={ESTILO_CAMPO} /></Campo>
      <Campo nome="Etapa"><select name="estado" defaultValue={estado ?? ''} className={ESTILO_CAMPO}>
        <option value="">Todas as etapas</option>{ESTADOS_PIPELINE.map(e => <option key={e} value={e}>{ESTADO_PIPELINE_NOME[e]}</option>)}
      </select></Campo>
    </Filtros>
    <p className="text-xs text-gray-500">{linhas.length} negócios nesta página{haMais ? ' · existem mais páginas' : ''}. Apenas o teu âmbito e a bolsa sem dono. Atualização a cada 30 segundos enquanto não estás a editar.</p>
    {!linhas.length && <Vazio titulo="Sem contactos para estes filtros" seguinte="Limpa os filtros ou cria um lead. Os contactos atribuídos aparecem apenas no âmbito autorizado da equipa." />}
    <div className="grid gap-4 lg:grid-cols-2">
      {linhas.map(n => {
        const bolsa = estaSemDono(n)
        const meus = papeisNoNegocio(n, ctx.userId).filter(ehPapel)
        return <article key={n.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">{n.nome}</h2>
            <div className="flex gap-2"><Etiqueta>{ehEstadoPipeline(n.estado) ? ESTADO_PIPELINE_NOME[n.estado] : n.estado}</Etiqueta>
              {n.crm_ai_score && <Etiqueta tom="aviso">Triagem IA · {n.crm_ai_score}</Etiqueta>}</div>
          </div>
          <p className="mt-1 text-xs text-gray-500">Origem: {n.origem || 'não indicada'} · atualizado {dataCurta(n.atualizado_em)}</p>
          <div className="mt-4"><Contactar pessoa={n} limite={5} /></div>
          {n.crm_ai_resumo && <section className="mt-4 rounded-lg border border-[#D2A63C]/20 bg-[#D2A63C]/5 p-3"><h3 className="text-xs font-semibold text-[#E9C46A]">Resumo da triagem IA · confirmar com a pessoa</h3><p className="mt-1 whitespace-pre-wrap text-sm text-gray-300">{n.crm_ai_resumo}</p></section>}
          <dl className="mt-4 space-y-1 text-xs text-gray-400">
            {PAPEIS.filter(p => !!n[COLUNA_DO_PAPEL[p]]).map(p => <div key={p} className="flex justify-between gap-3"><dt>{PAPEL_NOME[p]}</dt><dd>{nomes[n[COLUNA_DO_PAPEL[p]]!] || 'Responsável atribuído'}</dd></div>)}
          </dl>
          {n.nota && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-300">{n.nota}</p>}
          {bolsa ? <div className="mt-4 space-y-2"><p className="text-xs text-gray-400">Sem responsável. Assume o lead antes de o trabalhar.</p><Pegar id={n.id} nome={n.nome} /></div> : <div className="mt-4 space-y-3">
            {ehEstadoPipeline(n.estado) && <Mover id={n.id} estado={n.estado} nome={n.nome} />}
            <Trabalhar id={n.id} nota={n.nota} meus={meus} vagos={PAPEIS.filter(p => !n[COLUNA_DO_PAPEL[p]] && (ctx.admin || ctx.papeis.includes(p)))} />
            <TarefaNova negocioId={n.id} />
            <Historico id={n.id} />
          </div>}
          <Link href={`/backoffice/pipeline?negocio=${encodeURIComponent(n.id)}#negocio-${n.id}`} className="mt-4 inline-block text-xs text-[#D2A63C] hover:underline">Abrir no pipeline →</Link>
        </article>
      })}
    </div>
    <Paginacao base={BASE} params={params} pagina={pagina} mostradas={linhas.length} haMais={haMais} />
  </div>
}
