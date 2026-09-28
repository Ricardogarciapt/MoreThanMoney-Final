/**
 * Os testemunhos que se publicam — e o único sítio onde vivem.
 *
 * Estavam em dois sítios: aqui, escritos à mão, e em `lib/testimonials-service`, que era uma lista
 * de arranque com nomes e números inventados. O estúdio de conteúdo lia a SEGUNDA e chamava-lhe
 * "testemunhos REAIS de clientes" — ou seja, a salvaguarda de nunca inventar um testemunho estava
 * montada em cima de testemunhos inventados. Agora há uma lista só, e é esta.
 *
 * Os `chat: true` são verbatim do chat da comunidade (chat_messages): não se traduzem, não se
 * reescrevem, e a data fica à vista. Cortar é permitido; melhorar não — as palavras são de quem as
 * escreveu.
 */
export interface Testemunho {
  /** Nome de quem escreveu. */
  n: string
  /** Onde e quando — "Chat da app · 15 ago 2026" ou a localidade. */
  l: string
  /** O que a pessoa escreveu. */
  q: string
  /** Resultado declarado pela própria pessoa, quando o declarou. */
  p?: string
  t?: string
  /** Verbatim do chat da comunidade. */
  chat?: boolean
}

export const TESTEMUNHOS: Testemunho[] = [
  { n: "Rúben Daniel Sousa", l: "Chat da app · 15 ago 2026", chat: true, q: "Quero aqui agradecer à MTM, ao Ricardo Garcia pela ajuda, o profissionalismo, a empresa que criou. Tem sido fantástico estar aqui, tenho tido ótimos resultados com o sistema automático de trading. Finalmente encontrei a melhor plataforma, ecossistema, empresa como queiram chamar, de educação financeira que alguma vez estive." },
  { n: "Aanssi Kushwah", l: "Chat da app · 10 ago 2026", chat: true, q: "Alguém aqui está a usar o Sensei Scanner? Experimentem no gráfico do ouro, nos 15 minutos. Os resultados têm sido tremendos. Usem uma vez e vejam a magia." },
  { n: "Rúben Daniel Sousa", l: "Chat da app · 10 jul 2026", chat: true, q: "Dia feito em trading graças à MTM e ao grande Ricardo Garcia." },
  { n: "Tiago Pedrosa", l: "Chat da app · 3 jul 2026", chat: true, q: "Máquinas! Vocês dão um up tão grande e uma força para que isto aconteça. Obrigado 🙏" },
  { n: "Rúben Daniel Sousa", l: "Chat da app · 3 jul 2026", chat: true, q: "Grato por estar na melhor comunidade, ecossistema de educação financeira do país." },
  { n: "Rui Rodrigues", l: "Chat da app · 3 jul 2026", chat: true, q: "Boas tardes, máquinas. Dá gosto ver-vos a trabalhar e a ter resultados." },
  { n: "Rúben Daniel Sousa", l: "Chat da app · 26 jun 2026", chat: true, q: "Correu bem. Consegui fazer boas trades, lucrar algum. Umas perdas mas infelizmente faz parte." },
  { n: "Tiago Pedrosa", l: "Chat da app · 24 jun 2026", chat: true, q: "Bom dia equipa! Só para registar o momento: fiz a primeira compra na app!" },
  { n: "Rafael Bastos", l: "Leiria, Portugal", q: "Rising Star foi uma conquista 100%! Com dedicação ao máximo consegui resultados incríveis usando os scanners MTM." },
  { n: "Liliana Faria", l: "Alpiarça, Portugal", q: "A tua fundação para director foi criada! Estás a um passo de distância! Trabalhar contigo tem sido uma inspiração diária." },
  { n: "Gonçalo & Vânia", l: "Braga, Portugal", q: "Mais uma recompensa pelo bom trabalho para este casal incrível da minha equipa. Parabéns, feliz por vocês!" },
  { n: "André Dias", l: "Suíça", q: "Muito obrigado pelo vosso apoio, maltinha. Não me deixaram desistir nos momentos mais difíceis." },
  { n: "Sandra Oliveira", l: "Leiria, Portugal", q: "Depois de 2 anos a usar os scanners MTM, consegui resultados consistentes e uma nova perspectiva sobre investimentos. A comunidade é incrível!" },
  { n: "Rui & Carla", l: "Coimbra, Portugal", q: "Estes meses têm sido intensos, loucos, mas muito prazerosos. Ser ensinável e grato por tudo predomina nos nossos dias." },
]
