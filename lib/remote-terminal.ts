import { Client } from "ssh2"

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bhalt\b/i,
  /\binit\s+0\b/i,
  /\binit\s+6\b/i,
  /\b:\(\)\s*\{\s*:\|:\s*&\s*}\s*;/i,
  /\bchown\s+-R\s+root\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
]

export function isCommandAllowed(command: string): { ok: boolean; reason?: string } {
  const cmd = String(command || "").trim()
  if (!cmd) return { ok: false, reason: "Comando vazio." }
  if (cmd.length > 400) return { ok: false, reason: "Comando demasiado longo." }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) return { ok: false, reason: "Comando bloqueado por segurança." }
  }
  return { ok: true }
}

function readPrivateKeyFromEnv(): string {
  const raw = (process.env.REMOTE_TERMINAL_SSH_PRIVATE_KEY || "").trim()
  if (!raw) throw new Error("REMOTE_TERMINAL_SSH_PRIVATE_KEY não definida.")
  if (raw.includes("BEGIN")) return raw
  try {
    return Buffer.from(raw, "base64").toString("utf8")
  } catch {
    throw new Error("Formato inválido da chave SSH (usa PEM ou base64 PEM).")
  }
}

export async function executeRemoteCommand(command: string): Promise<{
  stdout: string
  stderr: string
  code: number | null
}> {
  const host = (process.env.REMOTE_TERMINAL_SSH_HOST || "").trim()
  const port = Number(process.env.REMOTE_TERMINAL_SSH_PORT || 22)
  const username = (process.env.REMOTE_TERMINAL_SSH_USER || "").trim()
  const privateKey = readPrivateKeyFromEnv()

  if (!host || !username) {
    throw new Error("REMOTE_TERMINAL_SSH_HOST/USER em falta.")
  }

  return new Promise((resolve, reject) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.end()
      reject(new Error("Timeout ao executar comando remoto."))
    }, 20000)

    let stdout = ""
    let stderr = ""
    let exitCode: number | null = null

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout)
            conn.end()
            reject(err)
            return
          }

          stream.on("close", (code: number | undefined) => {
            exitCode = typeof code === "number" ? code : null
            clearTimeout(timeout)
            conn.end()
            resolve({ stdout, stderr, code: exitCode })
          })
          stream.on("data", (data: Buffer) => {
            stdout += data.toString("utf8")
          })
          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString("utf8")
          })
        })
      })
      .on("error", (err) => {
        clearTimeout(timeout)
        reject(err)
      })
      .connect({
        host,
        port,
        username,
        privateKey,
        readyTimeout: 10000,
      })
  })
}
