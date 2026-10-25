import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ferramentaPorNome, type Ferramenta } from '@/lib/mcp/ferramentas'
import { lerCampanhasMeta, validarNovaCampanha, contasConfiguradas, PERIODOS, type PeriodoMeta, type NovaCampanhaMeta } from '@/lib/trafego/meta'
import { diagnosticar } from '@/lib/trafego/diagnostico'
import { lerMarca } from './marca'
import { guardarRascunho, validarLancamento } from './rascunhos'

/**
 * AS FERRAMENTAS DOS ESPECIALISTAS DE MARKETING.
 *
 * As que já existem para o negócio (estado, pipeline, funis, automações, fila) vêm de
 * `lib/mcp/ferramentas` — não se reescrevem. Aqui ficam só as que faltavam ao marketing: ler a
 * Meta, contar leads por origem, ler a marca, e PROPOR (um kit de lançamento ou uma campanha).
 * Propor guarda um rascunho; aplicar é um botão do dono em Gestão → Marketing → Rascunhos.
 */

const objecto = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })

const PROPRIAS: Ferramenta[] = [
  {
    nome: 'campanhas_meta',
    descricao:
      'As campanhas da Meta (Facebook/Instagram Ads) no período: gasto, impressões, cliques, CTR, CPC, ' +
      'leads, frequência e orçamento, mais o diagnóstico automático (fadiga, CPL alto, sem entrega).',
    esquema: objecto({ periodo: { type: 'string', enum: PERIODOS, description: 'por omissão last_7d' } }),
    correr: async (a) => {
      const periodo = (PERIODOS as string[]).includes(String(a.periodo)) ? (a.periodo as PeriodoMeta) : 'last_7d'
      const l = await lerCampanhasMeta(periodo)
      if (!l.configurado) return { configurado: false, falta: l.falta }
      return { periodo, moeda: l.moeda, campanhas: l.campanhas, diagnostico: diagnosticar(l.campanhas), erros: l.erros }
    },
  },
  {
    nome: 'leads_por_origem',
    descricao:
      'De onde vêm os leads nos últimos N dias: comentários do Instagram por palavra-chave e intenção ' +
      '(ig_leads), submissões por formulário (form_submissions) e negócios por origem no pipeline.',
    esquema: objecto({ dias: { type: 'number', description: 'janela em dias (por omissão 30, máximo 180)' } }),
    correr: async (a) => {
      const dias = Math.min(Math.max(Number(a.dias) || 30, 1), 180)
      const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
      const db = getSupabaseAdmin()
      const [ig, forms, negocios] = await Promise.all([
        db.from('ig_leads').select('keyword, intent').gte('created_at', desde).limit(5000),
        db.from('form_submissions').select('form_slug, status').gte('created_at', desde).limit(5000),
        db.from('vendas_negocios').select('origem, estado').gte('criado_em', desde).limit(5000),
      ])
      const conta = <T,>(linhas: T[] | null, k: (x: T) => string | null | undefined) =>
        Object.entries((linhas ?? []).reduce<Record<string, number>>((m, x) => { const c = k(x) || '(sem)'; m[c] = (m[c] ?? 0) + 1; return m }, {})).sort((x, y) => y[1] - x[1]).slice(0, 15)
      return {
        dias,
        instagram: { total: ig.data?.length ?? 0, porPalavra: conta(ig.data, (x) => x.keyword), porIntencao: conta(ig.data, (x) => x.intent), erro: ig.error?.message },
        formularios: { total: forms.data?.length ?? 0, porFormulario: conta(forms.data, (x) => x.form_slug), erro: forms.error?.message },
        pipeline: { total: negocios.data?.length ?? 0, porOrigem: conta(negocios.data, (x) => x.origem), ganhos: negocios.data?.filter((n) => n.estado === 'ganho').length ?? 0, erro: negocios.error?.message },
      }
    },
  },
  {
    nome: 'marca_da_casa',
    descricao: 'A marca da casa: público, dores, promessa, tom, provas com origem, produtos e preços, concorrentes e o que evitar.',
    esquema: objecto({}),
    correr: async () => await lerMarca(),
  },
  {
    nome: 'propor_lancamento',
    descricao:
      'Deixa um KIT DE LANÇAMENTO de um produto novo como rascunho para o dono aplicar: palavra-chave do ' +
      'Instagram, resposta pública, mensagem privada (usa {link} onde vai o formulário), seguimento, ' +
      'formulário de captação (com campo de email) e o funil. Nada fica ligado: aplicar cria a automação desligada.',
    esquema: objecto(
      {
        produto: { type: 'string' },
        palavraChave: { type: 'string', description: 'uma palavra em maiúsculas, 3+ letras, que ainda não seja do funil' },
        respostaPublica: { type: 'array', items: { type: 'string' }, description: '2-3 respostas curtas ao comentário' },
        mensagemPrivada: { type: 'string' },
        seguimento: { type: 'array', items: { type: 'object', properties: { esperaMin: { type: 'number' }, texto: { type: 'string' } } } },
        formulario: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            titulo: { type: 'string' },
            subtitulo: { type: 'string' },
            campos: { type: 'array', items: { type: 'object', properties: { name: { type: 'string', description: 'chave sem espaços, ex. email' }, label: { type: 'string' }, type: { type: 'string', enum: ['text', 'email', 'textarea', 'select', 'chips', 'checkbox'] }, required: { type: 'boolean' }, options: { type: 'array', items: { type: 'string' } } } } },
          },
        },
        destino: { type: 'object', properties: { etiquetas: { type: 'array', items: { type: 'string' } }, interesse: { type: 'string' }, avisarTelegram: { type: 'boolean' } } },
        funil: { type: 'object', properties: { nome: { type: 'string' }, descricao: { type: 'string' } } },
      },
      ['produto', 'palavraChave', 'respostaPublica', 'mensagemPrivada', 'formulario'],
    ),
    correr: async (a) => {
      const v = validarLancamento(a)
      if (!v.ok) return { ok: false, corrige: v.erros }
      const id = await guardarRascunho('lancamento', `Lançamento · ${v.kit.produto}`, v.kit, 'assistente')
      return { ok: true, rascunho: id, avisos: v.avisos, falta: 'O dono aplica em Gestão → Marketing → Rascunhos.' }
    },
  },
  {
    nome: 'propor_campanha_meta',
    descricao:
      'Deixa uma campanha Meta como rascunho (objectivo leads, categoria especial financeira, 18-65 anos). ' +
      'Aplicar cria campanha, conjunto, criativo e anúncio TODOS EM PAUSA. O link tem de ser do morethanmoney.pt.',
    esquema: objecto(
      {
        conta: { type: 'string', description: `id da conta de anúncios (configuradas: ${contasConfiguradas().join(', ') || 'nenhuma'})` },
        nome: { type: 'string' },
        orcamentoDiario: { type: 'number', description: 'euros por dia (1-500)' },
        paises: { type: 'array', items: { type: 'string' }, description: 'códigos de 2 letras, ex. PT, BR' },
        texto: { type: 'string' },
        titulo: { type: 'string' },
        descricao: { type: 'string' },
        link: { type: 'string' },
        cta: { type: 'string', enum: ['LEARN_MORE', 'SIGN_UP', 'BOOK_TRAVEL', 'CONTACT_US', 'SUBSCRIBE', 'APPLY_NOW', 'GET_QUOTE'] },
      },
      ['nome', 'orcamentoDiario', 'paises', 'texto', 'titulo', 'link', 'cta'],
    ),
    correr: async (a) => {
      const c = { ...a, conta: String(a.conta || contasConfiguradas()[0] || '') } as unknown as NovaCampanhaMeta
      const erros = validarNovaCampanha(c)
      if (erros.length) return { ok: false, corrige: erros }
      const id = await guardarRascunho('campanha_meta', `Meta · ${c.nome}`, c, 'assistente')
      return { ok: true, rascunho: id, falta: 'O dono aplica em Gestão → Marketing → Rascunhos (nasce em pausa).' }
    },
  },
]

export function ferramentaMarketing(nome: string): Ferramenta | undefined {
  return PROPRIAS.find((f) => f.nome === nome) ?? ferramentaPorNome(nome)
}

export function ferramentasDe(nomes: string[]): Ferramenta[] {
  return nomes.map(ferramentaMarketing).filter((f): f is Ferramenta => !!f)
}
