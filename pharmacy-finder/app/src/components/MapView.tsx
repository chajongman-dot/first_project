import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { OpenState, Pharmacy } from '../types'
import { formatDistance } from '../lib/geo'
import { STATE_LABEL, formatHours, hoursFor, openState } from '../lib/hours'

export interface MapRow { p: Pharmacy; d: number }

interface Props {
  center: { lat: number; lng: number }
  rows: MapRow[]
  now: Date
  onSelect: (id: string) => void
  onRecenter: (lat: number, lng: number) => void
  onLocate: () => void
  /** 등록된 내 위치 (있으면 지도에 표시) */
  home: { lat: number; lng: number } | null
  onRegister: (lat: number, lng: number) => void
}

const MAX_MARKERS = 500
const COLOR: Record<OpenState, string> = { open: '#16794a', closing: '#b45309', closed: '#6b7280', unknown: '#9ca3af' }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const e = document.createElement(tag)
  if (text !== undefined) e.textContent = text // API 문자열은 textContent로만 넣는다
  if (className) e.className = className
  return e
}

function popupFor(r: MapRow, now: Date, onSelect: (id: string) => void): HTMLElement {
  const box = el('div', undefined, 'map-popup')
  box.append(el('strong', r.p.name))
  box.append(el('div', `${STATE_LABEL[openState(r.p, now)]} · ${formatDistance(r.d)}`))
  box.append(el('div', `오늘 ${formatHours(hoursFor(r.p, now))}`))
  const row = el('div', undefined, 'map-popup-actions')
  const tel = el('a', '📞 전화')
  tel.href = `tel:${r.p.phone.replace(/-/g, '')}`
  const more = el('button', '상세·주차')
  more.type = 'button'
  more.onclick = () => onSelect(r.p.id)
  row.append(tel, more)
  box.append(row)
  return box
}

export default function MapView({ center, rows, now, onSelect, onRecenter, onLocate, home, onRegister }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const me = useRef<L.CircleMarker | null>(null)
  const [picking, setPicking] = useState(false)
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null)
  const pickingRef = useRef(false)
  const pendingMarker = useRef<L.CircleMarker | null>(null)
  const homeMarker = useRef<L.CircleMarker | null>(null)
  const cb = useRef({ onSelect, onRecenter })
  useEffect(() => { cb.current = { onSelect, onRecenter } })
  useEffect(() => { pickingRef.current = picking }, [picking])

  // 지도는 한 번만 만든다. 이후 변경은 아래 effect들이 반영한다.
  useEffect(() => {
    const m = L.map(host.current!).setView([center.lat, center.lng], 15)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (pickingRef.current) setPending({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    map.current = m
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    m.setView([center.lat, center.lng], m.getZoom())
    me.current?.remove()
    me.current = L.circleMarker([center.lat, center.lng], {
      radius: 9, color: '#fff', weight: 3, fillColor: '#0b6bcb', fillOpacity: 1,
    }).bindTooltip('기준 위치').addTo(m)
  }, [center.lat, center.lng])

  // 등록된 내 위치(주황)와 등록 대기 중인 위치(보라) 표시
  useEffect(() => {
    const m = map.current
    if (!m) return
    homeMarker.current?.remove()
    homeMarker.current = home
      ? L.circleMarker([home.lat, home.lng], { radius: 10, color: '#fff', weight: 3, fillColor: '#ea7a00', fillOpacity: 1 })
          .bindTooltip('등록한 내 위치').addTo(m)
      : null
  }, [home])

  useEffect(() => {
    const m = map.current
    if (!m) return
    pendingMarker.current?.remove()
    pendingMarker.current = pending
      ? L.circleMarker([pending.lat, pending.lng], { radius: 10, color: '#fff', weight: 3, fillColor: '#7e3ff2', fillOpacity: 1 })
          .bindTooltip('여기를 등록할까요?', { permanent: true, direction: 'top', offset: [0, -10] }).addTo(m)
      : null
  }, [pending])

  const stopPicking = () => { setPicking(false); setPending(null) }

  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    for (const r of rows.slice(0, MAX_MARKERS)) {
      L.circleMarker([r.p.lat, r.p.lng], {
        radius: 8, color: '#fff', weight: 2, fillColor: COLOR[openState(r.p, now)], fillOpacity: 0.95,
      })
        .bindPopup(() => popupFor(r, now, (id) => cb.current.onSelect(id)))
        .addTo(g)
    }
  }, [rows, now])

  return (
    <div>
      <div className="map-bar">
        <button className="chip" onClick={onLocate}>📍 내 위치로</button>
        <button
          className="chip"
          aria-pressed={picking}
          onClick={() => (picking ? stopPicking() : setPicking(true))}
        >
          📌 지도에서 내 위치 등록
        </button>
        <button
          className="chip"
          onClick={() => { const c = map.current!.getCenter(); cb.current.onRecenter(c.lat, c.lng) }}
        >
          이 지도 중심에서 재검색
        </button>
      </div>
      {picking && (
        <div className="banner" role="status">
          {pending ? '보라색 위치를 내 위치로 등록할까요?' : '지도에서 내 위치로 등록할 곳을 눌러 주세요.'}
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="chip"
              disabled={!pending}
              onClick={() => { if (pending) { onRegister(pending.lat, pending.lng); stopPicking() } }}
            >
              등록
            </button>
            <button className="chip" onClick={stopPicking}>취소</button>
          </div>
        </div>
      )}
      <div ref={host} className={`map${picking ? ' picking' : ''}`} role="application" aria-label="약국 지도" />
      <p className="meta">
        <span className="dot" style={{ background: COLOR.open }} /> 영업 중{' '}
        <span className="dot" style={{ background: COLOR.closing }} /> 곧 종료 · 영업 중인 약국만 표시 · {rows.length}곳
        {rows.length > MAX_MARKERS && ` · 가까운 ${MAX_MARKERS}곳만 표시`}
      </p>
    </div>
  )
}
