// 약국 건물의 주차 대수 수집 (도로명주소 API → 지번 → 건축물대장 표제부)
// 사용: node --env-file=.env scripts/fetch-building-parking.mjs [최대약국수]
//  - 먼저 `npm run fetch-data` 로 public/data 를 만들어 두어야 한다.
//  - 중간 결과는 .cache/ 에 저장되어 중단 후 다시 실행하면 이어서 진행한다.
//  - 결과: public/data/building-parking.json  { 약국id: [주차대수 합계, 필지 내 건물 수] }  (대장 조회가 안 된 약국은 키 없음)
//    한 필지에 건물이 여럿(단지·캠퍼스)이면 합계는 모든 건물의 값이라, 앱에서 건물 수를 함께 표시한다.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'

const JUSO = process.env.JUSO_API_KEY
const DATA = process.env.DATA_GO_KR_KEY
if (!JUSO || !DATA) throw new Error('.env에 JUSO_API_KEY, DATA_GO_KR_KEY가 필요합니다.')
const LIMIT = Number(process.argv[2] ?? Infinity)
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3)
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? 150) // 건축HUB는 초당 호출 제한이 있다
const CACHE = '.cache'
await mkdir(CACHE, { recursive: true })

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class QuotaError extends Error {}

// 모든 호출 사이에 최소 간격을 둔다 (동시 실행 워커들이 공유)
let nextSlot = 0
async function throttle() {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + MIN_INTERVAL_MS
  if (at > now) await sleep(at - now)
}

async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn() } catch (e) {
      if (e instanceof QuotaError || i >= tries - 1) throw e
      await sleep(e.rateLimited ? 3000 * (i + 1) : 500 * 2 ** i)
    }
  }
}

async function pool(items, worker, label) {
  let next = 0, done = 0, stopped = null
  const t0 = Date.now()
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length && !stopped) {
      const item = items[next++]
      try { await worker(item) } catch (e) {
        if (e instanceof QuotaError) { stopped = e; return }
        throw e
      }
      if (++done % 500 === 0) console.log(`${label} ${done}/${items.length} (${Math.round((Date.now() - t0) / 1000)}s)`)
    }
  }))
  if (stopped) console.log(`\n⚠ ${stopped.message}\n  지금까지의 결과는 저장했습니다. 한도가 초기화된 뒤 같은 명령을 다시 실행하면 이어서 진행합니다.`)
  return stopped
}

// ---- 1. 약국 목록 ----
const pharmacies = []
for (const f of await readdir('public/data/pharmacies')) {
  pharmacies.push(...JSON.parse(await readFile(`public/data/pharmacies/${f}`, 'utf8')))
}
const targets = pharmacies.slice(0, LIMIT)
console.log(`약국 ${targets.length}곳 처리`)

// ---- 2. 도로명 주소 → 법정동코드·지번 ----
const roadOf = (addr) => addr.replace(/\(.*$/, '').split(',')[0].trim() // "경기도 수원시 팔달구 인계로 104"
const jusoCache = await readJson(`${CACHE}/juso.json`, {})
const roads = [...new Set(targets.map((p) => roadOf(p.address)))].filter((r) => !(r in jusoCache))
console.log(`주소 변환 대상 ${roads.length}건 (캐시 제외)`)

async function lookupJuso(road) {
  const url = new URL('https://business.juso.go.kr/addrlink/addrLinkApi.do')
  for (const [k, v] of Object.entries({ confmKey: JUSO, currentPage: 1, countPerPage: 1, keyword: road, resultType: 'json' })) url.searchParams.set(k, v)
  const j = await retry(async () => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`juso HTTP ${r.status}`)
    return r.json()
  })
  const c = j.results?.common
  if (c?.errorCode !== '0') {
    // E0001(승인키 오류) 등은 계속해도 무의미하므로 중단. E0005(검색어 없음) 등은 건너뛴다.
    if (['E0001', 'E0002', 'E0003', 'E0004', 'E0006', 'E0007'].includes(c?.errorCode)) throw new Error(`juso ${c.errorCode}: ${c.errorMessage}`)
    return null
  }
  const x = j.results.juso?.[0]
  return x ? { admCd: x.admCd, san: x.mtYn, bun: x.lnbrMnnm, ji: x.lnbrSlno } : null
}

