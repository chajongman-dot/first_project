import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * 네이버 블로그 검색 중계 (/api/naver-blog?query=...).
 * 네이버 검색 API는 브라우저 호출(CORS)이 막혀 있고 Secret을 화면에 노출하면 안 되므로,
 * 서버 측에서 키를 붙여 호출하고 { total } 만 돌려준다.
 * 개발(dev)·미리보기(preview) 서버에서만 동작한다. 배포 시에는 같은 경로의 서버리스 함수가 필요하다.
 */
function naverBlogProxy(env: Record<string, string>): Plugin {
  const handler = async (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/naver-blog')) return next()
    const send = (status: number, body: unknown) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    const id = env.NAVER_CLIENT_ID
    const secret = env.NAVER_CLIENT_SECRET
    if (!id || !secret) return send(501, { error: 'no-key' })
    const query = new URL(req.url, 'http://localhost').searchParams.get('query')
    if (!query) return send(400, { error: 'no-query' })
    try {
      const r = await fetch(`https://openapi.naver.com/v1/search/blog.json?display=1&query=${encodeURIComponent(query)}`, {
        headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
      })
      const j = (await r.json()) as { total?: number; errorCode?: string; errorMessage?: string }
      if (!r.ok) return send(r.status, { error: j.errorCode ?? 'naver-error', message: j.errorMessage })
      send(200, { total: j.total ?? 0 })
    } catch (e) {
      send(502, { error: 'fetch-failed', message: (e as Error).message })
    }
  }
  return {
    name: 'naver-blog-proxy',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), naverBlogProxy(loadEnv(mode, process.cwd(), ''))],
}))
