"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { User, MessageCircle, Mail, Calendar, Shield, Loader2, ArrowLeft } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"

interface UserProfile {
  id: string
  full_name?: string
  username?: string
  email?: string
  avatar_url?: string
  bio?: string
  user_type?: string
  member_category?: string
  created_at?: string
}

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { user: currentUser } = useAuth()
  const userId = params.id as string
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendingMessage, setSendingMessage] = useState(false)

  useEffect(() => {
    if (userId) {
      loadProfile()
    }
  }, [userId])

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Erro ao carregar perfil:', error)
        setProfile(null)
      } else {
        setProfile(data)
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!currentUser || !profile) return

    setSendingMessage(true)
    try {
      // Criar ou obter conversa
      const response = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId: profile.id })
      })

      if (response.ok) {
        const data = await response.json()
        // Redirecionar para a página de mensagens com a conversa aberta
        router.push(`/messages?conversation=${data.conversation.id}`)
      } else {
        alert('Erro ao iniciar conversa')
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      alert('Erro ao iniciar conversa')
    } finally {
      setSendingMessage(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Card className="bg-gray-900 border-[#D2A63C]/20">
          <CardContent className="p-6 text-center">
            <p className="text-gray-400">Perfil não encontrado</p>
            <Link href="/new-landing">
              <Button className="mt-4 bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                Voltar ao Início
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const userTypeBadge: Record<string, { label: string; color: string }> = {
    admin: { label: "Admin", color: "bg-red-500/20 text-red-400 border-red-500/30" },
    member: { label: "Membro", color: "bg-green-500/20 text-green-400 border-green-500/30" },
    vip: { label: "VIP", color: "bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30" },
  }

  const badge = userTypeBadge[profile.user_type || 'member'] || userTypeBadge.member
  const isOwnProfile = currentUser?.id === profile.id

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/new-landing">
            <Button variant="ghost" className="text-gray-400 hover:text-white mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </Link>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Profile Card */}
          <Card className="bg-gradient-to-br from-gray-900/90 to-black/90 border-[#D2A63C]/20 mb-6">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                {/* Avatar */}
                <div className="relative">
                  {profile.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={profile.full_name || profile.username || 'User'}
                      width={120}
                      height={120}
                      className="w-30 h-30 rounded-full border-4 border-[#D2A63C]/30"
                    />
                  ) : (
                    <div className="w-30 h-30 rounded-full bg-gradient-to-br from-[#D2A63C] to-[#BB8525] flex items-center justify-center border-4 border-[#D2A63C]/30">
                      <User className="w-16 h-16 text-black" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-[#D2A63C]">
                      {profile.full_name || profile.username || 'Utilizador'}
                    </h1>
                    <Badge className={badge.color}>
                      {badge.label}
                    </Badge>
                  </div>

                  {profile.username && (
                    <p className="text-gray-400 mb-2">@{profile.username}</p>
                  )}

                  {profile.bio && (
                    <p className="text-gray-300 mb-4">{profile.bio}</p>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                    {profile.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        <span>{profile.email}</span>
                      </div>
                    )}
                    {profile.created_at && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>Membro desde {new Date(profile.created_at).toLocaleDateString('pt-PT')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {!isOwnProfile && currentUser && (
                  <div className="flex gap-3">
                    <Button
                      onClick={handleSendMessage}
                      disabled={sendingMessage}
                      className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                    >
                      {sendingMessage ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          A abrir...
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Enviar Mensagem
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {isOwnProfile && (
                  <Link href="/member-area">
                    <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                      Editar Perfil
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

