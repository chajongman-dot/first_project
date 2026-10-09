/** 약국 id → 건물 주차 대수 (건축물대장 표제부 합계). 값이 없으면 대장에서 확인하지 못한 약국. */
let all: Promise<Record<string, number> | null> | null = null

export function loadBuildingParking(): Promise<Record<string, number> | null> {
  all ??= fetch('/data/building-parking.json')
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, number>>) : null))
    .catch(() => null) // 파일이 없거나(dev 서버가 HTML을 돌려줌) 깨졌으면 정보 없음으로 처리
  return all
}

export const BUILDING_PARKING_NOTE =
  '건축물대장에 등록된 건물의 법정 주차 공간 수(자주식·기계식 합계)입니다. 방문객 이용 가능 여부와 무료 여부는 알 수 없으니 방문 전 확인하세요.'
