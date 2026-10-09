import type { DayHours, DayKey, OpenState, Pharmacy } from '../types'

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const DAY_LABEL: Record<DayKey, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일', holiday: '공휴일',
}
export const WEEK_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'holiday']

// 2026년 공휴일(대체공휴일 포함). 매년 갱신 필요.
const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02',
  '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-03', '2026-06-06', '2026-08-15',
  '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05',
  '2026-10-09', '2026-12-25',
])

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function isHoliday(d: Date): boolean {
  return HOLIDAYS_2026.has(ymd(d))
}

export function todayKey(d: Date): DayKey {
  return isHoliday(d) ? 'holiday' : DAY_KEYS[d.getDay()]
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 공휴일은 공휴일 시간을 우선. 공휴일 정보가 없으면 정보 없음으로 둔다. */
export function hoursFor(p: Pharmacy, d: Date): DayHours | undefined {
  return p.hours[todayKey(d)]
}

export function openState(p: Pharmacy, d: Date): OpenState {
  const h = hoursFor(p, d)
  if (h === undefined) return 'unknown'
  if (h === null) return 'closed'
  const now = d.getHours() * 60 + d.getMinutes()
  const start = toMinutes(h[0])
  const end = toMinutes(h[1])
  if (now < start || now >= end) return 'closed'
  return end - now <= 60 ? 'closing' : 'open'
}

export const STATE_LABEL: Record<OpenState, string> = {
  open: '영업 중', closing: '곧 종료', closed: '종료', unknown: '정보 없음',
}

export function formatHours(h: DayHours | undefined): string {
  if (h === undefined) return '정보 없음'
  if (h === null) return '휴무'
  return `${h[0]} ~ ${h[1]}`
}

/** 24시간 영업 또는 22시 이후까지 영업이면 야간으로 본다 (평일 기준). */
export function isNight(p: Pharmacy): boolean {
  return p.tags.includes('night')
}

export function hasHolidayHours(p: Pharmacy): boolean {
  return Array.isArray(p.hours.holiday)
}
