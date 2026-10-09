export type MapApp = 'kakao' | 'naver' | 'tmap'

export const MAP_APP_LABEL: Record<MapApp, string> = {
  kakao: '카카오맵', naver: '네이버지도', tmap: '티맵',
}

export interface Point { lat: number; lng: number }

export const HOME_NAME = '내 위치'

/**
 * 길찾기 링크. from이 있으면 출발지로 지정하고, 없으면 각 앱이 현재 위치를 출발지로 쓴다.
 * 웹 URL이 있는 앱은 웹, 티맵은 딥링크.
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
    case 'tmap':
      return `tmap://route?${from ? `startx=${from.lng}&starty=${from.lat}&startname=${f}&` : ''}goalname=${n}&goaly=${lat}&goalx=${lng}`
  }
}

export type ReviewSite = 'kakao' | 'naver' | 'google'

export const REVIEW_SITE_LABEL: Record<ReviewSite, string> = {
  kakao: '카카오맵 리뷰', naver: '네이버지도 리뷰', google: '구글지도 리뷰',
}

/** 각 지도 서비스의 장소 검색 결과 링크. 리뷰는 해당 서비스에서 직접 확인한다. */
export function reviewUrl(site: ReviewSite, name: string, address: string): string {
  // 도로명 주소만 남겨 동명 약국을 구분한다: "경기도 수원시 권선구 정조로 523, 1층 (세류동)" → "... 정조로 523"
  const road = address.replace(/\(.*$/, '').split(',')[0].trim()
  const q = encodeURIComponent(`${name} ${road}`)
  switch (site) {
    case 'kakao': return `https://map.kakao.com/link/search/${q}`
    case 'naver': return `https://map.naver.com/p/search/${q}`
    case 'google': return `https://www.google.com/maps/search/?api=1&query=${q}`
  }
}
