import { db, type Member } from "./database-service"

// Serviço para gerenciar operações relacionadas a membros
export class MemberService {
  private static instance: MemberService

  // Singleton pattern
  public static getInstance(): MemberService {
    if (!MemberService.instance) {
      MemberService.instance = new MemberService()
    }
    return MemberService.instance
  }

  // Registrar um novo membro
  public async registerMember(memberData: Omit<Member, "id" | "createdAt">): Promise<Member> {
    try {
      // Verificar se o usuário já existe
      const existingMembers = await db.query<Member>("members", {
        username: memberData.username,
      })

      if (existingMembers.length > 0) {
        throw new Error("Usuário já existe")
      }

      // Criar novo membro
      const newMember = await db.create<Member>("members", {
        ...memberData,
        id: "", // Será gerado pelo serviço de banco de dados
        createdAt: new Date(),
      })

      return newMember
    } catch (error) {
      console.error("Erro ao registrar membro:", error)
      throw error
    }
  }

  // Obter todos os membros
  public async getAllMembers(): Promise<Member[]> {
    return await db.getAll<Member>("members")
  }

  // Obter membro por ID
  public async getMemberById(id: string): Promise<Member | null> {
    return await db.getById<Member>("members", id)
  }

  // Obter membro por nome de usuário
  public async getMemberByUsername(username: string): Promise<Member | null> {
    const members = await db.query<Member>("members", { username })
    return members.length > 0 ? members[0] : null
  }

  // Atualizar membro
  public async updateMember(id: string, data: Partial<Member>): Promise<Member | null> {
    return await db.update<Member>("members", id, data)
  }

  // Atualizar função do membro
  public async updateMemberRole(id: string, role: string): Promise<Member | null> {
    return await db.update<Member>("members", id, { role })
  }

  // Atualizar pacote do membro
  public async updateMemberPackage(id: string, packageId: string): Promise<Member | null> {
    return await db.update<Member>("members", id, { package: packageId })
  }

  // Registrar login do membro
  public async recordLogin(id: string): Promise<void> {
    await db.update<Member>("members", id, { lastLogin: new Date() })
  }

  // Excluir membro
  public async deleteMember(id: string): Promise<boolean> {
    return await db.delete("members", id)
  }

  // Obter estatísticas de membros
  public async getMemberStats(): Promise<{
    total: number
    activeLastMonth: number
    byRole: Record<string, number>
    byPackage: Record<string, number>
  }> {
    const members = await this.getAllMembers()
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

    const stats = {
      total: members.length,
      activeLastMonth: members.filter((m) => m.lastLogin && new Date(m.lastLogin) > oneMonthAgo).length,
      byRole: {} as Record<string, number>,
      byPackage: {} as Record<string, number>,
    }

    // Contar por função
    members.forEach((member) => {
      const role = member.role || "Sem função"
      stats.byRole[role] = (stats.byRole[role] || 0) + 1
    })

    // Contar por pacote
    members.forEach((member) => {
      const pkg = member.package || "Sem pacote"
      stats.byPackage[pkg] = (stats.byPackage[pkg] || 0) + 1
    })

    return stats
  }
}

// Exportar instância singleton
export const memberService = MemberService.getInstance()
