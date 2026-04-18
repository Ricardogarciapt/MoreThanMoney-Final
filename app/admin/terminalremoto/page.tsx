"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { ArrowLeft, TerminalSquare, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type RunResult = {
  success?: boolean
  stdout?: string
  stderr?: string
  code?: number | null
  error?: string
}

const HANDSHAKE_CMD = "echo 'SSH OK - sessão remota ativa' && whoami && hostname && pwd"

const COMMAND_GROUPS: { title: string; items: { label: string; cmd: string }[] }[] = [
  {
    title: "Estado rápido",
    items: [
      {
        label: "Ligar ao VPS (SSH)",
        cmd: HANDSHAKE_CMD,
      },
      { label: "Whoami + host", cmd: "whoami && hostname && pwd" },
      { label: "Uptime + disco + RAM", cmd: "uptime && df -h && free -h" },
      { label: "IP + DNS stream", cmd: "curl -s ifconfig.me && echo && dig +short stream.morethanmoney.pt A" },
    ],
  },
  {
    title: "Streaming (SRS/Nginx)",
    items: [
      { label: "Docker stream", cmd: "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'" },
      { label: "Logs SRS (50)", cmd: "docker logs mtm-srs --tail 50" },
      { label: "Portas 1935/8080/80/443", cmd: "sudo ss -tlnp | grep -E '1935|8080|:80|:443' || true" },
      { label: "Nginx test + status", cmd: "sudo nginx -t && sudo systemctl status nginx --no-pager -l" },
      { label: "Manifest HLS", cmd: "curl -sI https://stream.morethanmoney.pt/hls/mtm_c6e156d5_4b2738e4992e512f355886045b985080.m3u8" },
      {
        label: "ffprobe codecs HLS",
        cmd: "ffprobe -v error -show_streams https://stream.morethanmoney.pt/live/mtm_c6e156d5_4b2738e4992e512f355886045b985080.m3u8",
      },
      {
        label: "Instalar ffmpeg/ffprobe",
        cmd: "sudo apt update && sudo apt install -y ffmpeg",
      },
    ],
  },
  {
    title: "Gestão",
    items: [
      { label: "Restart Nginx", cmd: "sudo systemctl restart nginx && sudo systemctl status nginx --no-pager -l" },
      { label: "Restart SRS", cmd: "cd /opt/mtm-stream && docker compose restart && docker ps" },
      { label: "UFW status", cmd: "sudo ufw status numbered" },
      {
        label: "Ativar SSH (OpenSSH)",
        cmd: "sudo apt update && sudo apt install -y openssh-server && sudo systemctl enable ssh && sudo systemctl restart ssh && sudo systemctl status ssh --no-pager -l",
      },
      { label: "Status SSH + porta 22", cmd: "sudo systemctl status ssh --no-pager -l && sudo ss -tlnp | grep :22 || true" },
      { label: "Abrir porta 22 (UFW)", cmd: "sudo ufw allow OpenSSH && sudo ufw reload && sudo ufw status" },
      { label: "Certbot dry-run", cmd: "sudo certbot renew --dry-run" },
    ],
  },
]

export default function TerminalRemotoPage() {
  const [command, setCommand] = useState("docker ps")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [handshakeOk, setHandshakeOk] = useState<boolean | null>(null)

  const runRawCommand = async (raw: string) => {
    const cmd = raw.trim()
    if (!cmd) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch("/api/admin/terminalremoto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ command: cmd }),
      })
      const json = (await res.json().catch(() => ({}))) as RunResult
      setResult(json)
      if (cmd === HANDSHAKE_CMD) {
        setHandshakeOk(json.code === 0)
      }
    } catch {
      setResult({ error: "Falha de rede." })
      if (cmd === HANDSHAKE_CMD) setHandshakeOk(false)
    } finally {
      setLoading(false)
    }
  }

  const runCommand = async (e: FormEvent) => {
    e.preventDefault()
    await runRawCommand(command)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-5 w-5 text-[#D2A63C]" />
            <h1 className="text-lg sm:text-xl font-semibold text-[#D2A63C]">Terminal remoto (admin)</h1>
          </div>
          <Link href="/admin?tab=education">
            <Button variant="outline" className="border-gray-700 text-gray-200">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao admin
            </Button>
          </Link>
        </div>

        <div className="rounded-xl border border-[#D2A63C]/20 bg-gray-950/80 p-4 space-y-3">
          <p className="text-xs text-gray-400">
            Executa comandos no VPS via SSH (server-side). Comandos destrutivos estão bloqueados por segurança.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={loading}
              className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
              onClick={() => {
                setCommand(HANDSHAKE_CMD)
                void runRawCommand(HANDSHAKE_CMD)
              }}
            >
              Handshake SSH
            </Button>
            <span
              className={`text-xs rounded border px-2 py-1 ${
                handshakeOk === true
                  ? "border-green-500/40 text-green-300"
                  : handshakeOk === false
                    ? "border-red-500/40 text-red-300"
                    : "border-gray-700 text-gray-400"
              }`}
            >
              {handshakeOk === true ? "Ligação SSH: OK" : handshakeOk === false ? "Ligação SSH: Falhou" : "Ligação SSH: por validar"}
            </span>
          </div>
          <form onSubmit={runCommand} className="flex flex-col sm:flex-row gap-2">
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Ex.: docker ps"
              className="border-gray-700 bg-black/40 text-white"
            />
            <Button type="submit" disabled={loading} className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Executar"}
            </Button>
          </form>
          <div className="space-y-3 pt-1">
            {COMMAND_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="text-xs font-medium text-[#D2A63C]">{group.title}</p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <div key={item.label} className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        className="border-gray-700 text-gray-200"
                        onClick={() => setCommand(item.cmd)}
                      >
                        {item.label}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={loading}
                        className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                        onClick={() => {
                          setCommand(item.cmd)
                          void runRawCommand(item.cmd)
                        }}
                      >
                        Executar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-black/60 p-4">
          <p className="text-xs text-gray-400 mb-2">Saída</p>
          <pre className="whitespace-pre-wrap text-xs sm:text-sm text-gray-200 min-h-[180px]">
            {result
              ? [
                  result.error ? `Erro: ${result.error}` : null,
                  result.code !== undefined ? `Exit code: ${String(result.code)}` : null,
                  result.stdout ? `\nSTDOUT:\n${result.stdout}` : null,
                  result.stderr ? `\nSTDERR:\n${result.stderr}` : null,
                ]
                  .filter(Boolean)
                  .join("\n")
              : "Sem saída ainda."}
          </pre>
        </div>
      </div>
    </div>
  )
}
