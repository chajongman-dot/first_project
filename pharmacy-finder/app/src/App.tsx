import { useEffect, useMemo, useState } from 'react'
import './App.css'
import pharmaciesData from './data/pharmacies.json'
import parkingData from './data/parking.json'
import type { Filters, ParkingLot, Pharmacy, Tag } from './types'
import { distanceM, formatDistance } from './lib/geo'
import {
  DAY_LABEL, STATE_LABEL, WEEK_ORDER, formatHours, hasHolidayHours, hoursFor, isHoliday,
  isNight, openState, todayKey,
} from './lib/hours'
import { formatFee, parkingFee } from './lib/parking'
import { MAP_APP_LABEL, navUrl, type MapApp } from './lib/nav'

const pharmacies = pharmaciesData as unknown as Pharmacy[]
const parkingLots = parkingData as unknown as ParkingLot[]

const AREAS: Record<string, [number, number]> = {
  '권선구청 부근 (기본)': [37.2573, 126.9719],
  '세류동': [37.2533, 126.9992],
  '곡선동': [37.2662, 126.965],
  '서둔동': [37.2652, 126.9877],
  '호매실동': [37.2662, 126.9473],
  '금곡동': [37.278, 126.9577],
}
const PARKING_RADIUS_M = 300
const TAG_LABEL: Record<Tag, string> = { large: '대형', discount: '할인', night: '심야' }
const DISCLAIMER =
  '표시된 영업시간·가격·요금은 참고 정보이며 실제와 다를 수 있습니다. 방문 전 전화로 확인하세요.'

type Pos = { lat: number; lng: number; label: string }

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

function NavButtons({ name, lat, lng }: { name: string; lat: number; lng: number }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>출발</button>
  return (
    <>
      {(Object.keys(MAP_APP_LABEL) as MapApp[]).map((a) => (
        <a key={a} className="btn" href={navUrl(a, name, lat, lng)} target="_blank" rel="noreferrer">
          {MAP_APP_LABEL[a]}
        </a>
      ))}
    </>
  )
}

function Detail({ p, pos, now, onBack }: { p: Pharmacy; pos: Pos; now: Date; onBack: () => void }) {
  const [custom, setCustom] = useState(90)
  const today = todayKey(now)
  const lots = useMemo(
    () =>
      parkingLots
        .map((l) => ({ l, d: distanceM(p.lat, p.lng, l.lat, l.lng) }))
        .filter((x) => x.d <= PARKING_RADIUS_M)
        .sort((a, b) => a.d - b.d),
    [p],
  )
  return (
    <div>
      <button className="back" onClick={onBack}>← 목록으로</button>
      <h1>{p.name} <StateBadge p={p} now={now} /></h1>
      <p className="meta">{p.address} · {formatDistance(distanceM(pos.lat, pos.lng, p.lat, p.lng))}</p>
      <div className="banner warn">영업시간은 실제와 다를 수 있습니다. 전화로 확인하세요.</div>
      <div className="actions">
        <a className="btn primary" href={`tel:${p.phone.replace(/-/g, '')}`}>📞 {p.phone}</a>
      </div>
      <div className="actions"><NavButtons name={p.name} lat={p.lat} lng={p.lng} /></div>

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
      <p className="meta">최종 갱신 {p.updated_at} · 출처 {p.source === 'sample' ? '샘플 데이터' : p.source}</p>

      <h2>근처 주차장 (반경 {PARKING_RADIUS_M}m)</h2>
      {lots.length === 0 && <p className="meta">반경 내 주차장 정보가 없습니다.</p>}
      <ul className="list">
        {lots.map(({ l, d }) => (
          <li key={l.id} className="card">
            <div className="name">{l.name}</div>
            <div className="meta">
              {formatDistance(d)} · {l.capacity}면 · 운영 {l.operating_hours} · 무료 {l.free_minutes}분
            </div>
            <div className="meta">
              기본 {l.base_minutes}분 {l.base_fee.toLocaleString()}원, 이후 {l.extra_unit_minutes}분당 {l.extra_unit_fee.toLocaleString()}원
              {l.daily_max_fee !== null && `, 일 최대 ${l.daily_max_fee.toLocaleString()}원`}
            </div>
            <div className="fees">
              {[30, 60, 120].map((m) => (
                <span key={m}>{m >= 60 ? `${m / 60}시간` : `${m}분`} {formatFee(parkingFee(l, m))}</span>
              ))}
              <span>{custom}분 {formatFee(parkingFee(l, custom))}</span>
            </div>
            <div className="actions"><NavButtons name={l.name} lat={l.lat} lng={l.lng} /></div>
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
  const [area, setArea] = useState(Object.keys(AREAS)[0])
  const [geo, setGeo] = useState<Pos | null>(null)
  const [geoMsg, setGeoMsg] = useState('')
  const [filters, setFilters] = useState<Filters>({ openNow: true, night: false, holiday: false, large: false })
  const [selected, setSelected] = useState<string | null>(null)

  const pos: Pos = geo ?? { lat: AREAS[area][0], lng: AREAS[area][1], label: area }

  function locate() {
    if (!navigator.geolocation) return setGeoMsg('이 기기는 위치 기능을 지원하지 않습니다.')
    setGeoMsg('위치 확인 중…')
    navigator.geolocation.getCurrentPosition(
      (r) => { setGeo({ lat: r.coords.latitude, lng: r.coords.longitude, label: '내 위치' }); setGeoMsg('') },
      () => setGeoMsg('위치 권한이 거부되었습니다. 아래에서 지역을 선택하세요.'),
      { timeout: 8000 },
    )
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
  }, [pos.lat, pos.lng, now, filters])

  const sel = pharmacies.find((p) => p.id === selected)
  const toggle = (k: keyof Filters) => setFilters((f) => ({ ...f, [k]: !f[k] }))

  return (
    <div className="app">
      {sel ? (
        <Detail p={sel} pos={pos} now={now} onBack={() => setSelected(null)} />
      ) : (
        <>
          <h1>급할 때 약국</h1>
          <p className="sub">
            {now.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
            {isHoliday(now) && ' · 오늘은 공휴일'} · 기준 위치: {pos.label}
          </p>
          <div className="banner warn">⚠ 샘플 데이터입니다. 실제 약국 정보가 아닙니다 (공공데이터 연동 전).</div>
          <div className="row">
            <button className="chip" onClick={locate}>📍 내 위치 사용</button>
            <select
              aria-label="지역 선택"
              value={area}
              onChange={(e) => { setArea(e.target.value); setGeo(null) }}
            >
              {Object.keys(AREAS).map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
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

          <ul className="list">
            {rows.length === 0 && <li className="card meta">조건에 맞는 약국이 없습니다. 필터를 해제해 보세요.</li>}
            {rows.map(({ p, d }) => (
              <li key={p.id} className="card">
                <button className="open" onClick={() => setSelected(p.id)}>
                  <div className="name">{p.name} <StateBadge p={p} now={now} />
                    {p.tags.map((t) => <span key={t} className="badge tag">{TAG_LABEL[t]}</span>)}
                  </div>
                  <div className="meta">{formatDistance(d)} · {p.address}</div>
                  <div className="meta">오늘 {formatHours(hoursFor(p, now))}</div>
                </button>
                <div className="actions">
                  <a className="btn primary" href={`tel:${p.phone.replace(/-/g, '')}`}>📞 전화</a>
                  <button className="btn" onClick={() => setSelected(p.id)}>상세·주차</button>
                </div>
              </li>
            ))}
          </ul>
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
