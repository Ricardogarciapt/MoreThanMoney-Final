import jwt from "jsonwebtoken"

const COOKIE_NAME = "mtm_educator_token"
const JWT_SECRET = process.env.LMS_EDUCATOR_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "mtm-lms-dev-secret"
const EXPIRES_IN = "12h"

export interface EducatorJwtPayload {
  educatorId: string
  email: string
  displayName: string
}

export function signEducatorToken(payload: EducatorJwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN })
}

export function verifyEducatorToken(token: string): EducatorJwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as EducatorJwtPayload
  } catch {
    return null
  }
}

export function getEducatorCookieName() {
  return COOKIE_NAME
}

