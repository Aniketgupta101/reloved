/** Giver-facing claimer line: "{name} from {landmark} wants to Relove your {item} 💗" */

export function claimerDisplayName(opts: {
  name?: string | null
  username?: string | null
}): string {
  const user = String(opts.username || "")
    .trim()
    .replace(/^@+/, "")
  if (user) return user
  const name = String(opts.name || "").trim()
  if (!name) return "Someone"
  // Prefer first name for a short, friendly line
  return name.split(/\s+/)[0] || name
}

export function claimerReloveHeadline(opts: {
  name?: string | null
  username?: string | null
  landmark?: string | null
  itemTitle?: string | null
}): string {
  const who = claimerDisplayName(opts)
  const landmark = String(opts.landmark || "").trim()
  const title = String(opts.itemTitle || "item").trim() || "item"
  if (landmark) return `${who} from ${landmark} wants to Relove your ${title} 💗`
  return `${who} wants to Relove your ${title} 💗`
}
