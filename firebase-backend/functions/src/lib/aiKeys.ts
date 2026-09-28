/**
 * Multi-key API rotation for Gemini + Groq.
 * On quota / auth failure, cool the key briefly and try the next — never stall Give.
 */

const KEY_COOLDOWN_MS = 90_000
const KEY_COOLDOWN_QUOTA_MS = 10 * 60_000 // 429 / quota — wait longer before retrying that key

type PoolState = {
  preferred: number
  cooldownUntil: Map<string, number>
}

const pools = new Map<string, PoolState>()

function poolState(name: string): PoolState {
  let s = pools.get(name)
  if (!s) {
    s = { preferred: 0, cooldownUntil: new Map() }
    pools.set(name, s)
  }
  return s
}

function splitKeys(raw: string): string[] {
  return raw
    .split(/[,;\n\r]+/)
    .map((k) => k.trim())
    .filter(Boolean)
}

/** Collect keys from CSV env + numbered env vars (FOO, FOO_KEYS, FOO_1..FOO_9). */
export function loadApiKeys(primaryEnv: string, ...aliases: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (k: string) => {
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(k)
  }

  for (const name of [primaryEnv, `${primaryEnv}S`, ...aliases]) {
    for (const k of splitKeys(process.env[name] || "")) push(k)
  }
  // Numbered: GEMINI_API_KEY_1 … GEMINI_API_KEY_9
  for (let i = 1; i <= 9; i++) {
    push(String(process.env[`${primaryEnv}_${i}`] || "").trim())
  }
  return out
}

export function getGeminiApiKeys(): string[] {
  return loadApiKeys("GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "GEMINI_API_KEYS", "GOOGLE_AI_API_KEYS")
}

export function getGroqApiKeys(): string[] {
  return loadApiKeys("GROQ_API_KEY", "GROQ_API_KEYS")
}

export function isKeyFailureError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || "")).toLowerCase()
  return (
    /\b(401|403|429)\b/.test(msg) ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("too many requests") ||
    msg.includes("permission_denied") ||
    msg.includes("api key not valid") ||
    msg.includes("invalid api key") ||
    msg.includes("incorrect api key") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("billing") ||
    msg.includes("exhausted")
  )
}

function availableKeys(poolName: string, keys: string[]): string[] {
  const now = Date.now()
  const state = poolState(poolName)
  const ready = keys.filter((k) => (state.cooldownUntil.get(k) || 0) <= now)
  return ready.length > 0 ? ready : keys // if all cooling, try all anyway
}

function markKeyFailed(poolName: string, key: string, err: unknown): void {
  if (!isKeyFailureError(err)) return
  const msg = (err instanceof Error ? err.message : String(err || "")).toLowerCase()
  const coolMs =
    /\b429\b/.test(msg) || msg.includes("quota") || msg.includes("resource_exhausted")
      ? KEY_COOLDOWN_QUOTA_MS
      : KEY_COOLDOWN_MS
  const state = poolState(poolName)
  state.cooldownUntil.set(key, Date.now() + coolMs)
  console.warn(`[aiKeys] ${poolName} key …${key.slice(-6)} cooling ${coolMs / 1000}s`)
}

/**
 * Try each key in the pool. Sticky preferred index after success.
 * Throws the last error if every key fails.
 */
export async function withApiKeyRotation<T>(
  poolName: string,
  keys: string[],
  fn: (apiKey: string, keyIndex: number) => Promise<T>,
): Promise<T> {
  if (!keys.length) {
    throw new Error(`No ${poolName} API keys configured`)
  }
  const state = poolState(poolName)
  const ordered = availableKeys(poolName, keys)
  // Start from preferred among currently ordered list
  const start =
    ordered.findIndex((k) => k === keys[state.preferred % keys.length]) >= 0
      ? ordered.findIndex((k) => k === keys[state.preferred % keys.length])
      : 0

  let lastError: unknown = null
  for (let i = 0; i < ordered.length; i++) {
    const idx = (start + i) % ordered.length
    const key = ordered[idx]
    try {
      const result = await fn(key, keys.indexOf(key))
      state.preferred = Math.max(0, keys.indexOf(key))
      return result
    } catch (err) {
      lastError = err
      markKeyFailed(poolName, key, err)
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[aiKeys] ${poolName} key …${key.slice(-6)} failed:`, msg.slice(0, 180))
      // Model/content failures shouldn't rotate the whole key pool.
      if ((err as { skipKeyRotation?: boolean })?.skipKeyRotation) throw err
      if (!isKeyFailureError(err) && ordered.length === 1) throw err
      // Quota/auth (or multi-key pool): try the next key so Give keeps moving.
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError || `${poolName} exhausted all keys`))
}
