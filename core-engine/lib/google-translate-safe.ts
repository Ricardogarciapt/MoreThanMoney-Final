/**
 * Guarda de DOM para o Google Translate em React (Safari/WKWebView incluído).
 *
 * O widget do Google Translate substitui text nodes diretamente no DOM. Quando o
 * React faz reconciliação a seguir, tenta `removeChild`/`insertBefore` em nós que o
 * Translate já moveu/substituiu → "NotFoundError: Failed to execute 'removeChild'"
 * e a app crasha (era por isso que estava desativado em Safari).
 *
 * Este patch (idempotente) torna esses dois métodos tolerantes: se o nó já não
 * pertence ao pai esperado, faz no-op em vez de atirar. É o fix padrão e estável
 * para coexistência React + Google Translate.
 */

let installed = false

export function installGoogleTranslateDomGuard(): void {
  if (installed) return
  if (typeof Node === 'undefined' || !Node.prototype) return
  installed = true

  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // Nó já removido/movido pelo Google Translate — devolve sem atirar.
      return child
    }
    // eslint-disable-next-line prefer-rest-params
    return originalRemoveChild.apply(this, arguments as unknown as [T]) as T
  }

  const originalInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // Referência já não pertence a este pai — anexa no fim em vez de atirar.
      // eslint-disable-next-line prefer-rest-params
      return originalInsertBefore.apply(this, [newNode, null] as unknown as [T, Node | null]) as T
    }
    // eslint-disable-next-line prefer-rest-params
    return originalInsertBefore.apply(this, arguments as unknown as [T, Node | null]) as T
  }
}
