import type { JWTPayload } from '../types'

function b64DecodeUnicode(str: string): string {
  return decodeURIComponent(
    atob(str)
      .split('')
      .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
      .join(''),
  )
}

export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.')

    if (parts.length !== 3) return null
    const payload = b64DecodeUnicode(
      parts[1].replace(/-/g, '+').replace(/_/g, '/'),
    )

    return JSON.parse(payload) as JWTPayload
  } catch (e) {
    console.error('Avacar: Failed to decode JWT', e)

    return null
  }
}
