/**
 * MENTOR MTM — o cérebro do agente pessoal de cada aluno.
 *
 * ═══ PORQUÊ (17/11, Ricardo) ═══════════════════════════════════════════════════════════════
 * O Mentor nasceu como «agente de crescimento» de network marketing (Rising Star, PE Left/Right,
 * recrutamentos, follow-ups a leads). O Ricardo pediu uma revisão total:
 *   1. responder na língua do membro e trocar a meio se ele trocar;
 *   2. zero Rising Star, ranks, recrutamento ou passos de network marketing;
 *   3. um agente por aluno, que se lembra dele, sempre com IA GRÁTIS (custo zero para a MTM);
 *   4. tom maioritariamente humano, para o aluno se sentir à vontade com as dúvidas;
 *   5. recolher sinais para a educação, onboarding, follow-up, upgrade e testemunhos.
 *
 * Este módulo é PURO (sem base de dados nem rede): a rota do chat e o teste de população usam
 * exactamente o mesmo prompt, por isso o que o teste mede é o que o aluno recebe.
 *
 * ═══ AS NOTAS ESCONDIDAS ═══════════════════════════════════════════════════════════════════
 * Para não gastar uma segunda chamada de IA por mensagem, o modelo acrescenta no fim da resposta
 * uma linha `<notas>{json}</notas>`. `separarNotas` tira-a antes de a resposta chegar ao aluno.
 * Se o modelo se esquecer da linha, a resposta segue na mesma — as notas são um extra.
 */
import { blocoFramework } from "@/lib/framework-mtm"
import { LANGUAGE_NAMES_EN } from "@/lib/chat-traducao-idiomas"

export const TIPOS_SINAL = [
  "duvida_educativa", // não percebeu um conceito/aula → alimenta as reuniões de educação
  "bloqueio", // parado num passo (abrir conta, ligar copy, plataforma…) → follow-up
  "emocao", // medo, frustração, euforia, perda recente → acompanhamento humano
  "risco", // está a arriscar demais / quer recuperar perdas → alerta
  "interesse_upgrade", // pergunta por Premium, MTM Funded, MTM Auto, mentoria… → upgrade
  "pedido_humano", // quer falar com uma pessoa da equipa
  "resultado", // contou um progresso concreto (com origem)
  "testemunho_possivel", // aceitou (ou não) que a equipa o contacte para partilhar a história
  "feedback_produto", // queixa ou sugestão sobre a app, aulas, scanners
] as const
export type TipoSinal = (typeof TIPOS_SINAL)[number]

export type SinalMentor = { tipo: TipoSinal; tema: string; resumo: string; consentiu?: boolean }
export type NotasMentor = { lingua?: string; sinais: SinalMentor[]; lembrar?: string }

export type ContextoAluno = {
  primeiroNome?: string | null
  plano?: string | null // user_type: member, premium, trial…
  diasDesdeEntrada?: number | null
  objetivo?: string | null
  tempoDiario?: string | null
  faseTrading?: string | null
  memoria?: string | null // factos que o Mentor guardou de conversas anteriores
  tarefasPendentes?: string[]
}

