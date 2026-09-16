export interface UserManagement {
  id: string
  email: string
  username: string
  full_name?: string
  user_type: 'member' | 'admin' | 'vip' | 'pending' | 'guest' | 'presentation' | 'inactive' | 'affiliate'
  membership_level: 'basic' | 'premium' | 'vip' | 'iq' | 'skool'
  member_category?: 'iq' | 'skool' | 'vip' | 'standard' | 'premium'
  onboarding_platform?: 'vxa' | 'rfg' | null
  is_active: boolean
  is_verified: boolean
  created_at: string
  last_login?: string
  trial_expires_at?: string
  trial_expired?: boolean
  // Subscription
  subscription_plan?: 'app_member' | 'premium' | null
  subscription_platform?: 'app_store' | 'skool' | 'web' | 'manual' | 'stripe' | null
  skool_access_pending?: boolean
  access_validation_pending?: boolean
  access_validation_member_id?: string | null
  access_validation_proof_url?: string | null
  access_revalidation_required?: boolean
  subscription_billing_cycle?: 'monthly' | 'annual' | null
  subscription_expires_at?: string | null
  subscription_auto_renew?: boolean | null
  subscription_renewal_count?: number | null
  subscription_status?: 'active' | 'grace_period' | 'billing_retry' | 'expired' | 'cancelled' | 'refunded' | null
  subscription_days_remaining?: number | null
  coupon_code?: string | null
  broker_uid?: string | null
  tradingview_username?: string | null
  mtmcopy_subscription_active?: boolean | null
  mtmcopy_subscription_expires_at?: string | null
  profile_data?: Record<string, any>
  xp?: {
    total_xp: number
    level: number
  }
  fast_start?: {
    progress_percent: number
    steps_completed: number
  }
}

export interface AdminStats {
  total_users: number
  active_users: number
  pending_users: number
  total_members: number
  total_content: number
  active_content: number
  skool_pending_stripe?: number
  recent_activity: ActivityLog[]
}

export interface ActivityLog {
  id: string
  user_id: string
  user_email: string
  action: 'login' | 'logout' | 'content_created' | 'content_updated' | 'content_deleted' | 'user_approved' | 'user_role_changed' | 'email_verified' | 'registration_notification' | 'user_rejected'
  details: string
  timestamp: string
}

export interface AdminSettings {
  site_name: string
  site_description: string
  maintenance_mode: boolean
  registration_enabled: boolean
  auto_approve_users: boolean
  email_notifications: boolean
  default_user_role: 'member' | 'admin'
  theme_settings: Record<string, any>
}
