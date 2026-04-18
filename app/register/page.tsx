'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Eye, EyeOff, Users, Clock, Loader2 } from 'lucide-react'
import Link from 'next/link'

type AccountType = 'member' | 'trial'

export default function RegisterPage() {
  const [accountType, setAccountType] = useState<AccountType>('member')
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    phone: '',
    whatsapp: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const router = useRouter()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validações
    if (!formData.full_name.trim()) {
      setError('Nome completo é obrigatório')
      return
    }

    if (!formData.email.trim()) {
      setError('Email é obrigatório')
      return
    }

    if (!formData.username.trim()) {
      setError('Nome de utilizador é obrigatório')
      return
    }

    // Senha é obrigatória para todas as contas
    if (formData.password.length < 6) {
      setError('A palavra-passe deve ter pelo menos 6 carateres')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('As palavras-passe não coincidem')
      return
    }

    setIsLoading(true)

    try {
      console.log('📝 [REGISTER] Iniciando registro:', accountType)

      // Free Trial (7 dias) — user_type guest + trial_expires_at
      if (accountType === 'trial') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.full_name,
              username: formData.username,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        })

        if (signUpError) {
          console.error('❌ Erro no signup:', signUpError)
          
          if (signUpError.message.includes('already registered')) {
            setError('Este email já está registrado. Tenta fazer login.')
          } else {
            setError(signUpError.message)
          }
          setIsLoading(false)
          return
        }

        if (data.user) {
          console.log(`✅ Usuário ${accountType} criado:`, data.user.id)
          
          // Calcular data de expiração baseado no tipo
          const expiryDate = new Date()
          expiryDate.setDate(expiryDate.getDate() + 7)
          
          // Upsert: substitui o perfil mínimo criado pelo trigger em auth.users
          const { error: profileError } = await supabase.from('profiles').upsert(
            {
              id: data.user.id,
              email: formData.email,
              full_name: formData.full_name,
              username: formData.username,
              phone: formData.phone || null,
              whatsapp: formData.whatsapp || null,
              user_type: 'guest',
              member_category: 'standard',
              is_active: true,
              trial_expires_at: expiryDate.toISOString(),
              trial_expired: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          )

          if (profileError) {
            console.error('❌ Erro ao guardar perfil:', profileError)
            setError('Erro ao criar perfil: ' + profileError.message)
            setIsLoading(false)
            return
          }

          console.log(`✅ Conta trial criada com sucesso!`)
          alert(`✅ Conta Free Trial criada!\n\nA tua palavra-passe é a que definiste.\n\nValidade: 7 dias\n\nAgora podes fazer login.`)
          router.push('/login')
        }
      } else {
        // Conta de membro regular
        console.log('📝 [REGISTER] Criando usuário no auth...')
        
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.full_name,
              username: formData.username,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        })

        if (signUpError) {
          console.error('❌ Erro no signup:', signUpError)
          
          if (signUpError.message.includes('already registered')) {
            setError('Este email já está registrado. Tente fazer login.')
          } else {
            setError(signUpError.message)
          }
          setIsLoading(false)
          return
        }

        if (data.user) {
          console.log('✅ Usuário criado:', data.user.id)
          
          // Verificar configuração de aprovação automática
          const settingsResponse = await fetch('/api/admin/settings')
          const settingsData = await settingsResponse.json()
          const autoApprove = settingsData?.data?.auto_approve_users ?? true
          
          console.log('🔧 [REGISTER] Auto-aprovação:', autoApprove)

          const profileData: Record<string, unknown> = {
            id: data.user.id,
            email: formData.email,
            full_name: formData.full_name,
            username: formData.username,
            phone: formData.phone || null,
            whatsapp: formData.whatsapp || null,
            user_type: autoApprove ? 'member' : 'pending',
            member_category: 'standard',
            is_active: autoApprove,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert(
              { ...profileData, updated_at: new Date().toISOString() },
              { onConflict: 'id' }
            )

          if (profileError) {
            console.error('❌ Erro ao guardar perfil:', profileError)
            setError('Erro ao criar perfil: ' + profileError.message)
            setIsLoading(false)
            return
          }

          console.log('✅ Conta criada com sucesso!')
          
          if (autoApprove) {
            alert('✅ Conta criada e aprovada com sucesso! Faça login para continuar.')
          } else {
            alert('✅ Conta criada com sucesso!\n\n⚠️ Sua conta está pendente de aprovação por um administrador.\n\nVocê receberá um email quando sua conta for aprovada.')
          }
          
          router.push('/login')
        }
      }
    } catch (err: any) {
      console.error('❌ Exceção ao criar conta:', err)
      setError(err.message || 'Erro ao criar conta')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleRegister = async () => {
    setIsLoading(true)
    setError('')

    try {
      console.log('🔍 [GOOGLE REGISTER] Iniciando...')
      
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=/new-landing`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      })

      if (oauthError) {
        console.error('❌ Erro no Google OAuth:', oauthError)
        setError(oauthError.message)
        setIsLoading(false)
        return
      }

      if (data?.url) {
        console.log('✅ Redirecionando para Google...')
        window.location.href = data.url
      } else {
        setError('Erro ao gerar URL do Google')
        setIsLoading(false)
      }
    } catch (error: any) {
      console.error('❌ Erro no registro Google:', error)
      setError('Erro ao iniciar registro com Google')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md bg-gray-900/50 border-[#D2A63C]/30">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[#D2A63C]">
            Criar Conta MoreThanMoney
          </CardTitle>
          <p className="text-gray-400 mt-2">Membro ou Free Trial (7 dias). VIP é atribuído pela equipa.</p>
        </CardHeader>
        <CardContent>
          {/* Seleção de Tipo de Conta */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              type="button"
              onClick={() => setAccountType('member')}
              disabled={isLoading}
              className={`p-4 rounded-lg border-2 transition-all ${
                accountType === 'member'
                  ? 'border-[#D2A63C] bg-[#D2A63C]/10 text-[#D2A63C]'
                  : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-[#D2A63C]/50'
              }`}
            >
              <Users className="w-6 h-6 mx-auto mb-2" />
              <p className="text-sm font-semibold">Membro</p>
              <p className="text-xs mt-1 opacity-70">Conta principal</p>
            </button>

            <button
              type="button"
              onClick={() => setAccountType('trial')}
              disabled={isLoading}
              className={`p-4 rounded-lg border-2 transition-all ${
                accountType === 'trial'
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-blue-500/50'
              }`}
            >
              <Clock className="w-6 h-6 mx-auto mb-2" />
              <p className="text-sm font-semibold">Free Trial</p>
              <p className="text-xs mt-1 opacity-70">7 dias grátis</p>
            </button>
          </div>

          {/* Info sobre tipo selecionado */}
          <div className="mb-6 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
            {accountType === 'member' && (
              <div className="text-sm text-gray-300">
                <p className="font-semibold text-[#D2A63C] mb-1">✓ Conta Membro</p>
                <p className="text-xs">Acesso completo a todas as funcionalidades.</p>
              </div>
            )}
            {accountType === 'trial' && (
              <div className="text-sm text-gray-300">
                <p className="font-semibold text-blue-400 mb-1">✓ Free Trial - 7 Dias</p>
                <p className="text-xs">Acesso completo por 7 dias.</p>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <span className="text-red-500 text-sm">{error}</span>
              </div>
            )}

            <div>
              <Label htmlFor="full_name" className="text-gray-300">
                Nome Completo *
              </Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                value={formData.full_name}
                onChange={handleInputChange}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="O teu nome completo"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-gray-300">
                Email *
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="email@exemplo.com"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="username" className="text-gray-300">
                Nome de Utilizador *
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleInputChange}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="nome_utilizador"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-gray-300">
                Telefone
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleInputChange}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="+351 912 345 678"
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="whatsapp" className="text-gray-300">
                WhatsApp
              </Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                value={formData.whatsapp}
                onChange={handleInputChange}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="+351 912 345 678"
                disabled={isLoading}
              />
            </div>

            {/* Senha para todos */}
            <>
              <div>
                <Label htmlFor="password" className="text-gray-300">
                  Palavra-passe *
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleInputChange}
                    className="bg-gray-800 border-gray-700 text-white pr-10"
                    placeholder="Mínimo 6 carateres"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-gray-300">
                  Confirmar Palavra-passe *
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="bg-gray-800 border-gray-700 text-white pr-10"
                    placeholder="Confirma a tua palavra-passe"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black font-semibold"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Criar Conta'
              )}
            </Button>

            {/* Divisor */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-900 text-gray-400">Ou regista-te com</span>
              </div>
            </div>

            {/* Botão Google */}
            <Button
              type="button"
              onClick={handleGoogleRegister}
              disabled={isLoading}
              className="w-full bg-white hover:bg-gray-100 text-gray-900"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  A processar...
                </>
              ) : (
                <>
                  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Já tens uma conta?{' '}
              <Link href="/login" className="text-[#D2A63C] hover:underline font-medium">
                Iniciar Sessão
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
