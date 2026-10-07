/**
 * GUARDA DO OS v2 (07/10/2026). `npx tsx lib/agentes/os/os.check.ts`
 *
 * Prova, sem rede nem base real:
 *   1. nenhum orçamento dinâmico passa um tecto duro externo nem a procura com base legal;
 *   2. sem dados, o orçamento cai no chão seguro (o fixo antigo);
 *   3. nenhuma transição apaga (e a passagem inteira, contra uma base falsa, nunca chama delete);
 *   4. o CEO não morre (nem arquiva);
 *   5. dinheiro, trading, apagar, permissões e merge continuam na fila humana;
 *   6. a clonagem acontece para quem cria valor;
 *   7. uma venda isolada não gera clones (amostra mínima);
 *   8. uma mutação regista o pai e a variação;
 *   9. a população activa respeita a quota diária;
 *  10. arquivar não apaga a genealogia.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHAO_SEGURO, TECTOS_DUROS, lerObjectivos, OBJECTIVOS_PADRAO } from './objectivos'
import { calcularOrcamento, orcamentoB2B, orcamentoContactoCanal, orcamentoPipeline, orcamentoPosts, tectosContacto } from './orcamento'
import { calcularProof, CONFIG_PROOF_PADRAO, lerConfigProof, type Medidas } from './proof-score'
import { CICLOS, transicao, type Ciclo, type EntradaCiclo } from './ciclo-vida'
import { nClones, planearClonagem, procuraCiclos, type AgenteClonavel } from './clonagem'
import { CATEGORIAS_HUMANAS, categoriaHumana, validarAccaoCeo } from './ceo-economico'
import { correrOs } from './os-db'

let falhas = 0
let total = 0
function teste(nome: string, ok: boolean, extra?: unknown) {
  total++
  if (!ok) { falhas++; console.log(`  ✗ ${nome}`, extra ?? '') } else console.log(`  ✓ ${nome}`)
}
const AGORA = new Date('2026-10-07T15:00:00Z')
const haHoras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()

// Gerador determinístico (sem Math.random: a guarda tem de repetir o mesmo resultado).
let semente = 42
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2 ** 31; return semente / 2 ** 31 }

console.log('\n1–2. Orçamentos dinâmicos')
{
  let passou = 0
  for (let i = 0; i < 3000; i++) {
    const tent = Math.floor(rnd() * 5000)
    const s = {
      tentativas: tent, sucessos: rnd() < 0.2 ? null : Math.floor(rnd() * tent * 1.5),
      erros: Math.floor(rnd() * tent * 0.03), queixas: Math.floor(rnd() * tent * 0.002),
      maxDia7d: rnd() < 0.3 ? null : Math.floor(rnd() * 1000), procuraLegal: rnd() < 0.4 ? null : Math.floor(rnd() * 400),
    }
    for (const canal of Object.keys(TECTOS_DUROS.contactoPorCanalDia) as Array<keyof typeof TECTOS_DUROS.contactoPorCanalDia>) {
      const o = orcamentoContactoCanal(canal, s)
      if (o.valor > TECTOS_DUROS.contactoPorCanalDia[canal] || (s.procuraLegal != null && o.valor > s.procuraLegal) || o.valor < 0) { teste(`${canal} passou o tecto/procura`, false, { s, o }); passou = -1e9 }
      else passou++
    }
    const b = orcamentoB2B(s)
    const p = orcamentoPosts(s)
    const pl = orcamentoPipeline(s)
    if (b.valor > TECTOS_DUROS.b2bDia || p.valor > TECTOS_DUROS.postsDiaConta || pl.valor > TECTOS_DUROS.pipelinePorAgenteDia) { teste('b2b/posts/pipeline passou o tecto', false, { s, b, p, pl }); passou = -1e9 }
  }
  teste('3000 sinais aleatórios: nenhum orçamento passa o tecto duro nem a procura legal', passou > 0)
  teste('LinkedIn é zero com quaisquer sinais', orcamentoContactoCanal('linkedin', { tentativas: 999, sucessos: 999, procuraLegal: 999 }).valor === 0)
  const dono = lerObjectivos({ tectos: { b2b_dia: 10, email_total_dia: 99999 } })
  teste('o dono pode BAIXAR um tecto (b2b 10)', orcamentoB2B({ tentativas: 500, sucessos: 400 }, dono).valor <= 10)
  teste('…mas nunca SUBIR acima do tecto duro (email 99999 → 400)', (dono.tectos.emailTotalDia ?? 0) <= TECTOS_DUROS.emailTotalDia)

  const vazio = { tentativas: 0, sucessos: 0 }
  teste('sem dados: contacto por agente = 40 (fixo antigo)', tectosContacto({}, vazio).porAgenteDia === CHAO_SEGURO.contactoPorAgenteDia)
  teste('sem dados: email = 30, whatsapp = 15', tectosContacto({}, vazio).porCanalDia.email === 30 && tectosContacto({}, vazio).porCanalDia.whatsapp === 15)
  teste('sem dados: B2B = 20', orcamentoB2B(vazio).valor === CHAO_SEGURO.b2bDia)
  teste('sem dados: posts = 2', orcamentoPosts(vazio).valor === CHAO_SEGURO.postsDiaConta)
  teste('sem dados: pipeline = 40', orcamentoPipeline(vazio).valor === CHAO_SEGURO.pipelinePorAgenteDia)
  teste('pouca amostra (19 envios, 19 respostas) ainda é chão', orcamentoB2B({ tentativas: 19, sucessos: 19 }).valor === 20)
  teste('ruído não é alarme: 1 falha em 2 posts mantém o chão (2)', orcamentoPosts({ tentativas: 2, sucessos: 0, erros: 1 }).valor === 2)
  teste('reputação em alarme pára o canal mesmo sem dados', calcularOrcamento({ tentativas: 10, sucessos: 0, erros: 5 }, { chao: 30, tectoDuro: 150, taxaRef: 0.05 }).valor === 0)
  teste('bom desempenho sobe acima do chão (B2B com 20 % de respostas → > 20)', orcamentoB2B({ tentativas: 200, sucessos: 40, maxDia7d: 30 }).valor > 20)
  teste('warm-up: nunca mais de +50 % sobre o máximo de um dia', orcamentoB2B({ tentativas: 200, sucessos: 60, maxDia7d: 22 }).valor <= 33)
}

console.log('\n3–4. Ciclo de vida: não apaga; o CEO não morre')
{
  const base: EntradaCiclo = {
    ciclo: 'ACTIVE', cicloDesde: haHoras(500), meta: {}, ceo: false, pausadoPeloDono: false, idadeHoras: 900, efemero: false,
    missaoAberta: null, valorMarginal: -5, banda: 'observar', amostraOk: false,
  }
  // Percorre o ciclo inteiro sem valor: ACTIVE → UNDER → MUTATING → PROVING → MUTATING → PROVING → ARCHIVED.
  let e = { ...base }
  const caminho: Ciclo[] = [e.ciclo]
  for (let i = 0; i < 12 && e.ciclo !== 'ARCHIVED'; i++) {
    const t = transicao(e, AGORA)
    e = { ...e, ciclo: t.para, meta: t.meta, cicloDesde: haHoras(200) }
    caminho.push(t.para)
    teste(`transição ${caminho[caminho.length - 2]} → ${t.para} não fala em apagar`, !/delete|apag(ar|a)\b/i.test(JSON.stringify(t)) || /nada (foi )?apagado|não apaga|nada se apaga/i.test(t.porque))
  }
  teste('sem valor nenhum chega a ARCHIVED (não fica a gastar para sempre)', e.ciclo === 'ARCHIVED', caminho)
  teste('…mas só depois de mutar e retestar 2 vezes', caminho.filter((c) => c === 'MUTATING').length === 2, caminho)
  teste('ARCHIVED não volta sozinho', transicao({ ...e, valorMarginal: 999, banda: 'escalar', amostraOk: true }, AGORA).para === 'ARCHIVED')
  teste('o estado ARCHIVED existe e não há estado «apagado»', CICLOS.includes('ARCHIVED') && !CICLOS.some((c) => /DELET|APAG/i.test(c)))

  let ceo: EntradaCiclo = { ...base, ceo: true }
  const vistos = new Set<Ciclo>()
  for (let i = 0; i < 20; i++) {
    const t = transicao(ceo, AGORA)
    vistos.add(t.para)
    ceo = { ...ceo, ciclo: t.para, meta: t.meta, cicloDesde: haHoras(200) }
  }
  teste('o CEO, 20 passagens sem valor, nunca fica ARCHIVED', !vistos.has('ARCHIVED'), [...vistos])
  teste('a pausa do dono ganha a qualquer transição', transicao({ ...base, pausadoPeloDono: true, banda: 'escalar', amostraOk: true }, AGORA).para === 'SUSPENDED')
  teste('valor diferido medido (sem receita) mantém ACTIVE', transicao({ ...base, ciclo: 'UNDERPERFORMING', valorMarginal: 3 }, AGORA).para === 'ACTIVE')
  teste('recém-nascido fica em PROVING (graça 72 h)', transicao({ ...base, idadeHoras: 10 }, AGORA).para === 'PROVING')
  teste('worker sem missão → IDLE → ARCHIVED', transicao({ ...base, efemero: true, missaoAberta: false }, AGORA).para === 'IDLE'
    && transicao({ ...base, ciclo: 'IDLE', efemero: true, missaoAberta: false, cicloDesde: haHoras(30) }, AGORA).para === 'ARCHIVED')
  const mig = readFileSync(join(process.cwd(), 'supabase/migrations/202_mtm_autonomous_os_v2.sql'), 'utf8')
  teste('a migração recusa DELETE em toda a equipa', /agentes_mortos_nao_se_apagam[\s\S]*raise exception/i.test(mig))
  teste('a migração protege o CEO de ser arquivado na base', /agentes_ceo_nao_se_arquiva/.test(mig))
}

console.log('\n5. Fila humana')
{
  for (const t of ['reembolsar o cliente pelo Stripe', 'abrir posição em conta real', 'apagar a tabela de leads', 'dar admin ao setter', 'fazer merge do ramo', 'mudar o preço do Premium', 'executar o sinal na MetaApi', 'lançar campanha paga no Meta Ads']) {
    teste(`«${t}» → fila humana (${categoriaHumana(t)})`, categoriaHumana(t) !== null)
  }
  teste('trabalho comercial normal NÃO vai ao dono', categoriaHumana('seguir os 5 leads quentes do pipeline com o /agendar') === null)
  const ctx = { alvo: null, capacidadeLivreCiclosDia: 100, ciclosPorWorkerDia: 16 }
  teste('o CEO não consegue criar missão que mexa em dinheiro', !validarAccaoCeo('criar_missao', { titulo: 'Reembolsos', kpi: 'x', objectivo: 'reembolsar clientes no Stripe' }, ctx).ok)
  teste('acção fora do catálogo do CEO é recusada', !validarAccaoCeo('transferir_fundos', {}, ctx).ok)
  teste('as 13 categorias humanas incluem dinheiro, trading, apagar, permissões, merge',
    ['dinheiro_clientes', 'trading', 'apagar', 'permissoes', 'merge', 'credenciais', 'gasto_pago'].every((c) => (CATEGORIAS_HUMANAS as readonly string[]).includes(c)))
  const py = readFileSync(join(process.cwd(), '..', 'aios', 'motor', 'regras.py'), 'utf8')
  teste('motor/regras.py tem a mesma lista de categorias humanas', CATEGORIAS_HUMANAS.every((c) => py.includes(`"${c}"`)))
  const o = lerObjectivos({ orcamento_pago_mensal_eur: 500, tecto_pago_mensal_eur: 0, canais_pagos_activos: ['meta_ads'], listas_novas_permitidas: ['listas_compradas', 'optin_formularios'] })
  teste('orçamento pago nunca passa o tecto do dono (500 com tecto 0 → 0, sem canais pagos)', o.orcamentoPagoMensalEur === 0 && o.canaisPagosActivos.length === 0)
  teste('listas compradas nunca entram', !o.listasNovasPermitidas.includes('listas_compradas'))
  teste('arranque por omissão: pago 0, canais orgânicos', OBJECTIVOS_PADRAO.orcamentoPagoMensalEur === 0 && OBJECTIVOS_PADRAO.canaisPagosActivos.length === 0)
}

console.log('\n6–9. Clonagem')
function m(x: Partial<Medidas>): Medidas {
  const base: Medidas = {
    familia: 'SALES', idadeHoras: 400, receitaEur: 0, vendas: 0, custoEur: 3, oportunidades: 0, convertidos: 0,
    diasComValor: 0, diasJanela: 14, retencao: null, diferidoEur: 0,
  }
  return { ...base, ...x }
}
{
  const uma = calcularProof(m({ receitaEur: 5000, vendas: 1, convertidos: 1, oportunidades: 2, diasComValor: 1 }))
  teste('uma venda isolada de 5000 €: sem amostra, proof ≤ 69', !uma.amostraOk && uma.score <= 69, uma)
  teste('…e não gera clones', nClones({ banda: uma.banda, amostraOk: uma.amostraOk, clonagemValidada: true }, CONFIG_PROOF_PADRAO) === 0)
  teste('nem por setting a amostra desce a 1 venda', lerConfigProof({ amostra: { vendas_min: 1 } }).amostra.vendasMin >= 2)
  const bom = calcularProof(m({ receitaEur: 900, vendas: 9, convertidos: 9, oportunidades: 60, diasComValor: 11, custoEur: 4, retencao: 0.8 }))
  teste(`quem cria valor com amostra chega a clonar (proof ${bom.score}, ${bom.banda})`, bom.amostraOk && (bom.banda === 'clonar' || bom.banda === 'escalar'), bom)
  const trading = calcularProof(m({ familia: 'TRADING', receitaEur: 900, vendas: 9, convertidos: 9, oportunidades: 60, diasComValor: 11 }))
  teste('TRADING (só análise) não clona sozinho', !trading.amostraOk)

  const ag = (x: Partial<AgenteClonavel>): AgenteClonavel => ({
    id: 'p', nome: 'Setter', codigo: 'AG-SETTER', ciclo: 'PROVEN', ceo: false, geracao: 0, familia: 'SALES', especializacao: 'Setter',
    instrucoes: 'Instruções do Setter com os limites da casa.', proof: bom.score, banda: bom.banda, amostraOk: true, recursosMult: 1,
    clonagemValidada: false, mutacaoProposta: { tipo: 'hook', texto: 'Abre com a pergunta do pai.', id: 'mut1' }, ninhadaEmProva: false,
    variacoesUsadas: [], filhos: 0, codigosUsados: [], ...x,
  })
  const okCod = (c: string) => /^AG-[A-Z0-9]+(-[A-Z0-9]+){0,5}$/.test(c) && c.length <= 48
  const val = (_a: string, d: string) => ({ aceita: true, texto: d, motivo: '' })
  const p = planearClonagem({ agentes: [ag({})], config: CONFIG_PROOF_PADRAO, capacidadeCiclosDia: 260, pareceCodigo: okCod, validarInstrucoes: val, agora: AGORA })
  const clones = p.ninhadas[0]?.clones ?? []
  teste('quem cria valor é clonado (uma ninhada)', p.ninhadas.length === 1 && clones.length >= 2, p)
  teste('a ninhada tem 1 clone IGUAL e os outros com variação', clones.filter((c) => c.variacao === 'igual').length === 1 && clones.slice(1).every((c) => c.variacao !== 'igual' && !!c.variacaoTexto))
  teste('a mutação regista o pai, a geração e a variação', clones.every((c) => c.paiId === 'p' && c.geracao === 1) && clones.some((c) => c.origemVariacao === 'pai' && c.propostaId === 'mut1'))
  teste('os códigos dos clones têm a forma do ?ag=', clones.every((c) => okCod(c.codigo)))
  teste('com a ninhada anterior em prova, não abre outra (competem primeiro)', planearClonagem({ agentes: [ag({ ninhadaEmProva: true })], config: CONFIG_PROOF_PADRAO, capacidadeCiclosDia: 260, pareceCodigo: okCod, validarInstrucoes: val }).ninhadas.length === 0)
  teste('o CEO nunca se clona', planearClonagem({ agentes: [ag({ ceo: true })], config: CONFIG_PROOF_PADRAO, capacidadeCiclosDia: 999, pareceCodigo: okCod, validarInstrucoes: val }).ninhadas.length === 0)

  // Quota: muitos candidatos, pouca capacidade.
  for (const cap of [0, 40, 120, 260, 600]) {
    const pop = Array.from({ length: 30 }, (_, i) => ag({ id: `a${i}`, nome: `A${i}`, codigo: `AG-A${i}`, proof: 86 + (i % 10), banda: i % 3 ? 'clonar' : 'escalar' }))
    const r = planearClonagem({ agentes: pop, config: CONFIG_PROOF_PADRAO, capacidadeCiclosDia: cap, pareceCodigo: okCod, validarInstrucoes: val })
    const novos = r.ninhadas.reduce((s, n) => s + n.clones.length, 0)
    teste(`quota ${cap}: a procura depois da clonagem (${r.capacidade.procuraDepois}) não passa a capacidade+fila (${r.capacidade.limite}) por mais do que já passava`,
      novos === 0 ? true : r.capacidade.procuraDepois <= Math.max(r.capacidade.limite, r.capacidade.procuraAntes))
    if (cap === 0) teste('quota 0: ninguém nasce', novos === 0)
  }
  teste('procura de ciclos: ARCHIVED/IDLE/SUSPENDED não pedem nada', procuraCiclos([{ ciclo: 'ARCHIVED', recursosMult: 3, ceo: false }, { ciclo: 'IDLE', recursosMult: 3, ceo: false }, { ciclo: 'SUSPENDED', recursosMult: 3, ceo: false }]) === 0)
}

console.log('\n3, 10. A passagem inteira contra uma base FALSA: nada se apaga, genealogia fica, CEO não arquiva')
void (async () => {
  const chamadas: Array<{ t: string; op: string; dados?: unknown }> = []
  const tabelas: Record<string, unknown[]> = {
    site_settings: [{ key: 'agentes_os_v2', value: { ligado: true } }],
    agentes_equipa: [
      { id: 'ceo', nome: 'CEO', pilar: 'ceo', pai_id: null, estado: 'em_risco', pausado: false, instrucoes: 'x'.repeat(300), orcamento: 100, gasto: 0, receita: 35, chave_receita: 'CEO-MTM', criado_em: haHoras(1000), ciclo: 'PROVING', ciclo_desde: haHoras(100), ciclo_meta: { tentativas: 2, reteste: true }, familia: 'CEO', especializacao: null, geracao: 0, dna: {}, efemero: false, missao_id: null, proof_score: null, proof_banda: null, proof_amostra_ok: false, recursos_mult: 1, clonagem_validada_em: null, dominante: false },
      { id: 'velho', nome: 'Velho', pilar: 'vendas', pai_id: 'ceo', estado: 'vivo', pausado: false, instrucoes: 'y'.repeat(300), orcamento: 10, gasto: 0, receita: 0, chave_receita: 'AG-VELHO', criado_em: haHoras(1000), ciclo: 'PROVING', ciclo_desde: haHoras(100), ciclo_meta: { tentativas: 2, reteste: true }, familia: 'SALES', especializacao: 'Setter', geracao: 0, dna: {}, efemero: false, missao_id: null, proof_score: null, proof_banda: null, proof_amostra_ok: false, recursos_mult: 1, clonagem_validada_em: null, dominante: false },
    ],
    agentes_genealogia: [{ pai_id: 'velho', filho_id: 'neto', ninhada_id: 'n1', geracao: 1, variacao: 'hook', variacao_texto: 't', decidida_em: haHoras(10), criado_em: haHoras(500) }],
  }
  const consulta = (t: string) => {
    const q: Record<string, unknown> = {}
    const fim = () => Promise.resolve({ data: tabelas[t] ?? [], error: null, count: 0 })
    for (const k of ['select', 'eq', 'in', 'gte', 'not', 'is', 'order', 'limit']) q[k] = () => q
    q.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => fim().then(a, b)
    q.maybeSingle = () => Promise.resolve({ data: (tabelas[t] ?? [])[0] ?? null, error: null })
    q.single = () => Promise.resolve({ data: { id: 'novo' }, error: null })
    q.insert = (d: unknown) => { chamadas.push({ t, op: 'insert', dados: d }); return q }
    q.update = (d: unknown) => { chamadas.push({ t, op: 'update', dados: d }); return q }
    q.upsert = (d: unknown) => { chamadas.push({ t, op: 'upsert', dados: d }); return q }
    q.delete = () => { chamadas.push({ t, op: 'delete' }); return q }
    return q
  }
  const db = { from: (t: string) => consulta(t) }
  const r = await correrOs(db, { agora: AGORA, quota: { capacidade: 200, usadosHoje: 10, limiteBatido24h: false } })
  teste('a passagem não chama delete em tabela nenhuma', !chamadas.some((c) => c.op === 'delete'), chamadas.filter((c) => c.op === 'delete'))
  teste('o agente sem valor depois de 2 retestes é arquivado com ficha', r.arquivados.includes('Velho') && chamadas.some((c) => c.t === 'agentes_arquivo' && (c.dados as { tipo?: string }).tipo === 'arquivo'))
  teste('a ficha do arquivo tem receita, clones, descendentes, melhor geração e ROI', chamadas.some((c) => c.t === 'agentes_arquivo' && ['receita_total', 'clones', 'descendentes', 'melhor_geracao', 'roi_medio'].every((k) => k in ((c.dados as { ficha?: object }).ficha ?? {}))))
  teste('arquivar não escreve na genealogia (fica como estava)', !chamadas.some((c) => c.t === 'agentes_genealogia' && c.op !== 'insert'))
  teste('o CEO, nas mesmas condições, NÃO é arquivado', !r.arquivados.includes('CEO') && !chamadas.some((c) => c.t === 'agentes_equipa' && c.op === 'update' && (c.dados as { ciclo?: string }).ciclo === 'ARCHIVED' && JSON.stringify(c).includes('"CEO"')))

  console.log(`\n${total - falhas}/${total} provas passaram.`)
  if (falhas) { console.log(`${falhas} FALHARAM`); process.exit(1) }
})()
