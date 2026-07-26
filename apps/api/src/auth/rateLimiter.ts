export interface AiRateLimitResult {
  limit: number
  remaining: number
  resetAt: number
}

export interface AiRateLimiter {
  consume(key: string, now?: number): AiRateLimitResult
}

interface RateWindow {
  count: number
  resetAt: number
}

export class InMemoryAiRateLimiter implements AiRateLimiter {
  private readonly windows = new Map<string, RateWindow>()
  private readonly limit: number

  constructor(
    limit = 60,
    private readonly windowMs = 60_000,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('速率限制必须是正整数')
    if (!Number.isInteger(windowMs) || windowMs < 1) throw new Error('速率限制窗口必须是正整数')
    this.limit = limit
  }

  consume(key: string, now = Date.now()): AiRateLimitResult {
    const normalizedKey = key.trim()
    if (!normalizedKey) throw new Error('速率限制 key 不能为空')

    const current = this.windows.get(normalizedKey)
    const window = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + this.windowMs }
      : current

    if (window.count >= this.limit) {
      throw new AiRateLimitError(
        this.limit,
        window.resetAt,
        'AI 请求过于频繁，请稍后重试',
      )
    }

    window.count += 1
    this.windows.set(normalizedKey, window)
    this.pruneExpired(now)

    return {
      limit: this.limit,
      remaining: Math.max(0, this.limit - window.count),
      resetAt: window.resetAt,
    }
  }

  private pruneExpired(now: number): void {
    if (this.windows.size < 1_000) return
    for (const [key, value] of this.windows) {
      if (value.resetAt <= now) this.windows.delete(key)
    }
  }
}

export class AiRateLimitError extends Error {
  constructor(
    readonly limit: number,
    readonly resetAt: number,
    message: string,
  ) {
    super(message)
    this.name = 'AiRateLimitError'
  }
}
