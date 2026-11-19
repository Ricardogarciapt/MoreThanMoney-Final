/**
 * QUEM ESPERA PELA RESPOSTA? (19/11/2026)
 *
 * O Mentor ficou indisponível a 19/11 porque os crons de fundo (traduções automáticas ~750k
 * tokens/dia, legendas, agente cripto, teste de população) gastaram a quota grátis do Groq e do
 * Gemini antes de os clientes chegarem. A cura: separar FAIXAS.
 *
 *  · interativo — uma pessoa está no ecrã. Modelos grandes reservados, roda por todos os modelos e
 *    todas as chaves antes de desistir.
 *  · fundo      — crons e lotes. Só modelos pequenos/lite e fornecedores de quota larga primeiro;
 *    nunca toca nos modelos reservados ao interativo.
 *
 * Pura e sem dependências, para a guarda a provar.
 */
import type { PedidoIA } from './tipos'

/** Tarefas que correm sem ninguém à espera. Acrescentar aqui quando nasce um cron novo de IA. */
export const TAREFAS_DE_FUNDO =
  /^(i18n-auto|mentor-teste-populacao|lms-captions|agente-cripto-(contexto|trader)|carrossel-diario|reels-|social-radar|ig-curation|conteudo-magnetico|b2b-|youtube-|blog-|seo-|cron-|lote-)/i

export function prioridadeDe(p: Pick<PedidoIA, 'prioridade' | 'tarefa'>): 'interativo' | 'fundo' {
  if (p.prioridade) return p.prioridade
  return p.tarefa && TAREFAS_DE_FUNDO.test(p.tarefa) ? 'fundo' : 'interativo'
}

/**
 * Chaves de um fornecedor: `X_API_KEY` mais `X_API_KEYS` (separadas por vírgula). Várias chaves de
 * contas/organizações diferentes multiplicam a quota grátis; a rotação passa à seguinte quando
 * uma esgota. Nunca se registam nem se mostram — só o índice.
 */
export function chavesDe(prefixo: string, env: Record<string, string | undefined> = process.env): string[] {
  const todas = [env[`${prefixo}_API_KEY`], ...(env[`${prefixo}_API_KEYS`] ?? '').split(/[,\s]+/)]
    .map((k) => (k ?? '').trim())
    .filter(Boolean)
  return [...new Set(todas)]
}
