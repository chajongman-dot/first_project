const KEY = 'pharmacy-finder:search-history'
export const MAX_HISTORY = 10

// 검색 기록은 이 기기의 localStorage에만 저장한다. 저장소 접근이 막힌 환경에서도 앱이 동작하도록 try/catch로 감싼다.
export function loadHistory(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_HISTORY) : []
  } catch {
    return []
  }
}

function write(list: string[]): string[] {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* 저장 불가: 이번 방문에만 유지 */ }
  return list
}

/** 최근에 고른 검색어(완성된 이름)를 맨 앞에 추가한다. 중복은 제거하고 최대 10개만 둔다. */
export function addHistory(list: string[], name: string): string[] {
  const n = name.trim()
  if (!n) return list
  return write([n, ...list.filter((x) => x !== n)].slice(0, MAX_HISTORY))
}

export const removeHistory = (list: string[], name: string) => write(list.filter((x) => x !== name))
export const clearHistory = () => write([])

/** 입력한 글자가 포함된 기록을 최근순으로 최대 10개. 입력이 비어 있으면 전체. */
export function suggest(list: string[], input: string): string[] {
  const q = input.replace(/\s+/g, '').toLowerCase()
  return list.filter((x) => x.replace(/\s+/g, '').toLowerCase().includes(q) && x !== input.trim()).slice(0, MAX_HISTORY)
}
