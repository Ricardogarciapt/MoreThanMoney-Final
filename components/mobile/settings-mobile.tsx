"use client"

import { useState, useRef, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { clearCachedSession } from "@/lib/auth-cache"
import { useToast } from "@/hooks/use-toast"
import {
  User,
  Mail,
  Lock,
  Bell,
  BellOff,
  LogOut,
  ChevronRight,
  Camera,
  Loader2,
  Shield,
  CreditCard,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  Volume2,
  VolumeX,
} from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planLabel(category: string | undefined | null): { label: string; color: string; bg: string } {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    standard: { label: '📱 App Member (€35)', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
    premium:  { label: '💎 Premium (€65)',    color: 'text-cyan-400',  bg: 'bg-cyan-500/10 border-cyan-500/30'  },
    iq:       { label: '🎓 IQ Member',        color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/30'  },
    skool:    { label: '📚 Skool Member',     color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
    vip:      { label: '⭐ VIP',              color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  }
  return map[category ?? ''] ?? { label: '👤 Membro', color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/30' }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsMobile() {
  const { user } = useAuth()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [editingName, setEditingName]     = useState(false)
  const [newName, setNewName]             = useState(user?.full_name ?? "")
  const [savingName, setSavingName]       = useState(false)

  const [changingPw, setChangingPw]       = useState(false)
  const [currentPw, setCurrentPw]         = useState("")
  const [newPw, setNewPw]                 = useState("")
  const [confirmPw, setConfirmPw]         = useState("")
  const [savingPw, setSavingPw]           = useState(false)

  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // App preferences
  const [soundEnabled, setSoundEnabled]   = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem("mtm_notif_sound")
      if (stored !== null) setSoundEnabled(stored !== "0")
    } catch {}
  }, [])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    try { localStorage.setItem("mtm_notif_sound", next ? "1" : "0") } catch {}
    toast({ title: next ? "Som activado" : "Som desactivado", description: next ? "As notificações terão som." : "As notificações serão silenciosas." })
  }

  const handleReplayTutorial = () => {
    try {
      localStorage.removeItem("mtm_onboarding_done")
    } catch {}
    window.dispatchEvent(new Event("mtm-replay-tutorial"))
    toast({ title: "Tutorial reiniciado", description: "O tutorial vai aparecer em breve." })
  }

  // ── Broker UID ────────────────────────────────────────────────────────────
  const [brokerUid, setBrokerUid]         = useState("")
  const [editingUid, setEditingUid]       = useState(false)
  const [savingUid, setSavingUid]         = useState(false)

  useEffect(() => {
    const loadBrokerUid = async () => {
      if (!user?.id) return
      try {
        const { data } = await supabase
          .from("profiles")
          .select("broker_uid")
          .eq("id", user.id)
          .single()
        if (data?.broker_uid) setBrokerUid(data.broker_uid)
      } catch {}
    }
    loadBrokerUid()
  }, [user?.id])

  const saveBrokerUid = async () => {
    if (!user?.id || !brokerUid.trim()) return
    setSavingUid(true)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ broker_uid: brokerUid.trim() })
        .eq("id", user.id)
      if (error) throw error
      toast({ title: "UID guardado", description: "Número de conta TMGM actualizado." })
      setEditingUid(false)
    } catch {
      toast({ title: "Erro", description: "Não foi possível guardar o UID.", variant: "destructive" })
    } finally {
      setSavingUid(false)
    }
  }

  const isAppOnly = user?.member_category === "standard"
  const plan = planLabel(user?.member_category)

  // ── Guardar nome ───────────────────────────────────────────────────────────
  const saveName = async () => {
    if (!user?.id || !newName.trim()) return
    setSavingName(true)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: newName.trim() })
        .eq("id", user.id)
      if (error) throw error
      toast({ title: "Nome actualizado", description: "O teu nome foi guardado com sucesso." })
      setEditingName(false)
    } catch {
      toast({ title: "Erro", description: "Não foi possível guardar o nome.", variant: "destructive" })
    } finally {
      setSavingName(false)
    }
  }

  // ── Alterar password ───────────────────────────────────────────────────────
  const savePassword = async () => {
    if (!newPw || newPw !== confirmPw) {
      toast({ title: "Erro", description: "As passwords não coincidem.", variant: "destructive" })
      return
    }
    if (newPw.length < 8) {
      toast({ title: "Erro", description: "A password deve ter pelo menos 8 caracteres.", variant: "destructive" })
      return
    }
    setSavingPw(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      toast({ title: "Password alterada", description: "Usa a nova password na próxima sessão." })
      setChangingPw(false)
      setCurrentPw("")
      setNewPw("")
      setConfirmPw("")
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message ?? "Não foi possível alterar a password.", variant: "destructive" })
    } finally {
      setSavingPw(false)
    }
  }

  // ── Upload avatar ──────────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 2 MB.", variant: "destructive" })
      return
    }
    setUploadingAvatar(true)
    try {
      const ext = file.name.split(".").pop() ?? "jpg"
      const path = `avatars/${user.id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from("avatars").getPublicUrl(path)
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id)
      if (profileError) throw profileError
      toast({ title: "Foto actualizada", description: "A tua foto de perfil foi guardada." })
    } catch {
      toast({ title: "Erro", description: "Não foi possível actualizar a foto.", variant: "destructive" })
    } finally {
      setUploadingAvatar(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    clearCachedSession()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900 pb-28">
      {/* ── Avatar + nome ──────────────────────────────────────────────── */}
      <div className="px-4 pt-6 pb-4 flex flex-col items-center gap-3 border-b border-gray-800">
        <div className="relative">
          {user?.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={user.full_name ?? "Avatar"}
              width={80}
              height={80}
              className="rounded-full border-2 border-[#D2A63C] object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#D2A63C]/20 border-2 border-[#D2A63C] flex items-center justify-center">
              <User className="w-10 h-10 text-[#D2A63C]" />
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#D2A63C] rounded-full flex items-center justify-center shadow-lg"
          >
            {uploadingAvatar ? (
              <Loader2 className="w-3.5 h-3.5 text-black animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5 text-black" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-lg leading-tight">{user?.full_name ?? user?.username ?? "—"}</p>
          <p className="text-gray-400 text-sm">{user?.email}</p>
          <Badge className={`mt-1.5 border text-xs ${plan.bg} ${plan.color}`}>{plan.label}</Badge>
        </div>
      </div>

      {/* ── Secções ────────────────────────────────────────────────────── */}
      <div className="px-4 py-4 space-y-4">

        {/* Perfil */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">Perfil</h2>
          <div className="bg-gray-800/50 rounded-xl divide-y divide-gray-700/50">
            {/* Nome */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-400">Nome</span>
                </div>
                <button
                  onClick={() => { setEditingName(!editingName); setNewName(user?.full_name ?? "") }}
                  className="text-xs text-[#D2A63C] hover:underline"
                >
                  {editingName ? "Cancelar" : "Editar"}
                </button>
              </div>
              {editingName ? (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="O teu nome"
                    className="h-9 bg-gray-900 border-gray-700 text-white text-sm"
                    onKeyDown={(e) => e.key === "Enter" && saveName()}
                  />
                  <Button
                    size="sm"
                    onClick={saveName}
                    disabled={savingName}
                    className="h-9 px-3 bg-[#D2A63C] hover:bg-[#c49a2e] text-black font-semibold"
                  >
                    {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  </Button>
                </div>
              ) : (
                <p className="text-white text-sm mt-0.5">{user?.full_name ?? "—"}</p>
              )}
            </div>

            {/* Email (read-only) */}
            <div className="px-4 py-3 flex items-center gap-3">
              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm text-white">{user?.email}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Segurança */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">Segurança</h2>
          <div className="bg-gray-800/50 rounded-xl">
            <button
              onClick={() => setChangingPw(!changingPw)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-700/40 transition-colors"
            >
              <Lock className="w-4 h-4 text-gray-400" />
              <span className="flex-1 text-left text-sm text-white">Alterar password</span>
              <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${changingPw ? "rotate-90" : ""}`} />
            </button>
            {changingPw && (
              <div className="px-4 pb-4 space-y-2 border-t border-gray-700/50 pt-3">
                <Input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Nova password"
                  className="h-9 bg-gray-900 border-gray-700 text-white text-sm"
                />
                <Input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Confirmar nova password"
                  className="h-9 bg-gray-900 border-gray-700 text-white text-sm"
                />
                {newPw && confirmPw && newPw !== confirmPw && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> As passwords não coincidem
                  </p>
                )}
                <Button
                  onClick={savePassword}
                  disabled={savingPw || !newPw || !confirmPw}
                  className="w-full h-9 bg-[#D2A63C] hover:bg-[#c49a2e] text-black font-semibold text-sm"
                >
                  {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar password"}
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Plano */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">Plano</h2>
          <div className={`rounded-xl border p-4 ${plan.bg}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`font-semibold text-sm ${plan.color}`}>{plan.label}</p>
                {user?.subscription_expires_at && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Válido até {new Date(user.subscription_expires_at).toLocaleDateString("pt-PT")}
                  </p>
                )}
              </div>
              <Shield className={`w-5 h-5 ${plan.color}`} />
            </div>
            {isAppOnly && (
              <div className="mt-3 pt-3 border-t border-gray-700/40">
                <p className="text-xs text-gray-400 mb-2">
                  Faz upgrade para acederes ao Scanner, Portfólio e todas as funcionalidades premium.
                </p>
                <a
                  href="https://morethanmoney.pt/upgrade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-[#D2A63C] hover:bg-[#c49a2e] text-black text-sm font-semibold rounded-lg transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  Ver planos de upgrade
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Corretora */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">Corretora</h2>
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">UID TMGM</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {brokerUid || "Não registado — obrigatório para Trade Ideas"}
                </p>
              </div>
              <button
                onClick={() => setEditingUid(!editingUid)}
                className="text-xs text-[#D2A63C] underline"
              >
                {editingUid ? "Cancelar" : brokerUid ? "Editar" : "Adicionar"}
              </button>
            </div>
            {editingUid && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={brokerUid}
                  onChange={e => setBrokerUid(e.target.value)}
                  placeholder="Ex: 12345678"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/50"
                />
                <button
                  onClick={saveBrokerUid}
                  disabled={savingUid}
                  className="w-full py-2.5 rounded-lg bg-[#D2A63C] text-black font-semibold text-sm disabled:opacity-50"
                >
                  {savingUid ? "A guardar..." : "Guardar UID"}
                </button>
              </div>
            )}
            {!brokerUid && !editingUid && (
              <a
                href="/app-mobile/accountopen"
                className="block text-center text-xs text-[#D2A63C] underline"
              >
                Abrir conta TMGM →
              </a>
            )}
          </div>
        </section>

        {/* Notificações */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">Notificações</h2>
          <div className="bg-gray-800/50 rounded-xl divide-y divide-gray-700/50">
            <button
              onClick={async () => {
                if (typeof window === "undefined" || !("Notification" in window)) return
                if (Notification.permission === "denied") {
                  toast({
                    title: "Notificações bloqueadas",
                    description: "Activa as notificações nas definições do browser.",
                    variant: "destructive",
                  })
                  return
                }
                const permission = await Notification.requestPermission()
                if (permission === "granted") {
                  toast({ title: "Notificações activadas", description: "Vais receber alertas em tempo real." })
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-t-xl hover:bg-gray-700/40 transition-colors"
            >
              <Bell className="w-4 h-4 text-gray-400" />
              <span className="flex-1 text-left text-sm text-white">Push notifications</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-gray-700 text-gray-400"
              }`}>
                {typeof window !== "undefined" && "Notification" in window
                  ? Notification.permission === "granted" ? "Activas" : Notification.permission === "denied" ? "Bloqueadas" : "Inactivas"
                  : "N/D"
                }
              </span>
            </button>

            {/* Som das notificações */}
            <button
              onClick={toggleSound}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-b-xl hover:bg-gray-700/40 transition-colors"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-gray-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-gray-400" />
              )}
              <span className="flex-1 text-left text-sm text-white">Som das notificações</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                soundEnabled ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"
              }`}>
                {soundEnabled ? "Ligado" : "Desligado"}
              </span>
            </button>
          </div>
        </section>

        {/* App */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">App</h2>
          <div className="bg-gray-800/50 rounded-xl">
            <button
              onClick={handleReplayTutorial}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-700/40 transition-colors"
            >
              <PlayCircle className="w-4 h-4 text-[#D2A63C]" />
              <div className="flex-1 text-left">
                <span className="text-sm text-white">Rever tutorial</span>
                <p className="text-xs text-gray-500 mt-0.5">Recomeça o guia de boas-vindas da app</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </section>

        {/* Sair */}
        <section className="pt-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            Terminar sessão
          </button>
        </section>
      </div>
    </div>
  )
}
