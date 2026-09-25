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
export async function comTecto<T>(promessa: Promise<T>, aoEsgotar: T, ms: number): Promise<T> {
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
