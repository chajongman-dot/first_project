const KEY = 'pharmacy-finder:home'

export interface Home { lat: number; lng: number }

// 위치는 이 기기의 localStorage에만 저장하고 서버로 보내지 않는다 (PRD 11절).
// 시크릿 모드 등에서 저장소 접근이 막힐 수 있어 모든 접근을 try/catch로 감싼다.
export function loadHome(): Home | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Home | null
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? { lat: v.lat, lng: v.lng } : null
  } catch {
    return null
  }
}

export function saveHome(h: Home | null): boolean {
  try {
    if (h) localStorage.setItem(KEY, JSON.stringify(h))
    else localStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}
