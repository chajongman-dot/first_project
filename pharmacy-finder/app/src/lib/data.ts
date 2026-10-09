import type { ParkingLot, Pharmacy } from '../types'

interface Meta {
  updated_at: string
  source: string
  counts: { pharmacies: number; parking: number }
  cells: { pharmacies: string[]; parking: string[] }
}

type Kind = 'pharmacies' | 'parking'
type PlaceRow = [label: string, lat: number, lng: number, count: number]

const cache = new Map<string, Promise<unknown>>()
function cached<T>(url: string): Promise<T> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(url)) // 실패는 재시도 가능하게
    cache.set(url, p)
  }
  return p as Promise<T>
}

export const loadMeta = () => cached<Meta>('/data/meta.json')

const cellXY = (lat: number, lng: number) => [Math.floor(lng * 10), Math.floor(lat * 10)] as const

/** 위치 주변 3×3 격자(약 ±10km)의 데이터를 불러온다. 없는 칸은 건너뛴다. */
async function loadAround<T>(kind: Kind, lat: number, lng: number): Promise<T[]> {
  const meta = await loadMeta()
  const exists = new Set(meta.cells[kind])
  const [cx, cy] = cellXY(lat, lng)
  const urls: string[] = []
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const k = `${cx + dx}_${cy + dy}`
      if (exists.has(k)) urls.push(`/data/${kind}/${k}.json`)
    }
  return (await Promise.all(urls.map((u) => cached<T[]>(u)))).flat()
}

export async function loadPharmaciesAround(lat: number, lng: number): Promise<Pharmacy[]> {
  const meta = await loadMeta()
  const rows = await loadAround<Omit<Pharmacy, 'source' | 'updated_at'>>('pharmacies', lat, lng)
  return rows.map((r) => ({ ...r, source: meta.source, updated_at: meta.updated_at }))
}

export const loadParkingAround = (lat: number, lng: number) => loadAround<ParkingLot>('parking', lat, lng)

const norm = (s: string) => s.replace(/\s+/g, '')

/** count: 해당 지역(동·시군구·시도)에 속한 전국 약국 총수 */
export interface Place { name: string; lat: number; lng: number; count: number }

/** 전국 지역 사전에서 검색. 공백으로 나눈 모든 단어가 주소 라벨에 포함돼야 한다. */
export async function searchPlaces(query: string, near: { lat: number; lng: number }): Promise<Place[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).map(norm)
  if (words.length === 0) return []
  const rows = await cached<PlaceRow[]>('/data/places.json')
  const d2 = (r: PlaceRow) => (r[1] - near.lat) ** 2 + (r[2] - near.lng) ** 2
  return rows
    .filter(([label]) => words.every((w) => label.includes(w)))
    // 짧은 라벨(시도·시군구)을 먼저, 같은 깊이에서는 현재 위치에 가까운 순
    .sort((a, b) => a[0].split(' ').length - b[0].split(' ').length || d2(a) - d2(b))
    .slice(0, 12)
    .map(([name, lat, lng, count]) => ({ name, lat, lng, count }))
}

type NameRow = [id: string, name: string, region: string, lat: number, lng: number]

export interface PharmacyHit { id: string; name: string; region: string; lat: number; lng: number }

/**
 * 약국 이름으로 전국 검색. 공백으로 나눈 단어가 모두 (이름+지역)에 포함돼야 하고,
 * 단어 중 하나 이상은 이름에 있어야 한다 (지역명만 입력했을 때 그 동네 약국이 전부 쏟아지는 것을 막는다).
 */
export async function searchPharmacies(query: string, near: { lat: number; lng: number }, limit = 10): Promise<PharmacyHit[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).map(norm)
  if (words.length === 0) return []
  const rows = await cached<NameRow[]>('/data/names.json')
  const d2 = (r: NameRow) => (r[3] - near.lat) ** 2 + (r[4] - near.lng) ** 2
  return rows
    .filter(([, name, region]) => {
      const n = norm(name)
      const all = n + norm(region)
      return words.every((w) => all.includes(w)) && words.some((w) => n.includes(w))
    })
    .sort((a, b) => d2(a) - d2(b))
    .slice(0, limit)
    .map(([id, name, region, lat, lng]) => ({ id, name, region, lat, lng }))
}
