import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { Filters, ParkingLot, Pharmacy, Tag } from './types'
import { distanceM, formatDistance } from './lib/geo'
import {
  DAY_LABEL, STATE_LABEL, WEEK_ORDER, formatHours, hasHolidayHours, hoursFor, isHoliday,
  isNight, openState, todayKey,
} from './lib/hours'
import { BUILDING_PARKING_NOTE, buildingParkingText, loadBuildingParking, type BuildingParking } from './lib/buildingParking'
import { loadGoogleReview, type GoogleReviewResult } from './lib/googleReview'
import { loadNaverBlogCount, type NaverBlogResult } from './lib/naverBlog'
import { loadNearbyPhotos, type NearbyPhoto } from './lib/photos'
import { formatFee, parkingFee } from './lib/parking'
import MapView from './components/MapView'
import MiniMap from './components/MiniMap'
import { addHistory, clearHistory, loadHistory, removeHistory, suggest } from './lib/searchHistory'
import { loadHome, saveHome, type Home } from './lib/home'
import { DEFAULT_PLACE } from './lib/places'
import { loadMeta, loadParkingAround, loadPharmaciesAround, searchPharmacies, searchPlaces, type Place, type PharmacyHit } from './lib/data'
import { MAP_APP_LABEL, REVIEW_SITE_LABEL, navUrl, reviewUrl, type MapApp, type ReviewSite } from './lib/nav'

const PARKING_RADIUS_M = 300
const PAGE_SIZE = 10
const TAG_LABEL: Record<Tag, string> = { large: '대형', discount: '할인', night: '심야' }
const DISCLAIMER =
  '표시된 영업시간·가격·요금은 참고 정보이며 실제와 다를 수 있습니다. 방문 전 전화로 확인하세요.'

type Candidate = ({ kind: 'place' } & Place) | ({ kind: 'pharmacy' } & PharmacyHit)

type Pos = { lat: number; lng: number; label: string; count?: number }

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function StateBadge({ p, now }: { p: Pharmacy; now: Date }) {
  const s = openState(p, now)
  return <span className={`badge ${s === 'open' ? 'open-s' : s === 'closing' ? 'closing-s' : s === 'closed' ? 'closed-s' : 'unknown-s'}`}>{STATE_LABEL[s]}</span>
}

function NavButtons({ name, lat, lng, from }: { name: string; lat: number; lng: number; from: Home | null }) {
  return (
    <>
      {(Object.keys(MAP_APP_LABEL) as MapApp[]).map((a) => (
        <a key={a} className="btn" href={navUrl(a, name, lat, lng, from)} target="_blank" rel="noreferrer">
          {MAP_APP_LABEL[a]} 출발
        </a>
      ))}
    </>
  )
}

