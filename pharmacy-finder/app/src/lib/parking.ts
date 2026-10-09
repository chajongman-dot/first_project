import type { ParkingLot } from '../types'

/** 예상 주차요금(원). 0이면 무료. 규칙은 PRD 10절. */
export function parkingFee(lot: ParkingLot, minutes: number): number {
  if (minutes <= lot.free_minutes) return 0
  let fee = lot.base_fee
  if (minutes > lot.base_minutes) {
    const extra = minutes - lot.base_minutes
    fee += Math.ceil(extra / lot.extra_unit_minutes) * lot.extra_unit_fee
  }
  if (lot.daily_max_fee !== null) fee = Math.min(fee, lot.daily_max_fee)
  return fee
}

export function formatFee(fee: number): string {
  return fee === 0 ? '무료' : `${fee.toLocaleString('ko-KR')}원`
}
