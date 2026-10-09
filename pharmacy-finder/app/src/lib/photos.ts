import { distanceM } from './geo'

export interface NearbyPhoto {
  title: string
  thumb: string
  page: string
  author: string
  license: string
  distanceM: number
}

const cache = new Map<string, Promise<NearbyPhoto[]>>()

const plain = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? ''

interface CommonsPage {
  title: string
  canonicalurl?: string
  imageinfo?: { thumburl?: string; mime?: string; extmetadata?: Record<string, { value: string }> }[]
  coordinates?: { lat: number; lon: number }[]
}

/** Wikimedia Commons에서 좌표 반경 안의 위치 태그 사진을 찾는다 (키 불필요, CORS 허용). */
export function loadNearbyPhotos(lat: number, lng: number, radiusM = 500, limit = 6): Promise<NearbyPhoto[]> {
  const key = `${lat},${lng},${radiusM}`
  let p = cache.get(key)
  if (!p) {
    const url = new URL('https://commons.wikimedia.org/w/api.php')
    const params: Record<string, string> = {
      action: 'query', format: 'json', origin: '*', generator: 'geosearch',
      ggscoord: `${lat}|${lng}`, ggsradius: String(radiusM), ggslimit: String(limit), ggsnamespace: '6',
      prop: 'imageinfo|info|coordinates', iiprop: 'url|extmetadata|mime', iiurlwidth: '480',
      inprop: 'url', colimit: String(limit),
    }
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((j: { query?: { pages?: Record<string, CommonsPage> } }) =>
        Object.values(j.query?.pages ?? {})
          .map((pg): NearbyPhoto | null => {
            const info = pg.imageinfo?.[0]
            if (!info?.thumburl || !info.mime?.startsWith('image/')) return null
            const m = info.extmetadata ?? {}
            return {
              title: pg.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
              thumb: info.thumburl,
              page: pg.canonicalurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(pg.title)}`,
              author: plain(m.Artist?.value ?? '') || '작성자 미상',
              license: m.LicenseShortName?.value ?? '라이선스 확인 필요',
              distanceM: pg.coordinates?.[0] ? distanceM(lat, lng, pg.coordinates[0].lat, pg.coordinates[0].lon) : 0,
            }
          })
          .filter((x): x is NearbyPhoto => x !== null)
          .sort((a, b) => a.distanceM - b.distanceM),
      )
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}
