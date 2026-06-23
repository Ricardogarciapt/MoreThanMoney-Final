import type { ParsedSignal } from './signal-parser'
import type { AiSignalValidation } from './signal-ai-validator'
import type { MtmcopyChannelKey } from './channel-context'
import type { MtmChannelProvider } from './provider-accounts'
import type { MTMcopierConnection } from './types'

export interface SignalJob {
  id: string
  raw: string
  parsed: ParsedSignal
  validation: AiSignalValidation
  channel: MtmcopyChannelKey
  subscribers: MTMcopierConnection[]
  provider?: MtmChannelProvider | null
  telegramMessageId?: number
  createdAt: number
  retries: number
  maxRetries: number
  processingStarted?: number
  processingError?: string
}

interface JobStats {
  processedCount: number
  failedCount: number
  avgLatencyMs: number
  lastProcessedAt?: number
}

class SignalQueueProcessor {
  private queue: SignalJob[] = []
  private processing = false
  private concurrency = 5
  private activeJobs = 0
  private stats: JobStats = {
    processedCount: 0,
    failedCount: 0,
    avgLatencyMs: 0,
  }
  private deadLetterQueue: SignalJob[] = []

  constructor(concurrency = 5) {
    this.concurrency = concurrency
  }

  enqueue(job: SignalJob): void {
    this.queue.push(job)
    void this.process()
  }

  private async process(): Promise<void> {
    if (this.processing || this.activeJobs >= this.concurrency) {
      return
    }

    this.processing = true

    while (this.queue.length > 0 && this.activeJobs < this.concurrency) {
      const job = this.queue.shift()
      if (!job) break

      this.activeJobs++
      void this.executeJob(job)
    }

    this.processing = false
  }

  private async executeJob(job: SignalJob): Promise<void> {
    const jobStart = Date.now()

    try {
      job.processingStarted = Date.now()

      const { executeViaMtmProvider } = await import('./processor-async')
      await executeViaMtmProvider(
        job.subscribers,
        job.parsed,
        job.raw,
        job.telegramMessageId,
        job.provider,
        job.channel,
        job.validation,
      )

      const latency = Date.now() - jobStart
      this.updateStats(true, latency)

      console.log(`[signal-queue] ✅ Job ${job.id} completed in ${latency}ms`)
    } catch (error) {
      job.retries++

      if (job.retries < job.maxRetries) {
        job.processingError = error instanceof Error ? error.message : String(error)
        console.warn(
          `[signal-queue] ⚠️ Job ${job.id} failed (retry ${job.retries}/${job.maxRetries}): ${job.processingError}`,
        )
        this.queue.push(job)
        void this.process()
      } else {
        this.deadLetterQueue.push({
          ...job,
          processingError: error instanceof Error ? error.message : String(error),
        })
        this.updateStats(false, Date.now() - jobStart)
        console.error(`[signal-queue] ❌ Job ${job.id} exhausted retries`)
      }
    } finally {
      this.activeJobs--
      void this.process()
    }
  }

  private updateStats(success: boolean, latencyMs: number): void {
    if (success) {
      this.stats.processedCount++
      this.stats.avgLatencyMs =
        (this.stats.avgLatencyMs * (this.stats.processedCount - 1) + latencyMs) /
        this.stats.processedCount
      this.stats.lastProcessedAt = Date.now()
    } else {
      this.stats.failedCount++
    }
  }

  getStats(): JobStats {
    return { ...this.stats }
  }

  getQueueSize(): number {
    return this.queue.length
  }

  getDeadLetterQueueSize(): number {
    return this.deadLetterQueue.length
  }

  getDeadLetterQueue(): SignalJob[] {
    return [...this.deadLetterQueue]
  }

  drain(): void {
    this.queue = []
  }

  async waitUntilEmpty(timeoutMs = 10000): Promise<boolean> {
    const start = Date.now()
    while (this.queue.length > 0 || this.activeJobs > 0) {
      if (Date.now() - start > timeoutMs) return false
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return true
  }
}

let globalQueue: SignalQueueProcessor | null = null

export function initSignalQueue(concurrency = 5): SignalQueueProcessor {
  if (!globalQueue) {
    globalQueue = new SignalQueueProcessor(concurrency)
  }
  return globalQueue
}

export function getSignalQueue(): SignalQueueProcessor {
  if (!globalQueue) {
    globalQueue = new SignalQueueProcessor()
  }
  return globalQueue
}

export function createSignalJob(
  raw: string,
  parsed: ParsedSignal,
  validation: AiSignalValidation,
  channel: MtmcopyChannelKey,
  subscribers: MTMcopierConnection[],
  provider?: MtmChannelProvider | null,
  telegramMessageId?: number,
): SignalJob {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    raw,
    parsed,
    validation,
    channel,
    subscribers,
    provider,
    telegramMessageId,
    createdAt: Date.now(),
    retries: 0,
    maxRetries: 2,
  }
}
