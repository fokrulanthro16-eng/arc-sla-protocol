export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function formatUsdc(rawAmount: bigint, decimals = 6): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = rawAmount / divisor
  const frac = rawAmount % divisor
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`
}

export function parseUsdc(amount: string, decimals = 6): bigint {
  const [whole, frac = ''] = amount.split('.')
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0')
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')
}

export function formatTimestamp(ts: bigint): string {
  const d = new Date(Number(ts) * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export const STATUS_LABELS: Record<number, string> = {
  0: 'LOCKED IN ESCROW',
  1: '90/10 SPLIT PAID',
  2: 'SLA BREACH REFUNDED',
  3: 'EMERGENCY RECLAIMED',
}

export const STATUS_COLORS: Record<number, string> = {
  0: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10',
  1: 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--success)]/10',
  2: 'text-[var(--danger)] border-[var(--danger)]/40 bg-[var(--danger)]/10',
  3: 'text-[var(--subtle)] border-[var(--subtle)]/40 bg-[var(--subtle)]/10',
}
