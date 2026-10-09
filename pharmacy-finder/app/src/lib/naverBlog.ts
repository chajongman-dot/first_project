export type NaverBlogResult =
  | { status: 'ok'; total: number }
  | { status: 'no-key' }
  | { status: 'error'; message: string }

const cache = new Map<string, Promise<NaverBlogResult>>()

/** 약국 이름 + 동네로 네이버 블로그 글 수(검색 총 건수)를 조회한다. 정확한 리뷰 수가 아닌 대략치. */
export function loadNaverBlogCount(name: string, address: string): Promise<NaverBlogResult> {
  const dong = address.match(/\(([^)]*?)(?:,|\))/)?.[1] ?? ''
  const area = /(동|읍|면|가|리)$/.test(dong) ? dong : address.split(/\s+/).slice(1, 3).join(' ')
  const query = `${name} ${area}`.trim()
  let p = cache.get(query)
  if (!p) {
    p = fetch(`/api/naver-blog?query=${encodeURIComponent(query)}`)
      .then(async (r): Promise<NaverBlogResult> => {
        const j = (await r.json().catch(() => ({}))) as { total?: number; error?: string; message?: string }
        if (r.status === 501 || r.status === 404) return { status: 'no-key' }
        if (!r.ok || typeof j.total !== 'number') return { status: 'error', message: j.error ?? String(r.status) }
        return { status: 'ok', total: j.total }
      })
      .catch((e: Error): NaverBlogResult => ({ status: 'error', message: e.message }))
    p.then((r) => { if (r.status === 'error') cache.delete(query) })
    cache.set(query, p)
  }
  return p
}
