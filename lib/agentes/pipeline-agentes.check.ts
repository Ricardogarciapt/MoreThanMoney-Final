/**
 * A GUARDA DOS AGENTES NO PIPELINE (06/10).   ./node_modules/.bin/tsx lib/agentes/pipeline-agentes.check.ts
 *
 * Os casos MAUS: acção fora do catálogo recusada; não existe acção de apagar; tecto diário
 * respeitado (e tecto que não se contou = nada); negócio de um humano não muda de etapa por um
 * agente (só notas); «ganho» nunca; cada acção — aceite OU recusada — dá uma linha de registo.
 */
import { readFileSync } from 'node:fs'
import {
  ACCOES_PIPELINE, ACCOES_EM_NEGOCIO_HUMANO, decidirAccaoPipeline, linhaDoRegisto, raizDeVendas,
  type ContextoPipeline, type NegocioParaAgente,
} from './pipeline-agentes'

const falhas: string[] = []
const teste = (n: string, ok: boolean) => { if (!ok) falhas.push(n) }

const AG = '11111111-1111-4111-8111-111111111111'
const OUTRO_AG = '22222222-2222-4222-8222-222222222222'
const HUMANO = '33333333-3333-4333-8333-333333333333'
const NEG = '44444444-4444-4444-8444-444444444444'
const AGORA = new Date('2026-10-06T12:00:00Z')

const neg = (p: Partial<NegocioParaAgente> = {}): NegocioParaAgente => ({
  id: NEG, nome: 'Ana', estado: 'lead', agente_id: AG,
  prospector_id: null, setter_id: null, closer_id: null, team_leader_id: null, afiliado_id: null, ...p,
})
const ctx = (p: Partial<ContextoPipeline> = {}): ContextoPipeline => ({
  agenteId: AG, agenteCodigo: 'AG-SETTER', agenteEstado: 'vivo', usadosHoje: 0, tecto: 40, negocio: neg(), agora: AGORA, ...p,
})

// ── 1. Fora do catálogo é recusado ────────────────────────────────────────────────────────────
for (const accao of ['apagar', 'apagar_negocio', 'delete', 'reembolso', 'alterar_preco', 'dar_permissao', 'marcar_ganho', 'enviar', '', undefined]) {
  const r = decidirAccaoPipeline({ accao, negocio_id: NEG }, ctx())
  teste(`fora do catálogo recusado: ${String(accao)}`, !r.ok && r.codigo === 400)
}

