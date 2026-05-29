"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  Trophy, 
  Users, 
  TrendingUp, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Search,
  Loader2
} from "lucide-react"
import { supabase } from "@/lib/supabase"

interface FastStartProgress {
  id: string
  user_id: string
  user_email: string
  user_name: string
  step_1_completed: boolean
  step_2_completed: boolean
  step_3_completed: boolean
  step_4_completed: boolean
  step_5_completed: boolean
  step_6_completed: boolean
  progress_percent: number
  created_at: string
  updated_at: string
}

interface FastStartStats {
  total_users: number
  completed_users: number
  average_progress: number
  step_completions: {
    step_1: number
    step_2: number
    step_3: number
    step_4: number
    step_5: number
    step_6: number
  }
}

export default function FastStartManager() {
  const [progress, setProgress] = useState<FastStartProgress[]>([])
  const [stats, setStats] = useState<FastStartStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [resetting, setResetting] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      await Promise.all([loadProgress(), loadStats()])
    } catch (error) {
      console.error('❌ [FAST_START_ADMIN] Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadProgress = async () => {
    try {
      // Buscar progresso
      const { data: progressData, error: progressError } = await supabase
        .from('fast_start_progress')
        .select('*')
        .order('updated_at', { ascending: false })

      if (progressError) throw progressError

      // Buscar informações dos usuários
      const userIds = progressData?.map(p => p.user_id) || []
      
      if (userIds.length === 0) {
        setProgress([])
        return
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, username')
        .in('id', userIds)

      if (profilesError) throw profilesError

      // Mapear perfis por ID
      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || [])

      const formatted = progressData?.map((item: any) => {
        const profile = profilesMap.get(item.user_id)
        return {
          id: item.id,
          user_id: item.user_id,
          user_email: profile?.email || 'N/A',
          user_name: profile?.full_name || profile?.username || 'N/A',
          step_1_completed: item.step_1_completed || false,
          step_2_completed: item.step_2_completed || false,
          step_3_completed: item.step_3_completed || false,
          step_4_completed: item.step_4_completed || false,
          step_5_completed: item.step_5_completed || false,
          step_6_completed: item.step_6_completed || false,
          progress_percent: item.progress_percent || 0,
          created_at: item.created_at,
          updated_at: item.updated_at
        }
      }) || []

      setProgress(formatted)
    } catch (error) {
      console.error('❌ [FAST_START_ADMIN] Erro ao carregar progresso:', error)
    }
  }

  const loadStats = async () => {
    try {
      const { data: allProgress, error } = await supabase
        .from('fast_start_progress')
        .select('*')

      if (error) throw error

      const total = allProgress?.length || 0
      const completed = allProgress?.filter(p => p.progress_percent === 100).length || 0
      
      const totalProgress = allProgress?.reduce((sum, p) => sum + (p.progress_percent || 0), 0) || 0
      const average = total > 0 ? Math.round(totalProgress / total) : 0

      const stepCompletions = {
        step_1: allProgress?.filter(p => p.step_1_completed).length || 0,
        step_2: allProgress?.filter(p => p.step_2_completed).length || 0,
        step_3: allProgress?.filter(p => p.step_3_completed).length || 0,
        step_4: allProgress?.filter(p => p.step_4_completed).length || 0,
        step_5: allProgress?.filter(p => p.step_5_completed).length || 0,
        step_6: allProgress?.filter(p => p.step_6_completed).length || 0,
      }

      setStats({
        total_users: total,
        completed_users: completed,
        average_progress: average,
        step_completions
      })
    } catch (error) {
      console.error('❌ [FAST_START_ADMIN] Erro ao carregar estatísticas:', error)
    }
  }

  const resetUserProgress = async (userId: string) => {
    if (!confirm('Tem certeza que deseja resetar o progresso deste usuário?')) {
      return
    }

    try {
      setResetting(userId)
      
      const { error } = await supabase
        .from('fast_start_progress')
        .delete()
        .eq('user_id', userId)

      if (error) throw error

      await loadData()
      alert('✅ Progresso resetado com sucesso!')
    } catch (error) {
      console.error('❌ [FAST_START_ADMIN] Erro ao resetar progresso:', error)
      alert('❌ Erro ao resetar progresso')
    } finally {
      setResetting(null)
    }
  }

  const filteredProgress = progress.filter(p => {
    const search = searchTerm.toLowerCase()
    return (
      p.user_email.toLowerCase().includes(search) ||
      p.user_name.toLowerCase().includes(search)
    )
  })

  const getStepBadge = (completed: boolean) => {
    return completed ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-gray-400" />
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total de Utilizadores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.total_users}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Concluído</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <div className="text-2xl font-bold">{stats.completed_users}</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.total_users > 0 
                  ? Math.round((stats.completed_users / stats.total_users) * 100) 
                  : 0}% taxa de conclusão
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Progresso Médio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <div className="text-2xl font-bold">{stats.average_progress}%</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Passo Mais Completado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.max(
                  stats.step_completions.step_1,
                  stats.step_completions.step_2,
                  stats.step_completions.step_3,
                  stats.step_completions.step_4,
                  stats.step_completions.step_5,
                  stats.step_completions.step_6
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela de Progresso */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Progresso dos Utilizadores</CardTitle>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar utilizador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <Button onClick={loadData} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilizador</TableHead>
                <TableHead>Passos</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead>Atualizado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProgress.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum progresso encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredProgress.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.user_name}</div>
                        <div className="text-sm text-muted-foreground">{item.user_email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        {getStepBadge(item.step_1_completed)}
                        {getStepBadge(item.step_2_completed)}
                        {getStepBadge(item.step_3_completed)}
                        {getStepBadge(item.step_4_completed)}
                        {getStepBadge(item.step_5_completed)}
                        {getStepBadge(item.step_6_completed)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Progress value={item.progress_percent} className="w-24" />
                        <span className="text-sm font-medium">{item.progress_percent}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {new Date(item.updated_at).toLocaleDateString('pt-PT')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => resetUserProgress(item.user_id)}
                        disabled={resetting === item.user_id}
                      >
                        {resetting === item.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Resetar
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
