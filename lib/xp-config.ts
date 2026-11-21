/** Tipos de acção gamificada MTM — valores por omissão se xp_config não existir na DB. */
export const XP_ACTION_DEFAULTS: Record<
  string,
  { amount: number; dailyCap?: number; cooldownMinutes?: number; label: string }
> = {
  onboarding_step_completed: { amount: 50, label: 'Passo Fast Start concluído' },
  fast_start_completed: { amount: 200, label: 'Fast Start 100% completo' },
  chat_message_sent: { amount: 5, dailyCap: 25, label: 'Mensagem no chat' },
  live_chat_message: { amount: 8, dailyCap: 20, label: 'Mensagem na live' },
  live_session_watch: { amount: 15, cooldownMinutes: 15, label: 'Assistir live' },
  social_create_post: { amount: 15, dailyCap: 10, label: 'Publicar no feed' },
  social_like_post: { amount: 3, dailyCap: 30, label: 'Like no feed' },
  social_create_comment: { amount: 8, dailyCap: 20, label: 'Comentário no feed' },
  login_daily: { amount: 10, dailyCap: 1, label: 'Login diário' },
  missao_concluida: { amount: 20, label: 'Missão do dia' },
  missao_dia_completo: { amount: 10, dailyCap: 1, label: 'Dia completo' },
  // App do Ricardo, fase 3 (os tectos repetem-se aqui como segunda trava no servidor)
  app_curiosidade: { amount: 5, dailyCap: 1, label: 'Curiosidade do dia' },
  app_quiz: { amount: 15, dailyCap: 1, label: 'Quiz do dia' },
  app_presenca: { amount: 20, dailyCap: 2, label: 'Presença numa aula' },
  app_habito: { amount: 3, dailyCap: 6, label: 'Hábito cumprido' },
  app_rota_ponto: { amount: 15, dailyCap: 3, label: 'Ponto da rota' },
  app_saude: { amount: 10, dailyCap: 1, label: 'Movimento do dia' },
  app_desafio: { amount: 50, label: 'Desafio do Ricardo' },
  app_story: { amount: 5, dailyCap: 1, label: 'Story na app' },
  app_chat: { amount: 2, dailyCap: 5, label: 'Mensagem na comunidade' },
  app_diario: { amount: 3, dailyCap: 1, label: 'Página do diário' },
  app_desafio_membro_dia: { amount: 5, dailyCap: 3, label: 'Dia de desafio da comunidade' },
  app_desafio_membro_fim: { amount: 20, dailyCap: 2, label: 'Desafio da comunidade concluído' },
  app_rpg_cena: { amount: 5, dailyCap: 4, label: 'Cena do RPG' },
  app_rpg_capitulo: { amount: 40, dailyCap: 1, label: 'Capítulo do RPG' },
  app_rpg_boss: { amount: 60, dailyCap: 1, label: 'Confronto do RPG vencido' },
  app_escape: { amount: 60, dailyCap: 2, label: 'Escape room' },
  app_rpg_mesa: { amount: 10, dailyCap: 2, label: 'Mesa de RPG' },
}

/**
 * Patentes: o único sistema de progressão da MTM (app-mobile, site e app do Ricardo).
 * Substituem os antigos níveis de 1000 XP. `current_level` em user_xp = índice da patente + 1
 * (a função SQL mtm_patente_nivel faz o mesmo cálculo).
 */
export const PATENTES = [
  { nome: 'Recruta', xp: 0 }, { nome: 'Cadete', xp: 150 }, { nome: 'Soldado', xp: 400 }, { nome: 'Cabo', xp: 800 },
  { nome: 'Furriel', xp: 1400 }, { nome: 'Sargento', xp: 2200 }, { nome: 'Alferes', xp: 3300 }, { nome: 'Tenente', xp: 4700 },
  { nome: 'Capitão', xp: 6500 }, { nome: 'Major', xp: 8800 }, { nome: 'Coronel', xp: 11500 }, { nome: 'General', xp: 15000 },
]

/** Índice da patente (0 = Recruta). */
export function patenteDe(totalXp: number): number {
  let i = 0
  PATENTES.forEach((p, k) => { if (totalXp >= p.xp) i = k })
  return i
}

/** Nível guardado em user_xp.current_level (1 a 12). */
export function levelFromXp(totalXp: number): number {
  return patenteDe(totalXp) + 1
}

export function nomePatente(level: number): string {
  return PATENTES[Math.max(0, Math.min(PATENTES.length - 1, (level || 1) - 1))].nome
}

/** Progresso dentro da patente actual: XP feito, XP que falta, percentagem e nome da próxima. */
export function progressoPatente(totalXp: number) {
  const i = patenteDe(totalXp), base = PATENTES[i].xp, prox = PATENTES[i + 1]
  if (!prox) return { feito: totalXp - base, falta: 0, pct: 100, proxima: null as string | null }
  const span = prox.xp - base
  return { feito: totalXp - base, falta: prox.xp - totalXp, pct: Math.round(((totalXp - base) / span) * 100), proxima: prox.nome }
}

/** Compatibilidade: XP já feito dentro da patente actual. */
export function xpProgressInLevel(totalXp: number): number {
  return progressoPatente(totalXp).feito
}
