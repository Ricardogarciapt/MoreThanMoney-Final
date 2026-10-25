/**
 * AS REGRAS DA CASA PARA TUDO O QUE O MARKETING ESCREVE — um sítio só.
 *
 * O estúdio de anúncios, os especialistas do assistente e o revisor leem daqui. Se cada um tivesse
 * a sua cópia, bastava uma divergir para um anúncio sair com «lucro garantido» — que é a frase que
 * a CMVM e a Meta apanham primeiro.
 */

/** As palavras que o funil nativo do Instagram apanha nos comentários (ver lib/instagram/**). */
export const PALAVRAS_FUNIL = ['SCANNER', 'SISTEMA', 'BOOTCAMP', 'RESULTADOS', 'LIBERDADE'] as const

export const AVISO_EDUCATIVO = 'Conteúdo educativo, não constitui consultoria financeira.'

export const REGRAS_CASA = `Regras que não se quebram:
- Português de Portugal, tratar por "tu". Nunca "você". "Ecrã", "telemóvel", "óptimo".
- NUNCA inventes números de desempenho, ganhos, percentagens, taxas de acerto, número de alunos ou testemunhos. Se precisares de um número e não o tens nos dados, escreve [NÚMERO REAL] para o dono preencher.
- NUNCA prometas ou sugiras resultados garantidos ou dinheiro fácil ("fica rico", "lucro garantido", "sem risco").
- Trading tem risco: quando falas de trading ou de resultados, inclui "${AVISO_EDUCATIVO}"
- Nunca cites Jifu, Golden Era, Trendwave nem KillShot. Não nomeies a plataforma onde vivem os cursos.
- Tom: autêntico, próximo, inspirador, sem exageros. Emojis moderados. Linguagem pouco técnica.
- O CTA leva ao funil: comentar uma palavra-chave (${PALAVRAS_FUNIL.join(', ')}), marcar em morethanmoney.pt/agendar, ou WhatsApp.`

/**
 * O que o revisor procura antes de algo sair — a versão curta e verificável das regras, para a
 * guarda (`marketing.check.ts`) apanhar o óbvio sem precisar de IA.
 */
const PROIBIDAS: Array<[RegExp, string]> = [
  [/lucro\s+garantid|ganhos?\s+garantid|resultados?\s+garantid|garantimos/i, 'promete resultados garantidos'],
  [/sem\s+risco|risco\s+zero/i, 'diz que não há risco'],
  [/fica(r)?\s+rico|dinheiro\s+f[aá]cil|enriquece(r)?\s+r[aá]pido/i, 'promete dinheiro fácil'],
  [/(^|[^\p{L}])voc[eê](?![\p{L}])/iu, 'usa «você» em vez de «tu»'],
  [/\b(jifu|golden\s*era|trendwave|killshot)\b/i, 'cita uma marca proibida'],
  [/\bskool\b/i, 'nomeia a plataforma dos cursos'],
  [/\b(celular|tela)\b/i, 'usa vocabulário do Brasil (celular/tela)'],
]

/** Problemas que se apanham sem IA. Lista vazia = passou na primeira peneira (não quer dizer que está bom). */
export function peneira(texto: string): string[] {
  const achados = PROIBIDAS.filter(([rx]) => rx.test(texto)).map(([, motivo]) => motivo)
  const falaDeTrading = /\b(trading|trade|pips?|forex|ouro|xau|sinais?|scanner|corretora)\b/i.test(texto)
  if (falaDeTrading && !texto.includes('não constitui consultoria')) achados.push('fala de trading sem o aviso educativo')
  // Percentagens e valores em euros/dólares soltos são o sinal mais comum de número inventado.
  if (/\b\d{1,3}\s?%/.test(texto) && !/\[N[ÚU]MERO REAL\]/.test(texto)) achados.push('tem uma percentagem — confirma que é real e tem origem')
  return achados
}

/**
 * Markdown simples → HTML do Telegram (parse_mode HTML): escapa tudo e só devolve negrito,
 * itálico e código. Tabelas e cabeçalhos ficam como texto — o Telegram não os tem.
 */
export function paraHtmlTelegram(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
}
