import { createSession } from './session'

const KEY = 'xix3d:visitor_id'

let memo: string | null = null

/**
 * A random id for this browser, kept across visits, so a brand's per-visitor render limit
 * (backend R1) sees one visitor rather than a new one on every open. Not personal data: a random
 * UUID, nothing derived from the device.
 *
 * Storage throws in a sandboxed iframe or with site data blocked; the id then lives only as long
 * as the page, which is still one visitor per visit.
 */
export function getVisitorId(): string {
  if (memo) return memo

  try {
    const stored = window.localStorage.getItem(KEY)

    if (stored) {
      memo = stored

      return stored
    }
  } catch { /* storage blocked */ }

  memo = createSession()

  try {
    window.localStorage.setItem(KEY, memo)
  } catch { /* storage blocked: in memory only */ }

  return memo
}