function ReviewSection({ p }: { p: Pharmacy }) {
  const [res, setRes] = useState<{ id: string; r: GoogleReviewResult } | null>(null)
  useEffect(() => {
    let alive = true
    loadGoogleReview(p.name, p.address, p.lat, p.lng).then((r) => alive && setRes({ id: p.id, r }))
    return () => { alive = false }
  }, [p.id, p.name, p.address, p.lat, p.lng])
  const g = res?.id === p.id ? res.r : null
  const found = g?.status === 'ok' ? g.review : null

  const [blog, setBlog] = useState<{ id: string; r: NaverBlogResult } | null>(null)
  useEffect(() => {
    let alive = true
    loadNaverBlogCount(p.name, p.address).then((r) => alive && setBlog({ id: p.id, r }))
    return () => { alive = false }
  }, [p.id, p.name, p.address])
  const nb = blog?.id === p.id ? blog.r : null

  return (
    <>
      <h2>리뷰</h2>
      <div className="actions">
        {(Object.keys(REVIEW_SITE_LABEL) as ReviewSite[]).map((site) => (
          <a
            key={site}
            className="btn"
            href={site === 'google' && found ? found.url : reviewUrl(site, p.name, p.address)}
            target="_blank"
            rel="noreferrer"
          >
            {REVIEW_SITE_LABEL[site]}
            {site === 'naver' && nb?.status === 'ok' && <small className="btn-sub">블로그 약 {nb.total.toLocaleString()}건</small>}
          </a>
        ))}
      </div>
      <p className="meta" aria-live="polite">
        {g === null && '구글 리뷰 수를 확인하는 중…'}
        {found && (
          <>
            구글지도: {found.rating !== null && <>★ <strong>{found.rating.toFixed(1)}</strong> · </>}
            리뷰 <strong>{found.count.toLocaleString()}</strong>개 (정보 제공: Google)
          </>
        )}
        {g?.status === 'not-found' && '구글지도: 같은 약국을 찾지 못해 리뷰 수를 표시하지 않습니다.'}
        {g?.status === 'no-key' && '구글지도: 리뷰 수 조회가 설정되지 않았습니다 (VITE_GOOGLE_MAPS_API_KEY).'}
        {g?.status === 'error' && `구글지도: 리뷰 수를 불러오지 못했습니다 (${g.message}).`}
      </p>
      <p className="meta">
        {nb === null && '네이버 블로그 글 수를 확인하는 중…'}
        {nb?.status === 'ok' && '네이버지도: 블로그 글 수는 "약국 이름 + 동네" 검색 결과의 총 건수로, 정확한 리뷰 수가 아니며 다른 가게 글이 섞일 수 있습니다 (정보 제공: 네이버).'}
        {nb?.status === 'no-key' && '네이버지도: 블로그 글 수 조회가 설정되지 않았습니다 (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET).'}
        {nb?.status === 'error' && `네이버지도: 블로그 글 수를 불러오지 못했습니다 (${nb.message}).`}
      </p>
      <p className="meta">카카오맵은 리뷰 수를 제공하지 않아 링크로만 연결합니다. 리뷰 내용은 각 서비스에서 확인하세요. 같은 이름의 다른 약국이 검색될 수 있습니다.</p>
    </>
  )
}

function NearbyPhotos({ lat, lng }: { lat: number; lng: number }) {
  const [state, setState] = useState<{ key: string; photos: NearbyPhoto[]; error: boolean } | null>(null)
  const key = `${lat},${lng}`
  useEffect(() => {
    let alive = true
    loadNearbyPhotos(lat, lng).then(
      (photos) => alive && setState({ key, photos, error: false }),
      () => alive && setState({ key, photos: [], error: true }),
    )
    return () => { alive = false }
  }, [lat, lng, key])
  if (state?.key !== key) return <p className="meta">주변 사진을 찾는 중…</p>
  if (state.error) return <p className="meta">주변 사진을 불러오지 못했습니다.</p>
  if (state.photos.length === 0) return <p className="meta">반경 500m 안에 등록된 주변 사진이 없습니다.</p>
  return (
    <>
      <h2>주변 사진</h2>
      <p className="meta">약국 사진이 아닌, 반경 500m 안에서 촬영된 사진입니다 (Wikimedia Commons).</p>
      <ul className="photos">
        {state.photos.map((ph) => (
          <li key={ph.page}>
            <a href={ph.page} target="_blank" rel="noreferrer">
              <img src={ph.thumb} alt={ph.title} loading="lazy" />
            </a>
            <div className="meta">{ph.title} · {formatDistance(ph.distanceM)}</div>
            <div className="meta">© {ph.author} · {ph.license}</div>
          </li>
        ))}
      </ul>
    </>
  )
}

/** 건축물대장 기준 건물 주차 대수. undefined=로딩 중, null=확인 못함 */
function useBuildingParking(id: string): BuildingParking | null | undefined {
  const [v, setV] = useState<{ id: string; n: BuildingParking | null } | null>(null)
  useEffect(() => {
    let alive = true
    loadBuildingParking().then((m) => alive && setV({ id, n: m && id in m ? m[id] : null }))
    return () => { alive = false }
  }, [id])
  return v?.id === id ? v.n : undefined
}

function BuildingParkingLine({ id }: { id: string }) {
  const n = useBuildingParking(id)
  if (n === undefined || n === null) return null // 모르는 것은 표시하지 않는다
  return <div className={n[0] > 0 ? 'meta parking-yes' : 'meta'}>🏢 {buildingParkingText(n)}</div>
}

