/** [주차 대수 합계, 같은 필지의 건물 수]. 건물이 여럿이면 합계는 단지·캠퍼스 전체 값이다. */
export type BuildingParking = [total: number, buildings: number]

/** 약국 id → 건물 주차 정보 (건축물대장 표제부). 키가 없으면 대장에서 확인하지 못한 약국. */
let all: Promise<Record<string, BuildingParking> | null> | null = null

export function loadBuildingParking(): Promise<Record<string, BuildingParking> | null> {
  all ??= fetch('/data/building-parking.json')
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, BuildingParking>>) : null))
    .catch(() => null) // 파일이 없거나(dev 서버가 HTML을 돌려줌) 깨졌으면 정보 없음으로 처리
  return all
}

export const BUILDING_PARKING_NOTE =
  '건축물대장에 등록된 법정 주차 공간 수(자주식·기계식 합계)입니다. 방문객 이용 가능 여부와 무료 여부는 알 수 없으니 방문 전 확인하세요.'

/** 이 값 이상이면 아파트 단지·캠퍼스·복합몰처럼 약국이 있는 건물만의 값이 아닐 가능성이 크다. */
const LARGE_COMPLEX = 200

/** 건물이 여럿이거나 값이 매우 크면 약국이 있는 건물만의 값이 아님을 밝힌다. */
export function buildingParkingText([total, buildings]: BuildingParking): string {
  if (total === 0) return '건축물대장에 등록된 주차 공간 없음'
  const n = total.toLocaleString()
  if (buildings > 1) return `단지 전체(건물 ${buildings}동) 주차 ${n}대`
  return total >= LARGE_COMPLEX ? `대규모 건물·단지 주차 ${n}대 (약국 전용 아님)` : `건물 주차장 ${n}대`
}
