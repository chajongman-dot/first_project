export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | 'holiday'

/** [시작, 종료] "HH:MM". 종료 "24:00" 허용. null이면 휴무, 키가 없으면 정보 없음 */
export type DayHours = [string, string] | null

export type Tag = 'large' | 'discount' | 'night'

export interface Pharmacy {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  hours: Partial<Record<DayKey, DayHours>>
  tags: Tag[]
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
  large: boolean
}
