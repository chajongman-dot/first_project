export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | 'holiday'

/** [시작, 종료] "HH:MM". 종료 "24:00" 허용. null이면 휴무, 키가 없으면 정보 없음 */
export type DayHours = [string, string] | null

export type Tag = 'warehouse' | 'night'

export interface Pharmacy {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  hours: Partial<Record<DayKey, DayHours>>
  tags: Tag[]
  /** 위치 안내 문구 (예: "세류사거리남문방향50m") */
  guide?: string
  source: string
  updated_at: string
}

export interface ParkingLot {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  capacity: number
  operating_hours: string
  fee_known: boolean
  fee_type: string
  free_minutes: number
  base_minutes: number
  base_fee: number
  extra_unit_minutes: number
  extra_unit_fee: number
  daily_max_fee: number | null
  updated_at: string
}

export type OpenState = 'open' | 'closing' | 'closed' | 'unknown'

export type Filters = {
  openNow: boolean
  night: boolean
  holiday: boolean
  warehouse: boolean
  /** 검색한 동네(지역)에 속한 약국만 */
  area: boolean
}
