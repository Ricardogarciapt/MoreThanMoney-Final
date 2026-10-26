/**
 * RESPOSTA PRIVADA a um comentário do Instagram — a DM que a Meta deixa mandar a quem comentou.
 *
 * ═══ PORQUE É QUE ISTO É UM FICHEIRO ═══════════════════════════════════════════════════════
 *
 * Até 26/10 o funil e o setter chamavam `POST /{comment-id}/private_replies`. Esse endpoint é o
 * dos comentários de PÁGINAS DO FACEBOOK. Com um id de comentário do Instagram a Meta responde
 * «Object with ID … does not exist, cannot be loaded due to missing permissions» — e todas as DMs
 * ao comentador desde 13/10 caíram para resposta pública, com o token a ter
 * `instagram_manage_messages` o tempo todo. Parecia falta de permissão e era o endereço errado.
 *
 * O caminho do Instagram é a Messenger Platform: `POST /me/messages` com o token de Página e
 * `recipient: { comment_id }`. Uma só resposta por comentário, dentro de 7 dias.
 */
const GRAPH = "https://graph.facebook.com/v21.0"

export async function respostaPrivada(
  commentId: string,
  texto: string,
  token: string,
): Promise<{ ok: boolean; status: number; json: any }> {
  try {
    const r = await fetch(`${GRAPH}/me/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text: texto.slice(0, 990) },
        access_token: token,
      }),
    })
    const json = await r.json().catch(() => ({}))
    return { ok: r.ok && !json?.error, status: r.status, json }
  } catch (e) {
    return { ok: false, status: 0, json: { error: { message: e instanceof Error ? e.message : "erro" } } }
  }
}
