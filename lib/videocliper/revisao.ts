import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'
import type { Palavra } from './analise'

/**
 * REVISÃO DAS LEGENDAS — o Whisper ouve, a IA corrige (porta única `chamarIA`).
 *
 * A transcrição automática acerta no som e erra na escrita: concordâncias trocadas, palavras
 * parecidas («policiais» por «polícia»), termos de trading mal ouvidos («stop lós», «pipes»),
 * nomes próprios desfeitos. Numa legenda queimada no vídeo, cada erro fica lá para sempre e com
 * a marca em cima.
 *
 * ── porque é palavra a palavra ───────────────────────────────────────────────
 *
 * A legenda acende palavra a palavra, e cada palavra tem o SEU tempo. Pedir ao modelo o texto
 * corrigido «em prosa» obrigava a realinhar tudo depois — e um desalinhamento põe a palavra a
 * acender meio segundo antes de ser dita. Por isso vai a lista numerada e volta uma lista com o
 * MESMO número de posições: cada posição corrige a sua palavra e herda o tempo dela. Juntar duas
 * palavras numa posição e deixar a outra vazia é permitido; mudar o número de posições não.
 *
 * Se a resposta não bater certo (tamanho diferente, JSON partido), fica o original. Uma legenda
 * com um erro é melhor do que uma legenda desalinhada.
 */

const SISTEMA = `És revisor de legendas de vídeos curtos de uma escola de trading portuguesa
(More Than Money, @morethanmoney.pt; fundador Ricardo Garcia).

Recebes as palavras de uma transcrição automática, numeradas. Devolves APENAS um array JSON de
strings com EXACTAMENTE o mesmo número de posições, pela mesma ordem.

Em cada posição:
· corrige ortografia, acentos, concordância e palavras mal ouvidas, pelo sentido da frase;
· termos de trading escritos como se usam: stop loss, take profit, pips, lote, spread,
  breakeven, XAUUSD, ouro, Nasdaq, PU Prime, MetaTrader, Premium, Sensei, GoldKiller, MTM;
· se duas posições são uma palavra só partida em duas, põe a palavra inteira na primeira e ""
  na segunda;
· hesitações sem sentido («hã», «tipo tipo» repetido) podem ficar "";
· pontuação mínima colada à palavra (vírgula, ponto, interrogação) quando ajuda a ler.

NÃO traduzas: se a pessoa fala inglês, a legenda fica em inglês correcto. Se fala português,
português de Portugal quando for claramente o caso; não «abrasileires» nem «aportugueses» o que
a pessoa disse. NÃO acrescentes palavras que não foram ditas e NÃO resumas.`

export async function reverPalavras(palavras: Palavra[], contexto?: string): Promise<Palavra[]> {
  if (palavras.length === 0) return palavras

  const lista = palavras.map((p) => p.palavra)
  try {
    // `json: true`: o núcleo garante que vem JSON (um array serve) ou passa ao fornecedor seguinte.
    const r = await chamarIA({
      tarefa: 'videocliper-revisao',
      sistema: SISTEMA,
      mensagens: [{
        role: 'user',
        content:
          (contexto ? `Contexto do clipe: ${contexto}\n\n` : '') +
          `${lista.length} posições:\n${JSON.stringify(lista)}`,
      }],
      maxTokens: 8000,
      json: true,
      preferencia: 'qualidade',
      timeoutMs: 90_000,
    })
    const corrigidas = JSON.parse(r.texto) as unknown
    if (!Array.isArray(corrigidas) || corrigidas.length !== palavras.length) return palavras

    // Uma posição vazia sai da legenda; o tempo dela passa para a palavra anterior, para não
    // abrir um buraco em que nada está aceso.
    const saida: Palavra[] = []
    palavras.forEach((p, i) => {
      const texto = String(corrigidas[i] ?? '').trim()
      if (!texto) {
        if (saida.length) saida[saida.length - 1] = { ...saida[saida.length - 1], fim: p.fim }
        return
      }
      saida.push({ palavra: texto, inicio: p.inicio, fim: p.fim })
    })
    return saida.length ? saida : palavras
  } catch (e) {
    // Sem revisão fica o original: uma legenda com um erro é melhor do que nenhuma.
    console.warn('[videocliper-revisao]', mensagemIndisponivel(e))
    return palavras
  }
}
