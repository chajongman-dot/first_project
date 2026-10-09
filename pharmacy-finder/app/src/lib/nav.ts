export type MapApp = 'kakao' | 'naver' | 'tmap'

export const MAP_APP_LABEL: Record<MapApp, string> = {
  kakao: '카카오맵', naver: '네이버지도', tmap: '티맵',
}

/** 목적지 길찾기 링크. 웹 URL이 있는 앱은 웹, 티맵은 딥링크. */
export function navUrl(app: MapApp, name: string, lat: number, lng: number): string {
  const n = encodeURIComponent(name)
  switch (app) {
    case 'kakao':
      return `https://map.kakao.com/link/to/${n},${lat},${lng}`
    case 'naver':
      return `https://map.naver.com/p/directions/-/${lng},${lat},${n}/-/transit`
    case 'tmap':
      return `tmap://route?goalname=${n}&goaly=${lat}&goalx=${lng}`
  }
}
