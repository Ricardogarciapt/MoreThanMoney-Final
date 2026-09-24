/**
 * Declaração mínima do `ssh2` — o pacote não traz tipos e o `@types/ssh2` não está
 * instalado. Em vez de um `declare module 'ssh2'` vazio (que é `any` com outro nome),
 * declara-se só o que o repositório de facto usa, em app/api/admin/n8n-vps: abrir a
 * ligação, correr um comando e ler o que ele escreve.
 *
 * Se algum dia for preciso mais do `ssh2`, acrescenta-se aqui — ou instala-se o
 * `@types/ssh2` e apaga-se este ficheiro.
 */
declare module "ssh2" {
  import type { EventEmitter } from "node:events"

  export interface ConnectConfig {
    host?: string
    port?: number
    username?: string
    password?: string
    privateKey?: string | Buffer
    passphrase?: string
    readyTimeout?: number
  }

  /** O canal devolvido pelo `exec`: stdout no próprio stream, stderr em `.stderr`. */
  export interface ClientChannel extends EventEmitter {
    stderr: EventEmitter
    on(evento: "data", ouvinte: (dados: Buffer) => void): this
    on(evento: "close", ouvinte: (codigo: number, sinal?: string) => void): this
    on(evento: string, ouvinte: (...args: unknown[]) => void): this
    write(dados: string | Buffer): boolean
    end(): void
  }

  export class Client extends EventEmitter {
    on(evento: "ready", ouvinte: () => void): this
    on(evento: "error", ouvinte: (erro: Error) => void): this
    on(evento: "close" | "end", ouvinte: () => void): this
    on(evento: string, ouvinte: (...args: unknown[]) => void): this
    exec(
      comando: string,
      callback: (erro: Error | undefined, canal: ClientChannel) => void,
    ): this
    connect(config: ConnectConfig): this
    end(): this
  }
}
