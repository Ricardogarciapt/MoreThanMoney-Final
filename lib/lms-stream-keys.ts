import { randomBytes } from "crypto"

/**
 * Chave de ingestão no servidor RTMP More Than Money (HLS).
 * Formato distinto das chaves Restream (definidas pelo painel Restream).
 */
export function generateMtmIngestStreamKey(educatorId: string): string {
  const token = randomBytes(16).toString("hex")
  const shortEducator = educatorId.replace(/-/g, "").slice(0, 8)
  return `mtm_${shortEducator}_${token}`
}
