/**
 * LIMITES DE CONCORRÊNCIA DO MOTOR — pequenos e testáveis.
 *
 *  · Por SERVIDOR da corretora: no máximo 1 operação em curso por cada 5 contas desse servidor
 *    (limite de sincronização da MetaApi — uma rajada de 40 ordens no mesmo servidor fazia 40
 *    sincronizações de conta ao mesmo tempo e o servidor estrangula a chave inteira).
 *  · Por CONTA: uma ordem de cada vez (nunca duas escritas concorrentes na mesma conta — o volume
 *    aberto que um parcial lê tem de ser o que lá está).
 *
 * Uma fila FIFO por chave; `correr` devolve o resultado da função. Sem temporizadores: quem liberta
 * acorda o seguinte.
 */

/** Capacidade de um servidor com `n` contas destino: ceil(n/5), mínimo 1. */
export function capacidadeDoServidor(nContas: number): number {
  return Math.max(1, Math.ceil(Math.max(0, nContas) / 5))
}

/** Servidor da corretora a partir da chave física ('mt:<login>@<servidor>' · 'tl:<env>:<id>'). */
export function servidorDaChave(contaChave: string): string {
  const m = /^mt:[^@]*@(.+)$/.exec(contaChave)
  if (m) return `mt:${m[1]}`
  const t = /^tl:([^:]+):/.exec(contaChave)
  if (t) return `tl:${t[1]}`
  return contaChave
}

export class Limitador {
  private emCurso = new Map<string, number>()
  private filas = new Map<string, Array<() => void>>()

  constructor(private capacidade: (chave: string) => number) {}

  async correr<T>(chave: string, fn: () => Promise<T>): Promise<T> {
    await this.entrar(chave)
    try {
      return await fn()
    } finally {
      this.sair(chave)
    }
  }

  ocupacao(chave: string): { emCurso: number; aEspera: number } {
    return { emCurso: this.emCurso.get(chave) ?? 0, aEspera: this.filas.get(chave)?.length ?? 0 }
  }

  private entrar(chave: string): Promise<void> {
    const cap = Math.max(1, this.capacidade(chave))
    const n = this.emCurso.get(chave) ?? 0
    if (n < cap) {
      this.emCurso.set(chave, n + 1)
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const fila = this.filas.get(chave) ?? []
      fila.push(() => {
        this.emCurso.set(chave, (this.emCurso.get(chave) ?? 0) + 1)
        resolve()
      })
      this.filas.set(chave, fila)
    })
  }

  private sair(chave: string): void {
    const n = (this.emCurso.get(chave) ?? 1) - 1
    if (n <= 0) this.emCurso.delete(chave)
    else this.emCurso.set(chave, n)
    const fila = this.filas.get(chave)
    const proximo = fila?.shift()
    if (fila && !fila.length) this.filas.delete(chave)
    if (proximo) proximo()
  }
}
