/**
 * A GUARDA DO AIOS.
 *
 *   npx tsx lib/aios/agentes.check.ts
 *
 * Um comando de voz mal encaminhado não dá erro: manda a frase ao agente errado, ou abre o
 * separador errado, e quem falou conclui que o sistema não o percebeu. Metade destes testes existe
 * para apanhar o caso em que DUAS regras querem a mesma frase.
 */
import { AGENTES, IDS_AGENTES, SOPS, lerComandoDeVoz, pedacoDoStream } from './agentes'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

// ── Os doze agentes, e os SOPs que apontam para eles ────────────────────────
teste('são doze agentes', IDS_AGENTES.length === 12)
teste('todos têm nome, emoji e cor', IDS_AGENTES.every((id) => AGENTES[id].nome && AGENTES[id].emoji && /^#[0-9a-f]{6}$/i.test(AGENTES[id].cor)))
for (const [chave, sop] of Object.entries(SOPS)) {
  teste(`o SOP «${chave}» aponta para um agente que existe`, IDS_AGENTES.includes(sop.agente))
  teste(`o SOP «${chave}» tem pedido escrito`, sop.pedido.length > 40)
}

// ── Sem palavra de acordar: é conversa ──────────────────────────────────────
{
  const r = lerComandoDeVoz('preciso de um hook para um reel sobre disciplina')
  teste('uma frase comprida sem «ei aios» vai ao agente', r.tipo === 'perguntar')
  teste('e vai INTEIRA, sem cortes', r.tipo === 'perguntar' && r.texto === 'preciso de um hook para um reel sobre disciplina')
  teste('ruído curto do microfone é ignorado', lerComandoDeVoz('ah').tipo === 'nada')
  teste('silêncio é ignorado', lerComandoDeVoz('   ').tipo === 'nada')
}

// ── Comandos ────────────────────────────────────────────────────────────────
{
  teste('métricas', lerComandoDeVoz('ei aios mostra as metricas').tipo === 'recarregar')
  teste('métricas com acento', (() => { const r = lerComandoDeVoz('Ei AIOS, mostra-me as métricas'); return r.tipo === 'recarregar' && r.o_que === 'metricas' })())
  teste('relatório também carrega métricas', (() => { const r = lerComandoDeVoz('jarvis dá-me o relatório'); return r.tipo === 'recarregar' && r.o_que === 'metricas' })())
  teste('n8n', (() => { const r = lerComandoDeVoz('ei aios como está o n8n'); return r.tipo === 'recarregar' && r.o_que === 'n8n' })())
  teste('marcações abre a actividade', (() => { const r = lerComandoDeVoz('jarvis mostra as marcações'); return r.tipo === 'separador' && r.nome === 'activity' })())
  teste('funil', (() => { const r = lerComandoDeVoz('ei aios abre o funil'); return r.tipo === 'separador' && r.nome === 'funnel' })())
  teste('kanban', (() => { const r = lerComandoDeVoz('ei aios abre o kanban'); return r.tipo === 'separador' && r.nome === 'kanban' })())
}

// ── Agentes por nome falado ─────────────────────────────────────────────────
{
  const casos: Array<[string, string]> = [
    ['ei aios fala com o setter', 'setter'],
    ['jarvis passa para trading', 'trading'],
    ['ei aios quero o financeiro', 'financial_email'],
    ['ei aios muda para prospeção', 'prospeccao'],
    ['jarvis educação', 'education'],
    ['ei aios negócios', 'business_incubation'],
  ]
  for (const [frase, esperado] of casos) {
    const r = lerComandoDeVoz(frase)
    teste(`«${frase}» → ${esperado}`, r.tipo === 'agente' && r.id === esperado)
  }
}

// ── AS COLISÕES: duas regras a quererem a mesma frase ───────────────────────
//
// Estas são as que interessam. «conteúdo» é o nome de um agente E de um separador; «agenda» podia
// ser confundido com o agente de marcações. A ordem das verificações é que resolve, e é por isso
// que ela está fixada aqui — mexer nela parte isto sem dar erro.
{
  const kanban = lerComandoDeVoz('ei aios abre o quadro de conteúdo')
  teste('«quadro de conteúdo» é o separador, não o agente', kanban.tipo === 'separador' && kanban.nome === 'kanban')

  const agente = lerComandoDeVoz('ei aios fala com o conteúdo')
  teste('«fala com o conteúdo» é o agente', agente.tipo === 'agente' && agente.id === 'content_creation')

  const marcacoes = lerComandoDeVoz('ei aios mostra a agenda')
  teste('«agenda» abre as marcações', marcacoes.tipo === 'separador' && marcacoes.nome === 'activity')
}

// ── Palavra de acordar sem ordem nenhuma ────────────────────────────────────
teste('só «ei aios» não faz nada', lerComandoDeVoz('ei aios').tipo === 'nada')
teste('«jarvis» sozinho não faz nada', lerComandoDeVoz('jarvis').tipo === 'nada')

// ── O stream do chat ────────────────────────────────────────────────────────
{
  teste('formato OpenAI', pedacoDoStream('data: {"choices":[{"delta":{"content":"olá"}}]}') === 'olá')
  teste('formato content', pedacoDoStream('data: {"content":"olá"}') === 'olá')
  teste('formato text', pedacoDoStream('data: {"text":"olá"}') === 'olá')
  teste('[DONE] não é texto', pedacoDoStream('data: [DONE]') === '')
  teste('linha que não é data: é ignorada', pedacoDoStream(': keep-alive') === '')
  teste('JSON partido não rebenta', pedacoDoStream('data: {"choices":[{"delta') === '')
  teste('linha vazia não rebenta', pedacoDoStream('') === '')
}

if (falhas.length) {
  console.error(`aios/agentes: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('aios/agentes: doze agentes, SOPs ligados, voz encaminhada e colisões resolvidas ✓')
