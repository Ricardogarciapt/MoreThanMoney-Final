/**
 * Todos os textos PT do /solucoes que precisam de tradução: os dos ficheiros de conteúdo (lidos
 * campo a campo) e os t("…")/tf("…") escritos nos componentes e nas páginas. Usado pela guarda e
 * pelo script que lista o que falta traduzir (npx tsx lib/site-solucoes/i18n/falta.ts).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { CASOS, DEMOS, FAQ, MENU, PERFIS, PROXIMOS } from '../conteudo'
import { AREAS, CASO_MTM, SECTORES, TAREFAS } from '../automacao'
import { DEMOS_DIARIAS } from '../demos-diarias'
import { EQUIPAS } from '../analise'
import { sectorGenerico } from '../sector-livre'

/** Campos que não são texto para ler: identificadores, ligações e datas. */
const NAO_TEXTO = new Set(['id', 'img', 'url', 'slug', 'data', 'segmentos', 'quem', 'area'])

/** Textos que o código escolhe em tempo real (não aparecem como t("…") literal). */
export const TEXTOS_SOLTOS = [
  'Manhã', 'Tarde', 'Folga',
  'Cliente', 'Agente MTM', 'Sistema', 'Tu',
  'Marcação confirmada', 'Lembrete agendado para amanhã', 'Orçamento enviado', 'PDF gerado a partir do pedido', 'Fatura paga', 'Arrumada na pasta do mês',
  'Presença', 'Atendimento e vendas', 'Operação', 'Conteúdo', 'Trading',
  // Erros do servidor, traduzidos no browser.
  'Diz-nos o teu nome.', 'Precisamos de um email válido para te enviar a análise.', 'Deixa o teu telemóvel para te ligarmos com a análise.',
  'Como se chama o negócio?', 'Indica o site ou o Instagram do negócio.', 'Escolhe o tamanho da equipa.',
  'Conta-nos em duas frases o que mais te rouba tempo.', 'Precisamos da tua autorização para te responder.',
  'Pedido inválido.', 'Já recebemos os teus pedidos. Respondemos em breve.', 'Não foi possível guardar o pedido. Tenta outra vez.',
]

function recolher(v: unknown, chave: string, out: Set<string>) {
  if (NAO_TEXTO.has(chave)) return
  if (typeof v === 'string') {
    if (/[A-Za-zÀ-ú]/.test(v)) out.add(v)
  } else if (Array.isArray(v)) v.forEach((x) => recolher(x, '', out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) recolher(x, k, out)
}

const FICHEIROS = [
  'app/solucoes/page.tsx',
  'app/solucoes/demos/page.tsx',
  'app/solucoes/demos/[slug]/page.tsx',
  'components/solucoes/simulador.tsx',
  'components/solucoes/hero-ao-vivo.tsx',
  'components/solucoes/areas-interativas.tsx',
  'components/solucoes/casos-ciclo.tsx',
  'components/solucoes/menu-trabalhos.tsx',
  'components/solucoes/video-apresentacao.tsx',
  'components/solucoes/demo-roteiro.tsx',
  'components/solucoes/pedir-analise.tsx',
  'lib/site-solucoes/analise.ts',
]

export function textosDoCodigo(raiz = process.cwd()): string[] {
  const out = new Set<string>()
  for (const f of FICHEIROS) {
    const src = readFileSync(join(raiz, f), 'utf8')
    for (const m of src.matchAll(/\bt[f]?\(\s*(["'])((?:(?!\1)[^\\]|\\.)+)\1/g)) out.add(m[2].replace(/\\(["'])/g, '$1'))
  }
  return [...out]
}

export function textosParaTraduzir(raiz = process.cwd()): string[] {
  const out = new Set<string>()
  recolher({ PERFIS, DEMOS, CASOS: CASOS.filter((c) => c.autorizado), FAQ, PROXIMOS, MENU, AREAS, TAREFAS, SECTORES, CASO_MTM, DEMOS_DIARIAS, EQUIPAS, g: sectorGenerico('') }, '', out)
  for (const x of TEXTOS_SOLTOS) out.add(x)
  for (const x of textosDoCodigo(raiz)) out.add(x)
  return [...out].sort()
}
