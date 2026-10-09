// 공공데이터 수집(전국): 약국(국립중앙의료원) + 주차장(전국주차장정보표준데이터)
// → public/data/ 아래에 0.1° 격자 조각, 지역 사전(places.json), meta.json 으로 저장
// 사용: npm run fetch-data   (node --env-file=.env scripts/fetch-data.mjs)
import { mkdir, rm, writeFile } from 'node:fs/promises'

const KEY = process.env.DATA_GO_KR_KEY
if (!KEY) throw new Error('DATA_GO_KR_KEY가 .env에 없습니다.')
const today = new Date().toISOString().slice(0, 10)
const OUT = 'public/data'
const cellKey = (lat, lng) => `${Math.floor(lng * 10)}_${Math.floor(lat * 10)}`
const r5 = (n) => Math.round(n * 1e5) / 1e5

async function getJson(base, params) {
  const url = new URL(base)
  url.searchParams.set('serviceKey', KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${base}`)
  return res.text()
}

const tag = (xml, name) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1].trim() ?? ''

const inKorea = (lat, lng) => lat > 33 && lat < 39 && lng > 124 && lng < 132

// ---- 약국 ----
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'holiday'] // dutyTime1~8
const hhmm = (s) => `${s.slice(0, 2)}:${s.slice(2, 4)}`

function parseHours(item) {
  const hours = {}
  let night = false
  DAY_KEYS.forEach((k, i) => {
    const s = tag(item, `dutyTime${i + 1}s`)
    const c = tag(item, `dutyTime${i + 1}c`)
    if (!/^\d{4}$/.test(s) || !/^\d{4}$/.test(c)) return // 정보 없음
    const start = hhmm(s)
    let end = hhmm(c)
    if (end <= start) end = '24:00' // 자정 넘김은 24:00으로 근사
    hours[k] = [start, end]
    if (end >= '22:00') night = true
  })
  return { hours, night }
}

async function fetchPharmacies() {
  const base = 'http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire'
  const out = new Map()
  for (let page = 1; ; page++) {
    const xml = await getJson(base, { pageNo: page, numOfRows: 1000 })
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
    for (const it of items) {
      const lat = Number(tag(it, 'wgs84Lat'))
      const lng = Number(tag(it, 'wgs84Lon'))
      const id = tag(it, 'hpid')
      if (!id || !inKorea(lat, lng)) continue
      const { hours, night } = parseHours(it)
      out.set(id, {
        id, name: tag(it, 'dutyName'), address: tag(it, 'dutyAddr'),
        lat: r5(lat), lng: r5(lng), phone: tag(it, 'dutyTel1'), hours, tags: night ? ['night'] : [],
        guide: tag(it, 'dutyMapimg'), // "세류사거리남문방향50m" 같은 위치 안내 문구
      })
    }
    console.log(`약국 page ${page}: ${items.length}건`)
    if (items.length < 1000) break
  }
  return [...out.values()]
}

// ---- 주차장 ----
const num = (s) => (s === '' || s == null || Number.isNaN(Number(s)) ? null : Number(s))

function toLot(r) {
  const info = r.parkingchrgeInfo ?? ''
  const free = info.includes('무료')
  const baseMin = num(r.basicTime)
  const baseFee = free ? 0 : num(r.basicCharge)
  const unitMin = num(r.addUnitTime)
  const unitFee = free ? 0 : num(r.addUnitCharge)
  const feeKnown = free || (baseMin !== null && baseFee !== null)
  return {
    id: r.prkplceNo, name: r.prkplceNm, address: r.rdnmadr || r.lnmadr, lat: 0, lng: 0, capacity: num(r.prkcmprt) ?? 0,
    operating_hours: `${r.weekdayOperOpenHhmm || '?'}~${r.weekdayOperColseHhmm || '?'}`,
    fee_known: feeKnown, fee_type: info || '미상',
    free_minutes: 0, base_minutes: baseMin ?? 30, base_fee: baseFee ?? 0,
    extra_unit_minutes: unitMin ?? 1, extra_unit_fee: unitFee ?? 0,
    daily_max_fee: num(r.dayCmmtkt), updated_at: r.referenceDate || today,
  }
}

async function fetchParking() {
  const base = 'http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api'
  const out = new Map()
  for (let page = 1; ; page++) {
    const json = JSON.parse(await getJson(base, { type: 'json', pageNo: page, numOfRows: 1000 }))
    const items = json.body?.items?.item ?? json.body?.items ?? []
    for (const r of items) {
      const lat = Number(r.latitude), lng = Number(r.longitude)
      if (!inKorea(lat, lng) || !r.prkplceNo) continue
      out.set(r.prkplceNo, { ...toLot(r), lat: r5(lat), lng: r5(lng) })
    }
    if (items.length < 1000) break
  }
  return [...out.values()]
}

// ---- 지역 사전: 약국 주소에서 시도·시군구·동 중심 좌표를 만든다 ----
const SIDO_FULL = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시', 광주: '광주광역시',
  대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시', 경기: '경기도', 강원: '강원특별자치도',
  충북: '충청북도', 충남: '충청남도', 전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도',
  경남: '경상남도', 제주: '제주특별자치도',
}

function parseRegion(address) {
  const t = address.replace(/\(.*$/, '').trim().split(/\s+/)
  const sido = SIDO_FULL[t[0]] ?? t[0]
  let sigungu = ''
  if (/(시|군|구)$/.test(t[1] ?? '')) sigungu = /시$/.test(t[1]) && /구$/.test(t[2] ?? '') ? `${t[1]} ${t[2]}` : t[1]
  const paren = address.match(/\(([^)]*)\)\s*$/)?.[1].split(',')[0].trim() ?? ''
  const dong = /^[가-힣0-9·.]+(동|읍|면|가|리)$/.test(paren) ? paren : ''
  return { sido, sigungu, dong }
}

function buildPlaces(pharmacies) {
  const acc = new Map()
  const add = (label, p) => {
    const a = acc.get(label) ?? { lat: 0, lng: 0, n: 0 }
    a.lat += p.lat; a.lng += p.lng; a.n++
    acc.set(label, a)
  }
  for (const p of pharmacies) {
    const { sido, sigungu, dong } = parseRegion(p.address)
    if (!sido) continue
    add(sido, p)
    if (sigungu) add(`${sido} ${sigungu}`, p)
    if (sigungu && dong) add(`${sido} ${sigungu} ${dong}`, p)
  }
  return [...acc].map(([n, a]) => [n, r5(a.lat / a.n), r5(a.lng / a.n), a.n])
}

async function writeCells(kind, rows) {
  const cells = new Map()
  for (const r of rows) {
    const k = cellKey(r.lat, r.lng)
    if (!cells.has(k)) cells.set(k, [])
    cells.get(k).push(r)
  }
  await mkdir(`${OUT}/${kind}`, { recursive: true })
  for (const [k, v] of cells) await writeFile(`${OUT}/${kind}/${k}.json`, JSON.stringify(v))
  return [...cells.keys()]
}

const [pharmacies, parking] = await Promise.all([fetchPharmacies(), fetchParking()])
await rm(OUT, { recursive: true, force: true })
const pharmacyCells = await writeCells('pharmacies', pharmacies)
const parkingCells = await writeCells('parking', parking)
await writeFile(`${OUT}/places.json`, JSON.stringify(buildPlaces(pharmacies)))
// 약국 이름 검색용 인덱스: [id, 이름, 지역(시도 시군구 동), 위도, 경도]
const nameIndex = pharmacies.map((p) => {
  const { sido, sigungu, dong } = parseRegion(p.address)
  return [p.id, p.name, [sido, sigungu, dong].filter(Boolean).join(' '), p.lat, p.lng]
})
await writeFile(`${OUT}/names.json`, JSON.stringify(nameIndex))
await writeFile(`${OUT}/meta.json`, JSON.stringify({
  updated_at: today, source: '국립중앙의료원 전국 약국 정보',
  counts: { pharmacies: pharmacies.length, parking: parking.length },
  cells: { pharmacies: pharmacyCells, parking: parkingCells },
}))
console.log(`약국 ${pharmacies.length}건(${pharmacyCells.length}칸), 주차장 ${parking.length}건(${parkingCells.length}칸) 저장`)
