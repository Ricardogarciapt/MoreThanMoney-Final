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
 * e foi assim que a Aurum Flow, a GoldKiller e a Gold Did passaram a 2026-09-11 com a cópia
 * ligada no admin e a estratégia apagada na app, sem ninguém reparar.
 *
 * Uma rota SEM entrada aqui não tem espelho — e isso é uma resposta válida, não um esquecimento:
 * há rotas legacy que sobrevivem só para não partir ligações antigas e não têm estratégia viva
 * do outro lado.
 */
export const ROTA_PARA_SLUGS_MTMAUTO: Record<string, string[]> = {
  'canonical-premium-signals': ['premium-ouro'],
  'canonical-sensei': ['sensei'],
  // ⚠️ O slug 'golden-moves' é o nome ANTIGO da Aurum Flow (herança), não uma estratégia própria.
  'canonical-aurum-flow': ['golden-moves'],
  'canonical-golden-astro': ['mtm-auto-golden-astro'],
  // As que ganharam conta mestre e estratégia CopyFactory próprias (2026-09-11). O Gold Did
  // saiu de baixo do Premium: partilhavam interruptor e pausar um parava os dois.
  'canonical-goldkiller': ['Goldkiller'],
  'canonical-gold-did': ['gold-did-premium'],
  'canonical-mtm-scanner': ['mtm-scanner'],
  // A `canonical-golden-moves` NÃO está aqui de propósito. «Golden Moves» é o nome antigo da
  // Aurum Flow (renomeada a 2026-08-27) e o canal-fonte separado foi removido a 2026-09-09: a
  // rota sobrevive só para não partir ligações antigas de clientes. Apontá-la a um slug próprio
  // criava uma segunda estratégia para a mesma fonte — e quem mexesse no interruptor da Aurum
  // via metade do efeito. Quem manda na Aurum é a `canonical-aurum-flow`.
}