/**
 * 목록용: 약국 반경 300m 안의 주차장 유무. 약국 전용 주차장 정보는 공공데이터에 없어
 * "근처 주차장" 기준이며, 화면에 보이는 약국만 조회한다 (조각 데이터는 캐시되어 공유된다).
 */
function BuildingParkingDetail({ id }: { id: string }) {
  const n = useBuildingParking(id)
  if (n === undefined) return <p className="meta">건물 주차 정보를 확인하는 중…</p>
  if (n === null) return <p className="meta">이 약국 건물의 주차 정보를 건축물대장에서 확인하지 못했습니다.</p>
  return (
    <>
      <p>🏢 <strong>{buildingParkingText(n)}</strong></p>
      {n[1] > 1 && <p className="meta">같은 필지에 건물이 {n[1]}동 있어, 약국이 있는 건물만의 값이 아니라 전체 합계입니다.</p>}
      {n[1] === 1 && n[0] >= 200 && <p className="meta">주차 대수가 매우 커서 아파트 단지·복합시설 전체 값일 수 있습니다. 약국 이용객 전용 주차 공간 수가 아닙니다.</p>}
      {n[0] === 0 && <p className="meta">대장에 주차 정보가 비어 있는 경우도 있어, 실제로 주차할 수 없다는 뜻은 아닙니다.</p>}
      <p className="meta">{BUILDING_PARKING_NOTE}</p>
    </>
  )
}

function ParkingInfo({ lat, lng }: { lat: number; lng: number }) {
  const [state, setState] = useState<{ key: string; n: number; nearest: number; free: boolean } | null>(null)
  const key = `${lat},${lng}`
  useEffect(() => {
    let alive = true
    loadParkingAround(lat, lng).then(
      (all) => {
        if (!alive) return
        const near = all
          .map((l) => ({ l, d: distanceM(lat, lng, l.lat, l.lng) }))
          .filter((x) => x.d <= PARKING_RADIUS_M)
          .sort((a, b) => a.d - b.d)
        setState({ key, n: near.length, nearest: near[0]?.d ?? 0, free: near.some(({ l }) => l.fee_type.includes('무료')) })
      },
      () => {},
    )
    return () => { alive = false }
  }, [lat, lng, key])
  if (state?.key !== key) return null
  return state.n > 0 ? (
    <div className="meta parking-yes">
      🅿 근처 주차장 {state.n}곳 · 가장 가까운 곳 {formatDistance(state.nearest)}{state.free && ' · 무료 주차장 포함'}
    </div>
  ) : (
    <div className="meta">🅿 근처 {PARKING_RADIUS_M}m 안 주차장 정보 없음</div>
  )
}

/** 목록용: 화면에 보이는 약국만 조회하고, 결과는 캐시되어 상세 화면에서 재사용된다. */
function PhotoBadge({ lat, lng }: { lat: number; lng: number }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    loadNearbyPhotos(lat, lng).then((r) => alive && setCount(r.length), () => {})
    return () => { alive = false }
  }, [lat, lng])
  return count > 0 ? <span className="badge tag">📷 주변 사진 있음</span> : null
}

