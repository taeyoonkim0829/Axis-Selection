import type { Status, VerticalDirection } from '../calc/types'

export function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const d = abs >= 1000 ? 0 : abs >= 100 ? Math.min(digits, 1) : digits
  return value.toLocaleString('ko-KR', { maximumFractionDigits: d })
}

/** Force in kgf (standard gravity 9.80665 N/kgf), e.g. "≈ 102 kgf". */
export function kgf(newton: number): string {
  return `≈ ${fmt(newton / 9.80665, 1)} kgf`
}

export function pct(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—'
  return `${Math.round(ratio * 100)}%`
}

export const statusLabel: Record<Status, string> = { ok: '적합', warn: '주의', fail: '부적합' }

export const mountingLabel = { floor: '바닥', wall: '벽면', vertical: '수직' } as const

export const driveLabel = { belt: '벨트', spindle: '볼스크류' } as const

export const pressDirectionLabel = { down: '위→아래 (눌러 내림)', up: '아래→위 (밀어 올림)' } as const

/** Name of one move: forward/return, or up/down on a vertical axis (`verticalForward`: direction of the forward move). */
export const moveLabel = (back: boolean, vertical: VerticalDirection | null) => {
  if (!vertical) return back ? '복귀' : '전진'
  return (vertical === 'up') !== back ? '상승' : '하강'
}
