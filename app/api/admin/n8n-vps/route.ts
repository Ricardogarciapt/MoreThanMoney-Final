import { NextRequest, NextResponse } from "next/server"
import { Client } from "ssh2"
import { requireAdmin } from "@/lib/admin-api-helpers"

// Parse VPS_HOST — strip http(s):// prefix if present
const rawHost = process.env.VPS_HOST || "vmi3355213.contaboserver.net"
const VPS_HOST = rawHost.replace(/^https?:\/\//, "")
// Parse VPS_USER — strip @hostname suffix if present (e.g. admin@host → admin)
const rawUser = process.env.VPS_USER || "admin"
const VPS_USER = rawUser.includes("@") ? rawUser.split("@")[0] : rawUser
const VPS_PASSWORD = process.env.VPS_PASSWORD || ""
const VPS_PORT = parseInt(process.env.VPS_PORT || "22")
const N8N_DIR = process.env.N8N_DIR || "/opt/mtm-n8n"
const N8N_PUBLIC_URL = `https://${VPS_HOST}`

function ssh(command: string, timeoutMs = 30000): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let stdout = ""
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      conn.end()
      reject(new Error("SSH timeout"))
    }, timeoutMs)

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) { clearTimeout(timer); conn.end(); reject(err); return }
          stream
            .on("data", (d: Buffer) => { stdout += d.toString() })
            .stderr.on("data", (d: Buffer) => { stdout += d.toString() })
          stream.on("close", (code: number) => {
            clearTimeout(timer)
            if (!timedOut) { conn.end(); resolve({ stdout: stdout.trim(), code }) }
          })
        })
      })
      .on("error", (err) => { clearTimeout(timer); reject(err) })
      .connect({ host: VPS_HOST, port: VPS_PORT, username: VPS_USER, password: VPS_PASSWORD })
  })
}

// ── GET — status do n8n + VPS ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req)
  if (authCheck) return authCheck
  try {
    const { searchParams } = new URL(req.url)
    const cmd = searchParams.get("cmd") || "status"

    if (cmd === "status") {
      const [containers, diskResult] = await Promise.all([
        ssh("docker ps --format '{{.Names}}|{{.Status}}|{{.Image}}' 2>/dev/null || echo 'docker_error'"),
        ssh("df -h / | tail -1 | awk '{print $5}' 2>/dev/null || echo 'N/A'"),
      ])

      const n8nLine = containers.stdout.split("\n").find(l => l.includes("n8n"))
      const n8nRunning = !!n8nLine && n8nLine.includes("Up")

      return NextResponse.json({
        n8nRunning,
        n8nStatus: n8nLine || "not found",
        diskUsage: diskResult.stdout,
        allContainers: containers.stdout,
        vpsHost: VPS_HOST,
        n8nUrl: N8N_PUBLIC_URL,
      })
    }

    if (cmd === "logs") {
      const result = await ssh("docker logs mtm-n8n --tail 50 2>&1 || echo 'Container não encontrado'", 15000)
      return NextResponse.json({ logs: result.stdout })
    }

    return NextResponse.json({ error: "Comando desconhecido" }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, n8nRunning: false }, { status: 500 })
  }
}

// ── POST — ações sobre o n8n ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req)
  if (authCheck) return authCheck
  try {
    // Parse body once — avoids double req.json() issue
    const body = await req.json()
    const { action, command: shellCommand } = body

    if (action === "shell") {
      if (!shellCommand) return NextResponse.json({ error: "Comando vazio" }, { status: 400 })
      const result = await ssh(shellCommand, 20000)
      return NextResponse.json({ output: result.stdout, code: result.code })
    }

    const DEPLOY_COMPOSE = `version: "3.8"
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    container_name: mtm-n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=${VPS_HOST}
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://${VPS_HOST}:5678/
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=MTM_n8n_2026!
      - GENERIC_TIMEZONE=Europe/Lisbon
      - TZ=Europe/Lisbon
      - N8N_SECURE_COOKIE=false
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=168
    volumes:
      - n8n_data:/home/node/.n8n
volumes:
  n8n_data:`

    const commands: Record<string, string> = {
      start:   `cd ${N8N_DIR} && docker-compose up -d 2>&1`,
      stop:    `cd ${N8N_DIR} && docker-compose down 2>&1`,
      restart: `cd ${N8N_DIR} && docker-compose restart 2>&1`,
      update:  `cd ${N8N_DIR} && docker-compose pull && docker-compose up -d 2>&1`,
      deploy: [
        `mkdir -p ${N8N_DIR}`,
        `cd ${N8N_DIR}`,
        `cat > docker-compose.yml << 'COMPOSE'\n${DEPLOY_COMPOSE}\nCOMPOSE`,
        `docker pull docker.n8n.io/n8nio/n8n:latest 2>&1 | tail -5`,
        `docker-compose up -d 2>&1`,
        `echo "Deploy concluído"`,
      ].join(" && "),
    }

    const cmd = commands[action]
    if (!cmd) return NextResponse.json({ error: "Ação inválida" }, { status: 400 })

    const result = await ssh(cmd, action === "deploy" ? 120000 : 30000)
    return NextResponse.json({ success: result.code === 0, output: result.stdout })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