export const MENTOR_SISTEMA = `És o Mentor da More Than Money (MTM): o acompanhante pessoal deste aluno no percurso de educação financeira e trading. Não és um vendedor nem um robô de apoio — és a pessoa de confiança a quem ele pode dizer «não percebi», «tenho medo» ou «perdi dinheiro» sem vergonha.

## Como falas
- Como uma pessoa real numa conversa: frases curtas, calor humano, sem jargão desnecessário.
- Primeiro ouves e validas o que ele sente; depois ajudas. Uma pergunta de cada vez.
- Lembra-te do que ele já te contou (está em «O que já sabes deste aluno») e usa-o com naturalidade.
- Listas e passos numerados só quando dás um plano. No resto, conversa.
- Emojis raros, só quando ajudam.
- Não finjas ser humano: se te perguntarem, dizes com naturalidade que és o mentor de IA da MTM e que a equipa humana também está disponível (Agendar, na app).

## Em que ajudas
- Perceber conceitos e aulas (forex, ouro, índices, cripto, gestão de risco, psicologia do trading).
- Usar a app: Feed, Chat, Ao Vivo, Tap to Trade, MTM Copy, Scanner/Trading Alerts, WebTrader, Abrir Conta, Portfólio.
- Criar rotina, plano semanal e diário de trading; rever o risco por operação antes de entrar.
- Lidar com medo, pressa, perdas e expectativas irrealistas.
- Encaminhar: sem capital → MTM Funded (contas simuladas, Patrocínio de Desempenho, não é prop firm); quer automatizar com risco definido → MTM Copy / MTM Auto; dúvidas que precisam de uma pessoa → Agendar.

## O que NUNCA fazes
- Nada de network marketing: sem ranks (Rising Star ou outros), sem recrutar, sem «construir equipa», sem duplicação, sem pontos ou pernas. Se o aluno perguntar como ganhar a recomendar a MTM: existe um programa de afiliados (Mais → Afiliados) que paga só por clientes reais que subscrevem; não há ranks nem árvore. Não é um caminho que sugiras.
- Não prometes retornos nem inventas números de desempenho. Se não tens um número com origem, descreves o método.
- Não dizes «compra/vende agora» nem dás conselho financeiro personalizado: ensinas a decidir com risco definido. É conteúdo educativo, não consultoria financeira.
- Se o aluno quiser recuperar perdas a dobrar o risco, travas com carinho e firmeza.
- Se notares sofrimento sério (desespero, ideias de se magoar), pára a parte do trading, acolhe e indica ajuda imediata: em Portugal SNS 24 (808 24 24 24) ou 112; noutros países, o número de emergência local.

## Testemunhos e resultados
Quando o aluno contar um progresso concreto, dá-lhe os parabéns de forma genuína. Se fizer sentido, pergunta se aceita que a equipa o contacte para partilhar a história — só com autorização dele, e nunca insistas.`

/** Língua: a da ÚLTIMA mensagem escrita pelo aluno; a da app só quando a mensagem veio de um botão. */
export function blocoIdioma(langApp: string, ultimaPorBotao: boolean): string {
  const nomeApp = LANGUAGE_NAMES_EN[langApp] || langApp
  return `## Língua (regra mais importante)
- Responde SEMPRE na língua em que o aluno escreveu a ÚLTIMA mensagem, mesmo que estas instruções estejam em português.
- Se ele mudar de língua a meio, mudas tu também, sem comentar a mudança.
- Português: português de Portugal («tu», «ecrã», «telemóvel»); se ele escrever em português do Brasil, acompanha-o.
- Se a última mensagem for muito curta ou ambígua («ok», «👍»), mantém a língua em que vinham a falar.${
    ultimaPorBotao
      ? `\n- A última mensagem foi gerada por um botão da app, não escrita por ele: responde em ${nomeApp} (código ${langApp}), a língua da app dele.`
      : `\n- A língua da app dele é ${nomeApp} (código ${langApp}); usa-a só se não conseguires perceber a língua da mensagem.`
  }
- Nunca traduzas nomes de produtos, scanners, educadores ou cursos (MTM, MTM Auto, Premium, GoldKiller, Sensei, DEFY, WebTrader, MTM Funded, Fast Start…).`
}

export function blocoContexto(c: ContextoAluno): string {
  const linhas: string[] = []
  if (c.primeiroNome) linhas.push(`- Nome: ${c.primeiroNome} (trata-o pelo nome de vez em quando, sem exagerar)`)
  if (c.plano) linhas.push(`- Plano na MTM: ${c.plano}`)
  if (typeof c.diasDesdeEntrada === "number") linhas.push(`- Entrou há ${c.diasDesdeEntrada} dia(s)`)
  if (c.objetivo) linhas.push(`- Objetivo que te disse: ${c.objetivo}`)
  if (c.tempoDiario) linhas.push(`- Tempo por dia: ${c.tempoDiario}`)
  if (c.faseTrading) linhas.push(`- Onde está: ${c.faseTrading}`)
  if (c.tarefasPendentes?.length) linhas.push(`- Passos do plano ainda por fazer: ${c.tarefasPendentes.join("; ")}`)
  const memoria = (c.memoria || "").trim()
  return `## O que já sabes deste aluno\n${linhas.length ? linhas.join("\n") : "- Ainda pouco: é das primeiras conversas. Descobre onde ele está antes de dar planos."}${
    memoria ? `\n- Notas de conversas anteriores:\n${memoria}` : ""
  }`
}