try {
  await pool(roads, async (road) => { jusoCache[road] = await lookupJuso(road) }, '주소')
} finally {
  await writeFile(`${CACHE}/juso.json`, JSON.stringify(jusoCache))
}

// ---- 3. 건축물대장 표제부 → 주차 대수 ----
const lotKey = (j) => `${j.admCd}|${j.san}|${j.bun}|${j.ji}`
const lots = new Map()
for (const p of targets) {
  const j = jusoCache[roadOf(p.address)]
  if (j) lots.set(lotKey(j), j)
}
const bldCache = await readJson(`${CACHE}/bld.json`, {})
const lotList = [...lots].filter(([k]) => !(k in bldCache))
console.log(`건축물대장 조회 대상 ${lotList.length}필지 (캐시 제외)`)

async function lookupBuilding(j) {
  const url = new URL('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo')
  const q = {
    serviceKey: DATA, sigunguCd: j.admCd.slice(0, 5), bjdongCd: j.admCd.slice(5),
    platGbCd: j.san === '1' ? '1' : '0', bun: String(j.bun).padStart(4, '0'), ji: String(j.ji).padStart(4, '0'),
    numOfRows: 100, _type: 'json',
  }
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v)
  const res = await retry(async () => {
    await throttle()
    const r = await fetch(url)
    const text = await r.text()
    if (r.status === 429) {
      if (!/PER_SECOND/.test(text)) throw new QuotaError('건축HUB 일일 호출 한도에 도달했습니다.')
      throw Object.assign(new Error('건축HUB 초당 호출 제한'), { rateLimited: true })
    }
    if (!r.ok) throw new Error(`건축HUB HTTP ${r.status}`)
    const body = JSON.parse(text).response
    if (body.header.resultCode === '22') throw new QuotaError('건축HUB 일일 호출 한도에 도달했습니다.')
    if (body.header.resultCode !== '00') throw new Error(`건축HUB ${body.header.resultCode} ${body.header.resultMsg}`)
    return body.body
  })
  const raw = res.items?.item
  const items = Array.isArray(raw) ? raw : raw ? [raw] : []
  if (items.length === 0) return null // 대장 없음
  const sum = (k) => items.reduce((a, x) => a + (Number(x[k]) || 0), 0)
  const park = (x) => ['indrAutoUtcnt', 'oudrAutoUtcnt', 'indrMechUtcnt', 'oudrMechUtcnt'].reduce((a, k) => a + (Number(x[k]) || 0), 0)
  return {
    total: sum('indrAutoUtcnt') + sum('oudrAutoUtcnt') + sum('indrMechUtcnt') + sum('oudrMechUtcnt'),
    buildings: items.length,
    // 합산 방식을 나중에 바꿔도 API를 다시 부르지 않도록 건물별 원본 값을 남긴다
    detail: items.map((x) => ({ dong: String(x.dongNm ?? '').trim(), name: String(x.bldNm ?? '').trim(), purpose: x.mainPurpsCdNm, parking: park(x), kind: x.regstrKindCdNm })),
  }
}

try {
  await pool(lotList, async ([k, j]) => { bldCache[k] = await lookupBuilding(j) }, '대장')
} finally {
  await writeFile(`${CACHE}/bld.json`, JSON.stringify(bldCache))
}

// ---- 4. 약국 id → 주차 대수 ----
const out = {}
let matched = 0
for (const p of targets) {
  const j = jusoCache[roadOf(p.address)]
  const b = j ? bldCache[lotKey(j)] : null
  if (b) { out[p.id] = [b.total, b.buildings]; matched++ }
}
if (!Number.isFinite(LIMIT)) await writeFile('public/data/building-parking.json', JSON.stringify(out))
console.log(`완료: 주소 변환 ${targets.filter((p) => jusoCache[roadOf(p.address)]).length}/${targets.length}, 대장 확인 ${matched}/${targets.length}` +
  (Number.isFinite(LIMIT) ? ' (시험 실행: 결과 파일은 만들지 않음)' : ''))
