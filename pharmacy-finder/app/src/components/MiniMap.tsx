import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  lat: number
  lng: number
  name: string
  /** 근처 주차장 (P 표시) */
  lots: { id: string; name: string; lat: number; lng: number }[]
}

/** 약국 상세용 위치 미리보기. 스크롤 중 실수로 움직이지 않도록 조작은 막고 확대 버튼만 둔다. */
export default function MiniMap({ lat, lng, name, lots }: Props) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const m = L.map(host.current!, { dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false })
      .setView([lat, lng], 17)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    L.circleMarker([lat, lng], { radius: 11, color: '#fff', weight: 3, fillColor: '#c62828', fillOpacity: 1 })
      .bindTooltip(name, { permanent: true, direction: 'top', offset: [0, -10] })
      .addTo(m)
    for (const l of lots) {
      L.marker([l.lat, l.lng], {
        title: l.name,
        icon: L.divIcon({ className: '', html: '<div class="map-p">P</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).addTo(m)
    }
    return () => { m.remove() }
  }, [lat, lng, name, lots])

  return <div ref={host} className="minimap" role="img" aria-label={`${name} 위치 미리보기 지도`} />
}