function Detail({ p, pos, now, home, onBack }: { p: Pharmacy; pos: Pos; now: Date; home: Home | null; onBack: () => void }) {
  const [custom, setCustom] = useState(90)
  const today = todayKey(now)
  const [parkingLots, setParkingLots] = useState<ParkingLot[] | null>(null)
  useEffect(() => {
    let alive = true
    loadParkingAround(p.lat, p.lng).then((r) => alive && setParkingLots(r), () => alive && setParkingLots([]))
    return () => { alive = false }
  }, [p.lat, p.lng])
  const lots = useMemo(
    () =>
      (parkingLots ?? [])
        .map((l) => ({ l, d: distanceM(p.lat, p.lng, l.lat, l.lng) }))
        .filter((x) => x.d <= PARKING_RADIUS_M)
        .sort((a, b) => a.d - b.d),
    [p, parkingLots],
  )
  const lotMarks = useMemo(() => lots.map(({ l }) => l), [lots])
  return (
    <div>
      <button className="back" onClick={onBack}>← 목록으로</button>
      <h1>{p.name} <StateBadge p={p} now={now} /></h1>
      <p className="meta">{p.address} · {formatDistance(distanceM(pos.lat, pos.lng, p.lat, p.lng))}</p>
      <div className="banner warn">영업시간은 실제와 다를 수 있습니다. 전화로 확인하세요.</div>
      <div className="actions">
        <a className="btn primary" href={`tel:${p.phone.replace(/-/g, '')}`}>📞 {p.phone}</a>
      </div>
      <div className="actions"><NavButtons name={p.name} lat={p.lat} lng={p.lng} from={home} /></div>
      <p className="meta">출발지: {home ? '등록한 내 위치' : '각 지도 앱의 현재 위치 (지도에서 내 위치를 등록하면 출발지로 사용)'}</p>

      <h2>영업시간</h2>
      <table>
        <tbody>
          {WEEK_ORDER.map((k) => (
            <tr key={k} className={k === today ? 'today' : ''}>
              <td>{DAY_LABEL[k]}{k === today ? ' (오늘)' : ''}</td>
              <td>{formatHours(p.hours[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">최종 갱신 {p.updated_at} · 출처 {p.source}</p>

      <h2>위치</h2>
      <MiniMap lat={p.lat} lng={p.lng} name={p.name} lots={lotMarks} />
      {p.guide && <p className="meta">📍 위치 안내: {p.guide}</p>}
      <p className="meta">지도의 P 표시는 근처 주차장입니다.</p>
      <NearbyPhotos lat={p.lat} lng={p.lng} />

      <ReviewSection p={p} />

      <h2>주차</h2>
      <BuildingParkingDetail id={p.id} />

      <h2>근처 주차장 (반경 {PARKING_RADIUS_M}m)</h2>
      {parkingLots === null && <p className="meta">주차장 정보를 불러오는 중…</p>}
      {parkingLots !== null && lots.length === 0 && <p className="meta">반경 내 주차장 정보가 없습니다.</p>}
      <ul className="list">
        {lots.map(({ l, d }) => (
          <li key={l.id} className="card">
            <div className="name">{l.name}</div>
            <div className="meta">
              {formatDistance(d)} · {l.capacity}면 · 운영 {l.operating_hours} · {l.fee_type}
            </div>
            {l.fee_known && l.fee_type !== '무료' && (
              <div className="meta">
                기본 {l.base_minutes}분 {l.base_fee.toLocaleString()}원, 이후 {l.extra_unit_minutes}분당 {l.extra_unit_fee.toLocaleString()}원
                {l.daily_max_fee !== null && `, 일 최대 ${l.daily_max_fee.toLocaleString()}원`}
              </div>
            )}
            {l.fee_known ? (
              <div className="fees">
                {[30, 60, 120].map((m) => (
                  <span key={m}>{m >= 60 ? `${m / 60}시간` : `${m}분`} {formatFee(parkingFee(l, m))}</span>
                ))}
                <span>{custom}분 {formatFee(parkingFee(l, custom))}</span>
              </div>
            ) : (
              <div className="meta">요금 정보 없음 · 현장 확인 필요</div>
            )}
            <div className="actions"><NavButtons name={l.name} lat={l.lat} lng={l.lng} from={home} /></div>
          </li>
        ))}
      </ul>
      {lots.length > 0 && (
        <label className="meta">직접 입력(분): <input type="number" min={0} value={custom} onChange={(e) => setCustom(Math.max(0, Number(e.target.value) || 0))} /></label>
      )}
      <p className="meta">약국 개별 주차장이 아닌 &quot;근처 주차장&quot; 정보이며, 요금은 예상치입니다.</p>
    </div>
  )
}

export default function App() {
  const now = useNow()
  const [home, setHome] = useState(loadHome)
  // 등록한 위치가 있으면 그 위치에서 시작한다
  const [geo, setGeo] = useState<Pos | null>(() => {
    const h = loadHome()
    return h ? { ...h, label: '등록한 내 위치' } : null
  })
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [history, setHistory] = useState(loadHistory)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [geoMsg, setGeoMsg] = useState('')
  const [filters, setFilters] = useState<Filters>({ openNow: true, night: false, holiday: false, large: false })
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')

  const pos: Pos = useMemo(
    () => geo ?? { lat: DEFAULT_PLACE.lat, lng: DEFAULT_PLACE.lng, label: DEFAULT_PLACE.name },
    [geo],
  )
  const posKey = `${pos.lat},${pos.lng}`
  const [loaded, setLoaded] = useState<{ key: string; list: Pharmacy[]; updatedAt: string; error: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([loadPharmaciesAround(pos.lat, pos.lng), loadMeta()]).then(
      ([list, meta]) => { if (alive) setLoaded({ key: posKey, list, updatedAt: meta.updated_at, error: false }) },
      () => { if (alive) setLoaded({ key: posKey, list: [], updatedAt: '', error: true }) },
    )
    return () => { alive = false }
  }, [pos.lat, pos.lng, posKey])
  const ready = loaded?.key === posKey
  const loadState = !ready ? 'loading' : loaded.error ? 'error' : 'ready'
  const pharmacies = useMemo(() => (ready ? loaded.list : []), [ready, loaded])
  const updatedAt = loaded?.updatedAt ?? ""

  function registerHome(lat: number, lng: number) {
    const ok = saveHome({ lat, lng })
    setHome({ lat, lng })
    setGeo({ lat, lng, label: '등록한 내 위치' })
    setGeoMsg(ok ? '내 위치를 등록했습니다. 이 기기에만 저장되며 서버로 보내지 않습니다.' : '이 브라우저에서는 위치를 저장할 수 없어 이번 방문에만 적용됩니다.')
  }

  function clearHome() {
    saveHome(null)
    setHome(null)
    setGeoMsg('등록한 내 위치를 삭제했습니다.')
  }

  function pick(c: Candidate) {
    setHistory((h) => addHistory(h, c.name))
    if (c.kind === 'place') {
      setGeo({ lat: c.lat, lng: c.lng, label: c.name, count: c.count })
      setSelected(null)
    } else {
      // 약국을 고르면 그 약국 위치로 이동하고, 주변 데이터가 로드되면 상세 화면이 열린다.
      setGeo({ lat: c.lat, lng: c.lng, label: c.name })
      setSelected(c.id)
    }
    setView('list')
    setCandidates([])
    setGeoMsg('')
  }

  async function runSearch(q: string) {
    setSuggestOpen(false)
    let found: Candidate[]
    try {
      const [places, pharms] = await Promise.all([searchPlaces(q, pos), searchPharmacies(q, pos)])
      found = [
        ...pharms.map((h): Candidate => ({ kind: 'pharmacy', ...h })),
        ...places.slice(0, 6).map((p): Candidate => ({ kind: 'place', ...p })),
      ]
    } catch { return setGeoMsg('검색 정보를 불러오지 못했습니다.') }
    if (found.length === 0) { setCandidates([]); return setGeoMsg(`"${q}" 에 해당하는 약국이나 지역을 찾지 못했습니다. 약국 이름(예: 온누리약국)이나 동 이름(예: 인계동)으로 검색해 보세요.`) }
    if (found.length === 1) return pick(found[0])
    setGeoMsg('')
    setCandidates(found)
  }

  const search = (e: React.FormEvent) => { e.preventDefault(); void runSearch(query) }
  const suggestions = suggestOpen ? suggest(history, query) : []

  function locate() {
    if (!navigator.geolocation) return setGeoMsg('이 기기는 위치 기능을 지원하지 않습니다.')
    setGeoMsg('위치 확인 중…')
    navigator.geolocation.getCurrentPosition(
      (r) => { setGeo({ lat: r.coords.latitude, lng: r.coords.longitude, label: '내 위치' }); setGeoMsg('') },
      () => setGeoMsg('위치 권한이 거부되었습니다. 아래에서 지역을 선택하세요.'),
      { timeout: 8000 },
    )
  }

  function showMap() {
    setView('map')
    if (!geo) locate() // 지도는 내 위치 기준으로 시작한다. 거부되면 현재 기준 위치를 유지한다.
  }

  const rows = useMemo(() => {
    return pharmacies
      .map((p) => ({ p, d: distanceM(pos.lat, pos.lng, p.lat, p.lng), s: openState(p, now) }))
      .filter(({ p, s }) =>
        (!filters.openNow || s === 'open' || s === 'closing') &&
        (!filters.night || isNight(p)) &&
        (!filters.holiday || hasHolidayHours(p)) &&
        (!filters.large || p.tags.includes('large') || p.tags.includes('discount')))
      .sort((a, b) => a.d - b.d)
  }, [pharmacies, pos.lat, pos.lng, now, filters])

  // 지도에는 영업 중(곧 종료 포함)인 약국만 그린다. 목록 필터와는 별개로 항상 적용.
  const mapRows = useMemo(() => rows.filter(({ s }) => s === 'open' || s === 'closing'), [rows])

  // 위치나 필터가 바뀌면 1쪽으로 돌아간다 (key가 달라지면 저장된 쪽 번호를 무시)
  const viewKey = `${posKey}|${filters.openNow}${filters.night}${filters.holiday}${filters.large}`
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(pageState.key === viewKey ? pageState.page : 1, totalPages)
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const goPage = (n: number) => {
    setPageState({ key: viewKey, page: n })
    window.scrollTo({ top: 0 })
  }

  const sel = pharmacies.find((p) => p.id === selected)
  const toggle = (k: keyof Filters) => setFilters((f) => ({ ...f, [k]: !f[k] }))

  return (
    <div className="app">
      {sel ? (
        <Detail p={sel} pos={pos} now={now} home={home} onBack={() => setSelected(null)} />
      ) : (
        <>
          <h1>급할 때 약국</h1>
          <p className="sub">
            {now.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
            {isHoliday(now) && ' · 오늘은 공휴일'} · 기준 위치: {pos.label}
          </p>
          <div className="banner">전국 공공데이터(국립중앙의료원) · 갱신 {updatedAt || '…'} · 주변 약국 {pharmacies.length}곳. 시간 정보가 없는 약국은 &quot;정보 없음&quot;입니다.</div>
          <div className="row">
            <button className="chip" onClick={locate}>📍 내 위치 사용</button>
            {home && (
              <>
                <button className="chip" onClick={() => setGeo({ ...home, label: '등록한 내 위치' })}>🏠 등록한 위치</button>
                <button className="chip" onClick={clearHome} aria-label="등록한 내 위치 삭제">등록 해제</button>
              </>
            )}
                      </div>
          <form className="row search-form" style={{ marginTop: 10 }} onSubmit={search}>
            <div className="search-wrap">
              <input
                className="search"
                type="search"
                aria-label="약국·지역 검색"
                aria-expanded={suggestions.length > 0}
                aria-controls="search-suggest"
                autoComplete="off"
                placeholder="약국 이름 또는 지역 (예: 온누리약국, 인계동)"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSuggestOpen(true) }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setSuggestOpen(false)}
                onKeyDown={(e) => e.key === 'Escape' && setSuggestOpen(false)}
              />
              {suggestions.length > 0 && (
                // onMouseDown: 입력창 blur로 목록이 닫히기 전에 클릭을 처리한다
                <ul id="search-suggest" className="suggest" role="listbox" aria-label="최근 검색">
                  {suggestions.map((h) => (
                    <li key={h} role="option" aria-selected="false">
                      <button type="button" className="suggest-item" onMouseDown={(e) => { e.preventDefault(); setQuery(h); void runSearch(h) }}>
                        🕘 {h}
                      </button>
                      <button
                        type="button"
                        className="suggest-del"
                        aria-label={`${h} 기록 삭제`}
                        onMouseDown={(e) => { e.preventDefault(); setHistory((l) => removeHistory(l, h)) }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                  <li className="suggest-foot">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); clearHistory(); setHistory([]) }}>전체 삭제</button>
                  </li>
                </ul>
              )}
            </div>
            <button className="chip" type="submit">검색</button>
          </form>
          {candidates.length > 0 && (
            <ul className="list">
              {candidates.map((c) => (
                <li key={c.kind === 'pharmacy' ? c.id : `place:${c.name}`}>
                  <button className="chip candidate" onClick={() => pick(c)}>
                    {c.kind === 'pharmacy' ? <>💊 <strong>{c.name}</strong> <span className="meta">{c.region}</span></> : <>📍 {c.name}</>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {geoMsg && <p className="meta">{geoMsg}</p>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="chip" aria-pressed={filters.openNow} onClick={() => toggle('openNow')}>지금 영업 중</button>
            <button className="chip" aria-pressed={filters.night} onClick={() => toggle('night')}>야간</button>
            <button className="chip" aria-pressed={filters.holiday} onClick={() => toggle('holiday')}>공휴일</button>
            <button className="chip" aria-pressed={filters.large} onClick={() => toggle('large')}>대형·할인</button>
          </div>
          <details>
            <summary>대형·할인 약국 판정 기준</summary>
            <p className="meta">운영자가 직접 확인해 태그를 부여합니다. 대형: 여러 약사가 근무하는 규모 약국. 할인: 일반의약품 할인 판매가 확인된 약국. 근거 없는 태그는 쓰지 않습니다.</p>
          </details>

          {loadState === 'ready' && (
            <p className="result-count" aria-live="polite">
              검색 결과 <strong>{rows.length}</strong>곳
              {pos.count !== undefined && <> · {pos.label} 전체 약국 <strong>{pos.count.toLocaleString()}</strong>곳</>}
              <span className="view-toggle">
                <button className="chip" aria-pressed={view === 'list'} onClick={() => setView('list')}>목록</button>
                <button className="chip" aria-pressed={view === 'map'} onClick={showMap}>🗺 지도 보기</button>
              </span>
            </p>
          )}
          {view === 'map' && loadState === 'ready' ? (
            <MapView
              center={pos}
              rows={mapRows}
              now={now}
              onSelect={setSelected}
              onRecenter={(lat, lng) => setGeo({ lat, lng, label: '지도에서 선택한 위치' })}
              onLocate={locate}
              home={home}
              onRegister={registerHome}
            />
          ) : (
            <>
            <ul className="list">
              {loadState === 'loading' && <li className="card meta">약국 정보를 불러오는 중…</li>}
              {loadState === 'error' && <li className="card meta">데이터를 불러오지 못했습니다. npm run fetch-data 로 데이터를 생성했는지 확인하세요.</li>}
              {loadState === 'ready' && rows.length === 0 && <li className="card meta">조건에 맞는 약국이 없습니다. 필터를 해제해 보세요.</li>}
              {pageRows.map(({ p, d }) => (
                <li key={p.id} className="card">
                  <button className="open" onClick={() => setSelected(p.id)}>
                    <div className="name">{p.name} <StateBadge p={p} now={now} />
                      {p.tags.map((t) => <span key={t} className="badge tag">{TAG_LABEL[t]}</span>)}
                    <PhotoBadge lat={p.lat} lng={p.lng} />
                    </div>
                    <div className="meta">{formatDistance(d)} · {p.address}</div>
                    <div className="meta">오늘 {formatHours(hoursFor(p, now))}</div>
                  <BuildingParkingLine id={p.id} />
                  <ParkingInfo lat={p.lat} lng={p.lng} />
                  </button>
                  <div className="actions">
                    <a className="btn primary" href={`tel:${p.phone.replace(/-/g, '')}`}>📞 전화</a>
                    <button className="btn" onClick={() => setSelected(p.id)}>상세·주차</button>
                  </div>
                </li>
              ))}
            </ul>
            {rows.length > PAGE_SIZE && (
              <nav className="pager" aria-label="페이지 이동">
                <button className="chip" disabled={page === 1} onClick={() => goPage(page - 1)}>← 이전</button>
                <span className="meta" aria-live="polite">
                  {page} / {totalPages}쪽
                </span>
                <button className="chip" disabled={page === totalPages} onClick={() => goPage(page + 1)}>다음 →</button>
              </nav>
            )}
            </>
          )}
        </>
      )}
      <div className="footer">
        <div className="emerg">
          <a href="tel:119">119</a><a href="tel:1339">1339</a>
          <a href={`https://map.kakao.com/link/search/${encodeURIComponent('응급실')}`} target="_blank" rel="noreferrer">근처 응급실</a>
        </div>
        {DISCLAIMER} 의약품 판매·주문 중개 서비스가 아닙니다.
      </div>
    </div>
  )
}
