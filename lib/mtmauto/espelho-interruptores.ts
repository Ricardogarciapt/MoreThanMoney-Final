/**
 * O ESPELHO dos interruptores: rota do admin ↔ estratégia da app MTM Auto.
 *
 * Uma estratégia tem dois interruptores em sítios diferentes. No admin, a rota
 * (`provider_routes[].enabled`) manda na cópia CopyFactory. Na app MTM Auto, `ativo` manda no
 * que os subscritores vêem e copiam. São a mesma decisão — «esta estratégia está a correr?» —
 * guardada em duas tabelas, e quando divergem o admin diz uma coisa e a app faz outra.
 *
 * A rota MANDA. O `ativo` é o reflexo dela, não uma opinião independente: quem pausa, pausa no
 * admin, e é de lá que o valor desce.
 *
 * Este mapa vive aqui, e não dentro da rota que o escreve, porque há dois leitores. A rota
 * escreve o espelho quando o admin mexe no interruptor; a reconciliação verifica se ele ficou
 * mesmo escrito. Com o mapa dentro da rota, só quem escrevia sabia o que devia estar escrito —
 * e foi assim que a Aurum Flow e a GoldKiller passaram a 2026-09-11 com a cópia
 * ligada no admin e a estratégia apagada na app, sem ninguém reparar.
 *
 * Uma rota SEM entrada aqui não tem espelho — e isso é uma resposta válida, não um esquecimento:
 * há rotas legacy que sobrevivem só para não partir ligações antigas e não têm estratégia viva
 * do outro lado.
 */
export const ROTA_PARA_SLUGS_MTMAUTO: Record<string, string[]> = {
  'canonical-premium-signals': ['premium-ouro'],
  'canonical-sensei': ['sensei'],
  // Slug renomeado para `aurum-flow` a 2026-09-14 (migração 067). Alias do slug antigo da Aurum Flow — remover depois de 2026-10-14 (30 dias após 2026-09-14).
  'canonical-aurum-flow': ['aurum-flow', 'golden-moves'],
  // As que ganharam conta mestre e estratégia CopyFactory próprias (2026-09-11).
  'canonical-goldkiller': ['Goldkiller'],
  'canonical-mtm-scanner': ['mtm-scanner'],
}