// ── 2. Não há acção de apagar (nem envio, nem dinheiro) no catálogo ───────────────────────────
for (const a of ACCOES_PIPELINE) {
  teste(`catálogo sem apagar/enviar/dinheiro: ${a}`, !/apag|delet|remov|envi|pag|preco|reembols|permiss|ganho/.test(a))
}
const fonteDb = readFileSync(new URL('./pipeline-agentes-db.ts', import.meta.url), 'utf8')
teste('o executor não chama .delete()', !/\.delete\(/.test(fonteDb))
teste('o executor não escreve vendas_vendas nem comissões', !/vendas_vendas|vendas_comissoes/.test(fonteDb))
const fonteRota = readFileSync(new URL('../../app/api/admin/agentes/motor/route.ts', import.meta.url), 'utf8')
teste('a rota do motor não tem .delete()', !/\.delete\(/.test(fonteRota))
const migracao = readFileSync(new URL('../../supabase/migrations/190_agentes_no_pipeline.sql', import.meta.url), 'utf8')
teste('o registo é só de acrescentar (gatilho contra UPDATE/DELETE)', /before update or delete on public\.vendas_agentes_accoes/.test(migracao))

// ── 3. Tecto diário ───────────────────────────────────────────────────────────────────────────
{
  const nota = { accao: 'nota', negocio_id: NEG, texto: 'ligou e pediu para falar amanhã' }
  teste('abaixo do tecto passa', decidirAccaoPipeline(nota, ctx({ usadosHoje: 39 })).ok)
  const no = decidirAccaoPipeline(nota, ctx({ usadosHoje: 40 }))
  teste('no tecto é recusado (429)', !no.ok && no.codigo === 429)
  const cego = decidirAccaoPipeline(nota, ctx({ usadosHoje: null }))
  teste('tecto que não se contou: recusa (503)', !cego.ok && cego.codigo === 503)
}

// ── 4. Negócio de um humano: só notas ─────────────────────────────────────────────────────────
for (const col of ['prospector_id', 'setter_id', 'closer_id', 'team_leader_id', 'afiliado_id'] as const) {
  const n = neg({ [col]: HUMANO, estado: 'marcado' })
  const mover = decidirAccaoPipeline({ accao: 'mudar_etapa', negocio_id: NEG, para: 'perdido', motivo_perda: 'sem resposta' }, ctx({ negocio: n }))
  teste(`humano em ${col}: agente NÃO muda a etapa`, !mover.ok && mover.codigo === 403)
  for (const a of ['qualificar', 'assumir', 'agendar_followup', 'passar_a_humano', 'rascunho_mensagem', 'registar_actividade'] as const) {
    teste(`humano em ${col}: ${a} recusado`, !decidirAccaoPipeline({ accao: a, negocio_id: NEG, pontuacao: 50, porque: 'x', prazo: '2026-10-08', texto: 'abc', tipo: 'pesquisa', canal: 'email' }, ctx({ negocio: n })).ok)
  }
  teste(`humano em ${col}: nota passa`, decidirAccaoPipeline({ accao: 'nota', negocio_id: NEG, texto: 'cliente pediu proposta' }, ctx({ negocio: n })).ok)
}
teste('só «nota» é permitida em negócio humano', ACCOES_EM_NEGOCIO_HUMANO.length === 1 && ACCOES_EM_NEGOCIO_HUMANO[0] === 'nota')
{
  const r = decidirAccaoPipeline({ accao: 'mudar_etapa', negocio_id: NEG, para: 'contactado' }, ctx({ negocio: neg({ agente_id: OUTRO_AG }) }))
  teste('negócio de OUTRO agente: não muda a etapa', !r.ok && r.codigo === 403)
  const sem = decidirAccaoPipeline({ accao: 'mudar_etapa', negocio_id: NEG, para: 'contactado' }, ctx({ negocio: neg({ agente_id: null }) }))
  teste('negócio da bolsa sem assumir: não muda a etapa', !sem.ok)
  const assumir = decidirAccaoPipeline({ accao: 'assumir', negocio_id: NEG }, ctx({ negocio: neg({ agente_id: null }) }))
  teste('assumir da bolsa passa', assumir.ok)
}

// ── 5. Etapas: «ganho» nunca; perdido com motivo ──────────────────────────────────────────────
{
  const g = decidirAccaoPipeline({ accao: 'mudar_etapa', negocio_id: NEG, para: 'ganho' }, ctx({ negocio: neg({ estado: 'apresentado' }) }))
  teste('agente nunca marca «ganho»', !g.ok && g.codigo === 403)
  teste('perdido sem motivo recusado', !decidirAccaoPipeline({ accao: 'mudar_etapa', negocio_id: NEG, para: 'perdido' }, ctx()).ok)
  const ok = decidirAccaoPipeline({ accao: 'mudar_etapa', negocio_id: NEG, para: 'contactado' }, ctx())
  teste('mover o seu negócio passa e escreve evento com agente_id', ok.ok && ok.plano.evento?.agente_id === AG && ok.plano.evento?.por === null)
  teste('mover não toca em dinheiro', ok.ok && !Object.keys(ok.plano.negocioUpdate!.campos).some((k) => /venda|comiss|valor/.test(k)))
  teste('etapa inventada recusada', !decidirAccaoPipeline({ accao: 'mudar_etapa', negocio_id: NEG, para: 'fechadissimo' }, ctx()).ok)
}

// ── 6. Validação dos campos ───────────────────────────────────────────────────────────────────
{
  const base = { accao: 'criar_lead', nome: 'Rui', email: 'rui@empresa.pt', origem: 'instagram', fonte: 'comentou o post de 05/10' }
  teste('lead sem origem recusado', !decidirAccaoPipeline({ ...base, origem: undefined }, ctx()).ok)
  teste('lead com origem fora da lista recusado', !decidirAccaoPipeline({ ...base, origem: 'inventada' }, ctx()).ok)
  teste('lead sem fonte recusado', !decidirAccaoPipeline({ ...base, fonte: '' }, ctx()).ok)
  teste('lead sem contacto recusado', !decidirAccaoPipeline({ ...base, email: undefined }, ctx()).ok)
  teste('lead duplicado recusado', !decidirAccaoPipeline(base, ctx({ duplicadoDe: NEG })).ok)
  const l = decidirAccaoPipeline(base, ctx())
  teste('lead válido nasce em «lead», com agente_id e sem humano', l.ok && l.plano.negocioInsert?.estado === 'lead' && l.plano.negocioInsert?.agente_id === AG && !('closer_id' in l.plano.negocioInsert!))
  teste('pontuação 101 recusada', !decidirAccaoPipeline({ accao: 'qualificar', negocio_id: NEG, pontuacao: 101, porque: 'x' }, ctx()).ok)
  teste('pontuação sem porquê recusada', !decidirAccaoPipeline({ accao: 'qualificar', negocio_id: NEG, pontuacao: 60 }, ctx()).ok)
  const q = decidirAccaoPipeline({ accao: 'qualificar', negocio_id: NEG, pontuacao: 60, porque: 'abriu conta na corretora' }, ctx())
  teste('qualificar não pisa a nota do closer', q.ok && !('nota' in q.plano.negocioUpdate!.campos))
  teste('follow-up no passado recusado', !decidirAccaoPipeline({ accao: 'agendar_followup', negocio_id: NEG, prazo: '2026-10-01' }, ctx()).ok)
  teste('follow-up a 1 ano recusado', !decidirAccaoPipeline({ accao: 'agendar_followup', negocio_id: NEG, prazo: '2027-10-01' }, ctx()).ok)
  const f = decidirAccaoPipeline({ accao: 'agendar_followup', negocio_id: NEG, prazo: '2026-10-09', rascunho: 'Olá Ana…' }, ctx())
  teste('follow-up é tarefa do agente (sem responsável humano)', f.ok && f.plano.tarefaInsert?.agente_id === AG && f.plano.tarefaInsert?.responsavel_id === null)
  const rasc = decidirAccaoPipeline({ accao: 'rascunho_mensagem', negocio_id: NEG, canal: 'email', texto: 'Olá Ana' }, ctx())
  teste('rascunho não envia', rasc.ok && rasc.plano.depois?.enviado === false && !rasc.plano.negocioUpdate && !rasc.plano.tarefaInsert)
  teste('passagem a quem não tem o papel recusada', !decidirAccaoPipeline({ accao: 'passar_a_humano', negocio_id: NEG, pessoa_id: HUMANO, papel: 'closer', porque: 'pediu chamada' }, ctx({ papeisDaPessoa: ['setter'] })).ok)
  teste('passagem para afiliado recusada', !decidirAccaoPipeline({ accao: 'passar_a_humano', negocio_id: NEG, pessoa_id: HUMANO, papel: 'afiliado', porque: 'x' }, ctx({ papeisDaPessoa: ['afiliado'] })).ok)
  const pas = decidirAccaoPipeline({ accao: 'passar_a_humano', negocio_id: NEG, pessoa_id: HUMANO, papel: 'closer', porque: 'pediu chamada' }, ctx({ papeisDaPessoa: ['closer'] }))
  teste('passagem válida põe a pessoa e dá-lhe uma tarefa', pas.ok && pas.plano.negocioUpdate?.campos.closer_id === HUMANO && pas.plano.tarefaInsertHumano?.responsavel_id === HUMANO)
  teste('fechar tarefa de uma pessoa recusado', !decidirAccaoPipeline({ accao: 'fechar_tarefa', tarefa_id: NEG, estado: 'feita' }, ctx({ tarefa: { id: NEG, estado: 'aberta', agente_id: null, responsavel_id: HUMANO, negocio_id: null } })).ok)
  teste('agente morto não trabalha', !decidirAccaoPipeline({ accao: 'nota', negocio_id: NEG, texto: 'abc' }, ctx({ agenteEstado: 'morto' })).ok)
  teste('agente que não é de vendas não trabalha', !decidirAccaoPipeline({ accao: 'nota', negocio_id: NEG, texto: 'abc' }, ctx({ agenteCodigo: 'AG-TRADER' })).ok)
  teste('filho do Setter é de vendas', raizDeVendas('AG-SETTER-1-2') === 'AG-SETTER' && raizDeVendas('AG-SETTERX') === null)
}

// ── 7. Cada acção fica registada (aceite e recusada) ──────────────────────────────────────────
{
  const c = { agenteId: AG, agenteCodigo: 'AG-SETTER' }
  const aceite = decidirAccaoPipeline({ accao: 'mudar_etapa', negocio_id: NEG, para: 'contactado' }, ctx())
  const la = linhaDoRegisto({ accao: 'mudar_etapa', negocio_id: NEG, para: 'contactado' }, c, aceite)
  teste('registo da aceite: agente, antes e depois', la.ok === true && la.agente_id === AG && (la.antes as { estado: string }).estado === 'lead' && (la.depois as { estado: string }).estado === 'contactado')
  const recusa = decidirAccaoPipeline({ accao: 'apagar', negocio_id: NEG }, ctx())
  const lr = linhaDoRegisto({ accao: 'apagar', negocio_id: NEG }, c, recusa)
  teste('registo da recusa: fora_do_catalogo, ok=false, com erro', lr.ok === false && lr.accao === 'fora_do_catalogo' && typeof lr.erro === 'string')
  teste('registo da recusa não aponta para um negócio que não se leu', lr.negocio_id === null)
  teste('o executor regista a recusa e a aceite', (fonteDb.match(/registar\(linhaDoRegisto/g) ?? []).length >= 3)
}

if (falhas.length) {
  console.log(`pipeline-agentes: ${falhas.length} falha(s)`)
  for (const f of falhas) console.log('  · ' + f)
  process.exit(1)
}
console.log('pipeline-agentes: catálogo fechado, sem apagar, tecto respeitado, negócio humano só com notas, tudo registado ✓')
