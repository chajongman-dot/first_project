import { distanceM } from './geo'

export interface GoogleReview {
  rating: number | null
  count: number
  url: string
}

export type GoogleReviewResult =
  | { status: 'ok'; review: GoogleReview }
  | { status: 'not-found' }
  | { status: 'no-key' }
  | { status: 'error'; message: string }

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
const MATCH_RADIUS_M = 150

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
const cache = new Map<string, Promise<GoogleReviewResult>>()

interface PlacesResponse {
  places?: {
    displayName?: { text: string }
    rating?: number
    userRatingCount?: number
    location?: { latitude: number; longitude: number }
    googleMapsUri?: string
  }[]
  error?: { message?: string; status?: string }
}

/**
 * Google Places API (New) 텍스트 검색으로 같은 약국을 찾아 평점·리뷰 수를 가져온다.
 * 호출마다 비용이 들 수 있어 상세 화면에서만 부르고 결과를 캐시한다.
 * 약국 좌표 150m 이내이면서 이름이 서로 포함될 때만 같은 곳으로 본다 (동명 약국 오표시 방지).
 */
export function loadGoogleReview(name: string, address: string, lat: number, lng: number): Promise<GoogleReviewResult> {
  if (!KEY) return Promise.resolve({ status: 'no-key' })
  const cacheKey = `${name}|${lat},${lng}`
  let p = cache.get(cacheKey)
  if (!p) {
    const road = address.replace(/\(.*$/, '').split(',')[0].trim()
    p = fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.location,places.googleMapsUri',
      },
      body: JSON.stringify({
        textQuery: `${name} ${road}`,
        languageCode: 'ko',
        regionCode: 'KR',
        maxResultCount: 5,
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 300 } },
      }),
    })
      .then(async (r): Promise<GoogleReviewResult> => {
        const j = (await r.json()) as PlacesResponse
        if (!r.ok) return { status: 'error', message: j.error?.status ?? String(r.status) }
        const n = norm(name)
        const hit = (j.places ?? [])
          .filter((pl) => pl.location && pl.googleMapsUri)
          .map((pl) => ({ pl, d: distanceM(lat, lng, pl.location!.latitude, pl.location!.longitude) }))
          .filter(({ pl, d }) => {
            const g = norm(pl.displayName?.text ?? '')
            return d <= MATCH_RADIUS_M && (g.includes(n) || n.includes(g))
          })
          .sort((a, b) => a.d - b.d)[0]
        if (!hit) return { status: 'not-found' }
        return {
          status: 'ok',
          review: { rating: hit.pl.rating ?? null, count: hit.pl.userRatingCount ?? 0, url: hit.pl.googleMapsUri! },
        }
      })
      .catch((e: Error): GoogleReviewResult => ({ status: 'error', message: e.message }))
    p.then((r) => { if (r.status === 'error') cache.delete(cacheKey) })
    cache.set(cacheKey, p)
  }
  return p
}
