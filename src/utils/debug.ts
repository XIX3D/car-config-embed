/**
 * Diagnostics that survive minification.
 *
 * WHY THIS EXISTS
 *
 * The build used to set `drop_console: true`, which strips every `console.*` call. The
 * widget therefore failed *silently* on a customer page: a deactivated embed token, a
 * network error and a malformed JWT all produced the same symptom — no button, empty
 * console — with no way to tell them apart from a deployed site. That cost real debugging
 * time on the v2 comparison page.
 *
 * `console.log` and friends are still stripped (they were noise). These go through
 * `console.warn`/`console.error`, which the build keeps, so a failure always says why.
 *
 * Every message is prefixed so it is obvious which script is talking on a page that embeds
 * more than one build — the comparison page runs v1 and v2 side by side.
 */

const PREFIX = '[avacar]'

/**
 * Something went wrong that stops the widget doing its job. Always visible.
 */
export function debugError(message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.error(`${PREFIX} ${message}`)

    return
  }

  console.error(`${PREFIX} ${message}`, detail)
}

/**
 * Something the operator should know but which is not a failure — a deliberately hidden
 * button, a fallback being taken. Always visible, because these are exactly the cases that
 * look like bugs from outside.
 */
export function debugWarn(message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.warn(`${PREFIX} ${message}`)

    return
  }

  console.warn(`${PREFIX} ${message}`, detail)
}

/**
 * Step-by-step tracing, off unless explicitly switched on.
 *
 * Enable from the page with `localStorage.setItem('avacar:debug', '1')` and reload, or by
 * adding `?avacarDebug=1` to the URL. Routed through `console.warn` so the minifier keeps
 * it — a trace facility that gets stripped is useless precisely when it is needed.
 */
export function debugTrace(message: string, detail?: unknown): void {
  if (!isTraceEnabled()) return

  if (detail === undefined) {
    console.warn(`${PREFIX} ${message}`)

    return
  }

  console.warn(`${PREFIX} ${message}`, detail)
}

let traceCache: boolean | null = null

function isTraceEnabled(): boolean {
  if (traceCache !== null) return traceCache

  traceCache = false

  try {
    if (typeof window === 'undefined') return traceCache

    if (window.localStorage?.getItem('avacar:debug') === '1') {
      traceCache = true
    } else if (window.location?.search?.includes('avacarDebug=1')) {
      traceCache = true
    }
  } catch {
    // Storage can throw in a sandboxed iframe or with cookies blocked. Tracing off is the
    // right answer there, and it must not take the widget down with it.
    traceCache = false
  }

  return traceCache
}
