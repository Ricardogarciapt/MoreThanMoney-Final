import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration is missing")
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient()
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '7days'
    
    // Calcular datas baseadas no range
    const now = new Date()
    const startDate = new Date()
    
    switch (range) {
      case '24hours':
        startDate.setHours(now.getHours() - 24)
        break
      case '7days':
        startDate.setDate(now.getDate() - 7)
        break
      case '30days':
        startDate.setDate(now.getDate() - 30)
        break
      case '90days':
        startDate.setDate(now.getDate() - 90)
        break
    }

    // 1. User Statistics
    const { data: users } = await supabase
      .from('profiles')
      .select('id, is_active, created_at, last_login')
      .gte('created_at', startDate.toISOString())

    const { data: allUsers } = await supabase
      .from('profiles')
      .select('id, is_active, created_at')

    const userStats = {
      total: allUsers?.length || 0,
      active: allUsers?.filter(u => u.is_active).length || 0,
      newThisWeek: users?.length || 0,
      retention: allUsers?.length ? Math.round((allUsers.filter(u => u.is_active).length / allUsers.length) * 100) : 0
    }

    // 2. Email Statistics
    const { data: emailStats } = await supabase
      .from('email_campaigns')
      .select('emails_sent, emails_opened, emails_clicked, emails_bounced, sent_at')
      .not('emails_sent', 'is', null)
      .gte('sent_at', startDate.toISOString())

    const emailData = {
      totalSent: emailStats?.reduce((sum, c) => sum + (c.emails_sent || 0), 0) || 0,
      totalOpened: emailStats?.reduce((sum, c) => sum + (c.emails_opened || 0), 0) || 0,
      totalClicked: emailStats?.reduce((sum, c) => sum + (c.emails_clicked || 0), 0) || 0,
      totalBounced: emailStats?.reduce((sum, c) => sum + (c.emails_bounced || 0), 0) || 0
    }

    const emailMarketingStats = {
      totalSent: emailData.totalSent,
      openRate: emailData.totalSent > 0 ? Math.round((emailData.totalOpened / emailData.totalSent) * 100) : 0,
      clickRate: emailData.totalSent > 0 ? Math.round((emailData.totalClicked / emailData.totalSent) * 100) : 0,
      bounceRate: emailData.totalSent > 0 ? Math.round((emailData.totalBounced / emailData.totalSent) * 100) : 0
    }

    // 3. Content Statistics (simulados - precisariam ser implementados)
    const contentStats = {
      totalViews: Math.floor(Math.random() * 10000) + 5000,
      uniqueVisitors: Math.floor(Math.random() * 2000) + 1000,
      avgTimeOnSite: Math.floor(Math.random() * 300) + 180, // segundos
      pagesPerSession: Math.floor(Math.random() * 3) + 2
    }

    // 4. Documentos Statistics
    const { data: documents } = await supabase
      .from('documents')
      .select('view_count')
      .gte('created_at', startDate.toISOString())

    const totalDocumentViews = documents?.reduce((sum, doc) => sum + (doc.view_count || 0), 0) || 0

    // 5. Social Feed Statistics
    const { data: posts } = await supabase
      .from('posts')
      .select('id, created_at, likes_count, comments_count')
      .gte('created_at', startDate.toISOString())

    const { data: allPosts } = await supabase
      .from('posts')
      .select('id, likes_count, comments_count')

    const { data: likes } = await supabase
      .from('post_likes')
      .select('post_id')
      .gte('created_at', startDate.toISOString())

    const { data: comments } = await supabase
      .from('post_comments')
      .select('post_id')
      .gte('created_at', startDate.toISOString())

    const totalLikes = allPosts?.reduce((sum, post) => sum + (post.likes_count || 0), 0) || 0
    const totalComments = allPosts?.reduce((sum, post) => sum + (post.comments_count || 0), 0) || 0
    const newPosts = posts?.length || 0
    const avgEngagement = newPosts > 0 
      ? Math.round(((likes?.length || 0) + (comments?.length || 0)) / newPosts)
      : 0

    const socialStats = {
      totalPosts: allPosts?.length || 0,
      newPosts,
      totalLikes,
      totalComments,
      avgEngagement
    }

    const analyticsData = {
      userStats,
      emailStats: emailMarketingStats,
      contentStats,
      socialStats,
      documentStats: {
        totalDocuments: documents?.length || 0,
        totalViews: totalDocumentViews
      },
      metadata: {
        range,
        generatedAt: new Date().toISOString(),
        startDate: startDate.toISOString(),
        endDate: now.toISOString()
      }
    }

    return NextResponse.json({
      success: true,
      data: analyticsData
    })
  } catch (error) {
    console.error('[ANALYTICS] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro ao carregar analytics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
