export type MapApp = 'kakao' | 'naver'

export const MAP_APP_LABEL: Record<MapApp, string> = {
  kakao: '카카오맵', naver: '네이버지도',
}

export interface Point { lat: number; lng: number }

export const HOME_NAME = '내 위치'

/**
 * 길찾기 링크. from이 있으면 출발지로 지정하고, 없으면 각 앱이 현재 위치를 출발지로 쓴다.
 * 두 앱 모두 웹 URL로 연결한다.
 */
export function navUrl(app: MapApp, name: string, lat: number, lng: number, from?: Point | null): string {
  const n = encodeURIComponent(name)
  const f = encodeURIComponent(HOME_NAME)
  switch (app) {
    case 'kakao':
      return from
        ? `https://map.kakao.com/link/from/${f},${from.lat},${from.lng}/to/${n},${lat},${lng}`
        : `https://map.kakao.com/link/to/${n},${lat},${lng}`
    case 'naver':
      return `https://map.naver.com/p/directions/${from ? `${from.lng},${from.lat},${f}` : '-'}/${lng},${lat},${n}/-/transit`
  }
}

/** 네이버지도의 장소 검색 결과 링크. 리뷰는 네이버지도에서 직접 확인한다. */
export function naverReviewUrl(name: string, address: string): string {
  // 도로명 주소만 남겨 동명 약국을 구분한다: "경기도 수원시 권선구 정조로 523, 1층 (세류동)" → "... 정조로 523"
  const road = address.replace(/\(.*$/, '').split(',')[0].trim()
  return `https://map.naver.com/p/search/${encodeURIComponent(`${name} ${road}`)}`
}

/** 네이버 클립 검색 결과 링크. 클립은 공식 검색 API가 없어 목록을 가져오지 않고 검색 화면으로 연결만 한다. */
export function naverClipUrl(query: string): string {
  return `https://search.naver.com/search.naver?ssc=tab.clip.all&query=${encodeURIComponent(query)}`
}

/** 네이버 검색용 문구: 약국 이름 + 동네 (동 이름이 없으면 시·군·구). */
export function placeQuery(name: string, address: string): string {
  const dong = address.match(/\(([^)]*?)(?:,|\))/)?.[1] ?? ''
  const area = /(동|읍|면|가|리)$/.test(dong) ? dong : address.split(/\s+/).slice(1, 3).join(' ')
  return `${name} ${area}`.trim()
}
