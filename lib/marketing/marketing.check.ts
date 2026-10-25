/**
 * Guarda do módulo de Marketing:  npx tsx lib/marketing/marketing.check.ts
 *
 * Prova, sem rede: a peneira das regras, o catálogo do Estúdio (ids únicos, limites contados),
 * o router sem IA, a validação dos kits de lançamento e das campanhas Meta, e o HTML do Telegram.
 */
import { AVISO_EDUCATIVO, paraHtmlTelegram, peneira } from './regras'
import { GERADORES, GRUPOS_ESTUDIO, excessos, geradorPorId, normalizarVariacoes } from './geradores'
import { ESPECIALISTAS, escolherPorPalavras } from './especialistas'
import { funilDoKit, validarLancamento } from './rascunhos'
import { validarNovaCampanha, type NovaCampanhaMeta } from '../trafego/meta'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

// regras
teste('promessa apanhada', peneira('Lucro garantido todos os meses').length > 0)
teste('você apanhado', peneira('Você vai gostar').length > 0)
teste('trading sem aviso apanhado', peneira('Aprende trading de ouro').some((a) => a.includes('aviso')))
teste('trading com aviso passa', peneira(`Aprende trading de ouro. ${AVISO_EDUCATIVO}`).length === 0)
teste('texto limpo passa', peneira('Comenta LIBERDADE e envio-te o guia.').length === 0)
teste('html escapa', paraHtmlTelegram('<script> **forte**') === '&lt;script&gt; <b>forte</b>')

// estúdio
const ids = GERADORES.map((g) => g.id)
teste('ids do estúdio únicos', new Set(ids).size === ids.length)
teste('todos os grupos têm ferramentas', GRUPOS_ESTUDIO.every((gr) => GERADORES.some((g) => g.grupo === gr)))
teste('pelo menos 29 ferramentas', GERADORES.length >= 29)
const meta = geradorPorId('meta')!
const [v] = normalizarVariacoes(meta, { variacoes: [{ titulo: 'A', campos: { Título: 'x'.repeat(41), Gancho: 'curto' } }] })
teste('excesso de título contado', excessos(meta, v).some((e) => e.startsWith('Título')))
teste('gancho curto não é excesso', !excessos(meta, v).some((e) => e.startsWith('Gancho')))

// router
teste('anúncios → tráfego', escolherPorPalavras('o CPL das campanhas subiu') === 'trafego')
teste('funil → funis', escolherPorPalavras('audita o funil do bootcamp') === 'funis')
teste('reels → conteúdo', escolherPorPalavras('ideias de reels para a semana') === 'conteudo')
teste('sem palavras → estratega', escolherPorPalavras('ajuda-me') === 'estratega')
teste('especialistas únicos', new Set(ESPECIALISTAS.map((e) => e.id)).size === ESPECIALISTAS.length)

// kit de lançamento
const kitBom = {
  produto: 'Workshop de risco',
  palavraChave: 'risco!',
  respostaPublica: ['Enviei-te por mensagem 👀'],
  mensagemPrivada: 'Aqui tens: {link}',
  seguimento: [{ esperaMin: 1, texto: 'Viste?' }],
  formulario: { slug: 'Workshop Risco', titulo: 'Workshop', campos: [{ name: 'nome', label: 'Nome', type: 'text' }, { name: 'email', label: 'Email', type: 'email', required: true }] },
  destino: { etiquetas: ['workshop'] },
}
const k = validarLancamento(kitBom)
teste('kit válido aceite', k.ok)
if (k.ok) {
  teste('palavra limpa em maiúsculas', k.kit.palavraChave === 'RISCO')
  teste('slug normalizado', k.kit.formulario.slug === 'workshop-risco')
  teste('espera mínima 5 min', k.kit.seguimento[0].esperaMin === 5)
  teste('etiqueta do produto', k.kit.destino.etiquetas.includes('produto:workshop-risco'))
  const f = funilDoKit(k.kit, 'https://x')
  teste('funil ligado', f.nos.every((n) => n.seguintes.every((s) => f.nos.some((m) => m.id === s))))
}
const semEmail = validarLancamento({ ...kitBom, formulario: { ...kitBom.formulario, campos: [{ name: 'nome', label: 'Nome', type: 'text' }] } })
teste('kit sem email recusado', !semEmail.ok)
teste('kit vazio recusado', !validarLancamento({}).ok)

// campanha meta
const c: NovaCampanhaMeta = { conta: '123', nome: 'Teste', orcamentoDiario: 10, paises: ['PT'], texto: 'Olá', titulo: 'Título', descricao: '', link: 'https://www.morethanmoney.pt/agendar', cta: 'LEARN_MORE' }
teste('campanha boa passa', validarNovaCampanha(c, ['123']).length === 0)
teste('conta fora recusada', validarNovaCampanha(c, ['999']).length > 0)
teste('link externo recusado', validarNovaCampanha({ ...c, link: 'https://exemplo.com' }, ['123']).length > 0)
teste('orçamento alto recusado', validarNovaCampanha({ ...c, orcamentoDiario: 5000 }, ['123']).length > 0)

if (falhas.length) {
  console.error(`marketing: ${falhas.length} falha(s)\n- ${falhas.join('\n- ')}`)
  process.exit(1)
}
console.log('marketing: tudo certo')
