/**
 * UM TECTO DE TEMPO PARA ESPERAS QUE NÃO PODEM DERRUBAR O QUE ESTÁ À VOLTA.
 *
 * PORQUÊ ISTO EXISTE
 * 25/09: o site devolveu 504 e a compilação chegou a falhar, ambas pela mesma razão. O Supabase
 * respondeu em 33s ao auth e em 126s ao PostgREST — e quem esperava por ele não tinha limite
 * nenhum. O middleware esgotava os 25s da Vercel e devolvia 504 em páginas públicas; a geração
 * estática de `/new-landing` esgotava os 60s do Next e o deploy inteiro abortava, por causa de um
 * pop-up de campanha.
 *
 * A lição, escrita para não se repetir: uma leitura acessória nunca pode ter poder de veto sobre a
 * coisa principal. Um splash de campanha não pode impedir um deploy; uma restrição de áreas que
 * ninguém tem não pode impedir alguém de abrir a sua área de membro.
 *
 * COMO SE USA
 * O `aoEsgotar` não é um detalhe: é a resposta que fica a valer quando não houve resposta. Escolhe
 * sempre o valor que já era o comportamento seguro dessa leitura — lista vazia, `null`, o recuo do
 * `catch` que já existia. Se o valor de recuo for perigoso, o problema não é o tecto: é a leitura
 * estar no caminho crítico de algo que não devia depender dela.
 *
 * NÃO cancela o trabalho que está por baixo — nada em HTTP se desfaz por deixarmos de esperar. Só
 * deixa de se esperar.
 */
// `PromiseLike` e não `Promise`: os construtores de consulta do Supabase são «thenables» — têm
// `.then` e comportam-se como promessas, mas não são instâncias de Promise. Exigir `Promise` aqui
// obrigava quem chama a fazer um `as unknown as Promise<...>`, e essa conversão apaga os tipos
// reais da consulta — que é exactamente onde os enganos passam despercebidos.
export async function comTecto<T>(promessa: PromiseLike<T>, aoEsgotar: T, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promessa,
      new Promise<T>((resolve) => {
        temporizador = setTimeout(() => resolve(aoEsgotar), ms)
      }),
    ])
  } finally {
    if (temporizador) clearTimeout(temporizador)
  }
}

/** O tecto para leituras acessórias durante a construção de uma página. */
export const TECTO_PAGINA_MS = 5_000

/** O tecto dentro do middleware. Curto: o que está em jogo é a primeira resposta ao browser. */
export const TECTO_MIDDLEWARE_MS = 2_500

/**
 * ESTAMOS DENTRO DE UM `next build`?
 *
 * Porque isto foi preciso, escrito para não se repetir: um tecto de tempo NÃO chega para proteger
 * a compilação. O `comTecto` devolve o recuo aos 5s, mas o pedido à base continua no ar — e o Next
 * não dá uma página por terminada enquanto houver um `fetch` dela pendente (ele intercepta o fetch
 * para a cache do ISR). A página ficava «a gerar» até aos 60s do Next, três vezes, e o deploy do
 * site inteiro abortava. Foi isso que aconteceu a 25/09, duas vezes seguidas, e que impediu a
 * correcção do 504 de chegar a produção enquanto membros com conta eram mandados registar-se.
 *
 * A regra que fica: uma compilação não pergunta nada à base de dados. Constrói-se com os valores
 * de recuo, e o conteúdo real entra na primeira revalidação — que com `revalidate = 60` é um
 * minuto depois. Publicar o site nunca mais depende de a base estar boa.
 */
export function ehCompilacao(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}
