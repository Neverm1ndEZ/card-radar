'use client'

const STORAGE_KEY = 'cardradar_device_id'

function generateFingerprint(): string {
  const parts = [
    navigator.userAgent,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ].join('|')

  // Simple djb2 hash — no crypto API needed
  let hash = 5381
  for (let i = 0; i < parts.length; i++) {
    hash = (hash << 5) + hash + parts.charCodeAt(i)
    hash = hash & hash // force 32-bit
  }
  return Math.abs(hash).toString(36)
}

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
    const id = generateFingerprint() + '-' + Date.now().toString(36)
    localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2)
  }
}