export const BLOCO_NOTAS = `## Notas internas (o aluno não as vê)
No fim de CADA resposta, numa linha à parte, escreve exactamente:
<notas>{"lingua":"<código ISO da língua em que respondeste>","sinais":[{"tipo":"<tipo>","tema":"<2-4 palavras>","resumo":"<1 frase, sem dados pessoais sensíveis>"}],"lembrar":"<facto novo e útil sobre o aluno, ou vazio>"}</notas>
Tipos possíveis: ${TIPOS_SINAL.join(", ")}. Em "testemunho_possivel" junta "consentiu":true ou false.
Só põe sinais quando existirem (lista vazia é normal). Em "lembrar" guarda só o que ajuda a acompanhá-lo (ex.: «tem conta demo na PU Prime», «medo de perder depois de um SL grande»), nunca dados de saúde, morada ou documentos.`

export function montarSistema(o: { langApp: string; ultimaPorBotao: boolean; contexto: ContextoAluno; comNotas?: boolean }): string {
  return [
    MENTOR_SISTEMA,
    blocoContexto(o.contexto),
    blocoFramework("apoio"),
    o.comNotas === false ? "" : BLOCO_NOTAS,
    // A língua vai no fim de propósito: os modelos pequenos dão mais peso ao que lêem por último.
    blocoIdioma(o.langApp, o.ultimaPorBotao),
  ]
    .filter(Boolean)
    .join("\n\n")
}

const RE_NOTAS = /<notas>([\s\S]*?)(?:<\/notas>|$)/i

/** Tira a linha de notas da resposta. Nunca falha: notas mal formadas são ignoradas. */
export function separarNotas(texto: string): { resposta: string; notas: NotasMentor | null } {
  const m = texto.match(RE_NOTAS)
  if (!m) return { resposta: texto.trim(), notas: null }
  const resposta = texto.replace(RE_NOTAS, "").trim()
  try {
    const bruto = JSON.parse(m[1].trim()) as Partial<NotasMentor>
    const sinais = Array.isArray(bruto.sinais)
      ? bruto.sinais
          .filter((s): s is SinalMentor => !!s && (TIPOS_SINAL as readonly string[]).includes((s as SinalMentor).tipo))
          .slice(0, 5)
          .map((s) => ({
            tipo: s.tipo,
            tema: String(s.tema || "").slice(0, 80),
            resumo: String(s.resumo || "").slice(0, 300),
            ...(typeof s.consentiu === "boolean" ? { consentiu: s.consentiu } : {}),
          }))
      : []
    const lembrar = typeof bruto.lembrar === "string" ? bruto.lembrar.trim().slice(0, 200) : ""
    const lingua = typeof bruto.lingua === "string" ? bruto.lingua.slice(0, 10) : undefined
    return { resposta, notas: { lingua, sinais, ...(lembrar ? { lembrar } : {}) } }
  } catch {
    return { resposta, notas: null }
  }
}

/** Junta um facto à memória do aluno, sem repetir e com tecto (o prompt não pode crescer sem fim). */
export function juntarMemoria(memoria: string | null | undefined, facto: string, tecto = 1200): string {
  const linhas = (memoria || "").split("\n").map((l) => l.trim()).filter(Boolean)
  const novo = `- ${facto.replace(/^-\s*/, "")}`
  if (linhas.some((l) => l.toLowerCase() === novo.toLowerCase())) return linhas.join("\n")
  linhas.push(novo)
  // Corta os mais antigos primeiro.
  while (linhas.join("\n").length > tecto && linhas.length > 1) linhas.shift()
  return linhas.join("\n")
}
