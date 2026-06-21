"use client"

import { useState, useRef, useEffect } from "react"
import { useTheme } from "next-themes"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { clearCachedSession } from "@/lib/auth-cache"
import { useToast } from "@/hooks/use-toast"
import {
  NOTIFICATION_CATEGORY_LABELS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategory,
  type NotificationPreferences,
} from "@/lib/notification-preferences"
import {
  User,
  Mail,
  Lock,
  Bell,
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
  Sun,
  Moon,
  Trash2,
  TriangleAlert,
  Zap,
  Award,
} from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function xpProgressInLevel(totalXp: number): number {
  return totalXp % 1000
}

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
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  })
  const [savingNotifPref, setSavingNotifPref] = useState<NotificationCategory | null>(null)
  const { theme, setTheme } = useTheme()
  const [mountedTheme, setMountedTheme]   = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem("mtm_notif_sound")
      if (stored !== null) setSoundEnabled(stored !== "0")
    } catch {}
    setMountedTheme(true)
  }, [])

  useEffect(() => {
    const loadPrefs = async () => {
      if (!user?.id) return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch("/api/notifications/preferences", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (data.preferences) setNotifPrefs(data.preferences)
      } catch {}
    }
    loadPrefs()
  }, [user?.id])

  const toggleNotifPref = async (key: NotificationCategory) => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(next)
    setSavingNotifPref(key)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Sessão inválida")
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ preferences: { [key]: next[key] } }),
      })
      if (!res.ok) throw new Error("Falha ao guardar")
      toast({
        title: next[key] ? "Notificações activadas" : "Notificações desactivadas",
        description: NOTIFICATION_CATEGORY_LABELS[key].title,
      })
    } catch {
      setNotifPrefs(notifPrefs)
      toast({
        title: "Erro",
        description: "Não foi possível guardar a preferência.",
        variant: "destructive",
      })
    } finally {
      setSavingNotifPref(null)
    }
  }

  const THEME_OPTIONS: { id: "dark" | "light"; label: string; icon: typeof Moon }[] = [
    { id: "dark",  label: "Escuro", icon: Moon },
    { id: "light", label: "Claro",  icon: Sun },
  ]

  const handleThemeChange = (next: "dark" | "light") => {
    setTheme(next)
    toast({ title: "Tema actualizado", description: `Tema ${next === "dark" ? "escuro" : "claro"} activado.` })
  }

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

  // ── XP ────────────────────────────────────────────────────────────────────
  const [xpData, setXpData] = useState<{ total_xp: number; current_level: number }>({ total_xp: 0, current_level: 1 })

  useEffect(() => {
    const loadXp = async () => {
      if (!user?.id) return
      try {
        const { data } = await supabase
          .from('user_xp')
          .select('total_xp, current_level')
          .eq('user_id', user.id)
          .single()
        setXpData(data ?? { total_xp: 0, current_level: 1 })
      } catch {
        setXpData({ total_xp: 0, current_level: 1 })
      }
    }
    loadXp()
  }, [user?.id])

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

  // ── Eliminar conta ─────────────────────────────────────────────────────────
  const [showDeleteSection, setShowDeleteSection] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deletingAccount, setDeletingAccount] = useState(false)

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "ELIMINAR") return
    setDeletingAccount(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error("Sessão inválida")

      const res = await fetch("/api/user/delete-account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Erro ao eliminar conta")
      }

      // Limpar sessão local e redirecionar
      clearCachedSession()
      await supabase.auth.signOut()
      toast({ title: "Conta eliminada", description: "Os teus dados foram removidos permanentemente." })
      window.location.href = "/"
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message ?? "Não foi possível eliminar a conta. Tenta novamente.",
        variant: "destructive",
      })
    } finally {
      setDeletingAccount(false)
    }
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

        {/* XP & Nível */}
        {(
          <div className="w-full mt-1 px-2">
            <div className="p-3 bg-gray-800/60 rounded-xl border border-[#D2A63C]/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-[#D2A63C]" />
                  <span className="text-xs text-gray-400 font-medium">Nível {xpData.current_level}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-yellow-400" />
                  <span className="text-xs font-semibold text-yellow-400">
                    {xpData.total_xp.toLocaleString("pt-PT")} XP
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-700/60 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(xpProgressInLevel(xpData.total_xp) / 1000) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1 text-right">
                {xpProgressInLevel(xpData.total_xp)}/1000 XP para nível {xpData.current_level + 1}
              </p>
            </div>
          </div>
        )}
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

        {/* Aparência — Tema */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">Aparência</h2>
          <div className="bg-gray-800/50 rounded-xl p-2">
            <div className="flex gap-2">
              {THEME_OPTIONS.map(({ id, label, icon: Icon }) => {
                const active = mountedTheme && theme === id
                return (
                  <button
                    key={id}
                    onClick={() => handleThemeChange(id)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-colors ${
                      active
                        ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]"
                        : "border-gray-700/50 text-gray-400 hover:bg-gray-700/30"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2 px-1">Escolhe o tema da app — a preferência fica guardada neste dispositivo.</p>
          </div>
        </section>

        {/* Notificações */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">Notificações</h2>
          <div className="bg-gray-800/50 rounded-xl divide-y divide-gray-700/50">
            <button
              onClick={async () => {
                // ── Capacitor nativo (iOS/Android) ────────────────────────────
                const isCapacitorNative = typeof window !== "undefined" && !!(window as any).Capacitor?.isNative
                if (isCapacitorNative) {
                  try {
                    const { PushNotifications } = await import(/* webpackIgnore: true */ "@capacitor/push-notifications" as any)
                    let perm = await PushNotifications.checkPermissions()
                    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
                      perm = await PushNotifications.requestPermissions()
                    }
                    if (perm.receive === "granted") {
                      // Adicionar listener temporário para capturar o token FCM
                      // (necessário quando use-capacitor.ts não teve oportunidade de o registar,
                      //  ex: permissão foi negada no primeiro arranque e o utilizador activou depois)
                      const { data: { session } } = await supabase.auth.getSession()
                      const uid = session?.user?.id
                      if (uid) {
                        let tokenListener: { remove: () => void } | null = null
                        tokenListener = await PushNotifications.addListener(
                          "registration",
                          async (token: { value: string }) => {
                            tokenListener?.remove()
                            try {
                              const platform = (window as any).Capacitor?.getPlatform?.() ?? "ios"
                              await fetch("/api/notifications/fcm-token", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  userId: uid,
                                  token: token.value,
                                  deviceInfo: { platform, nativeApp: true },
                                }),
                              })
                              console.log("[PUSH] Token FCM guardado a partir de settings:", token.value.substring(0, 20) + "...")
                            } catch (e) {
                              console.warn("[PUSH] Erro ao guardar token FCM:", e)
                            }
                          }
                        )
                      }
                      await PushNotifications.register()
                      toast({ title: "Notificações activadas", description: "Vais receber alertas na app." })
                    } else {
                      toast({ title: "Notificações bloqueadas", description: "Activa nas definições do dispositivo.", variant: "destructive" })
                    }
                  } catch (e) {
                    console.warn("[PUSH] Erro Capacitor:", e)
                  }
                  return
                }

                // ── Web / browser (FCM) ───────────────────────────────────────
                if (typeof window === "undefined" || !("Notification" in window)) return
                if (Notification.permission === "denied") {
                  toast({
                    title: "Notificações bloqueadas",
                    description: "Activa as notificações nas definições do browser.",
                    variant: "destructive",
                  })
                  return
                }
                try {
                  const { requestNotificationPermission, saveFCMToken } = await import("@/lib/firebase-config")
                  const fcmToken = await requestNotificationPermission()
                  if (fcmToken) {
                    // Obter userId para guardar o token
                    const { data: { session } } = await supabase.auth.getSession()
                    const uid = session?.user?.id
                    if (uid) await saveFCMToken(uid, fcmToken)
                    toast({ title: "Notificações activadas", description: "Vais receber alertas em tempo real." })
                  } else if (Notification.permission === "denied") {
                    toast({ title: "Notificações bloqueadas", description: "Activa nas definições do browser.", variant: "destructive" })
                  }
                } catch {
                  // Fallback: só pedir permissão sem registar token
                  const permission = await Notification.requestPermission()
                  if (permission === "granted") {
                    toast({ title: "Notificações activadas", description: "Vais receber alertas em tempo real." })
                  }
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
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700/40 transition-colors"
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

          <p className="text-xs text-gray-500 px-1 mt-3 mb-2">
            Escolhe que alertas queres receber no site e na app (push + sino).
          </p>
          <div className="bg-gray-800/50 rounded-xl divide-y divide-gray-700/50">
            {(Object.keys(NOTIFICATION_CATEGORY_LABELS) as NotificationCategory[]).map((key) => {
              const meta = NOTIFICATION_CATEGORY_LABELS[key]
              const enabled = notifPrefs[key]
              const saving = savingNotifPref === key
              return (
                <button
                  key={key}
                  onClick={() => toggleNotifPref(key)}
                  disabled={saving}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-700/40 transition-colors text-left disabled:opacity-60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">{meta.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${
                    enabled ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"
                  }`}>
                    {saving ? "…" : enabled ? "On" : "Off"}
                  </span>
                </button>
              )
            })}
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

        {/* Eliminar conta */}
        <section className="pt-1 pb-4">
          <div className="bg-gray-800/30 rounded-xl border border-gray-700/30">
            <button
              onClick={() => { setShowDeleteSection(!showDeleteSection); setDeleteConfirmText("") }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-700/20 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-gray-500" />
              <span className="flex-1 text-left text-sm text-gray-500">Eliminar conta</span>
              <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform ${showDeleteSection ? "rotate-90" : ""}`} />
            </button>

            {showDeleteSection && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-700/30 pt-3">
                {/* Aviso */}
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <TriangleAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-300 leading-relaxed">
                    <p className="font-semibold mb-1">Esta acção é irreversível.</p>
                    <p>A tua conta, histórico, portfólio e todos os dados associados serão eliminados permanentemente. Não é possível recuperar informação após a eliminação.</p>
                  </div>
                </div>

                {/* Campo de confirmação */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">
                    Para confirmar, escreve <span className="font-mono font-bold text-red-400">ELIMINAR</span> no campo abaixo:
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="ELIMINAR"
                    className="h-9 bg-gray-900 border-gray-700 text-white text-sm font-mono"
                    autoCapitalize="characters"
                    autoCorrect="off"
                  />
                </div>

                {/* Botão de eliminação */}
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "ELIMINAR" || deletingAccount}
                  className="w-full h-10 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold text-sm transition-colors"
                >
                  {deletingAccount ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> A eliminar...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4" /> Eliminar conta permanentemente
                    </span>
                  )}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  Se precisares de ajuda, contacta{" "}
                  <a href="mailto:suporte@morethanmoney.pt" className="text-[#D2A63C] underline">
                    suporte@morethanmoney.pt
                  </a>
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
