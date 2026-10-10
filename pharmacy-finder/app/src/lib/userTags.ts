import type { Tag } from '../types'

/** 사용자가 직접 지정할 수 있는 분류 */
export type UserTag = Extract<Tag, 'warehouse'>
export const USER_TAGS: UserTag[] = ['warehouse']
export const USER_TAG_LABEL: Record<UserTag, string> = { warehouse: '창고형 약국' }

// 이전 버전에서 저장한 '대형'·'할인' 분류는 창고형으로 합쳐 읽는다.
const LEGACY: Record<string, UserTag> = { large: 'warehouse', discount: 'warehouse' }

/** 약국 id → 사용자가 지정한 분류 */
export type UserTagMap = Record<string, UserTag[]>

const KEY = 'pharmacy-finder:user-tags'

// 지정한 분류는 이 기기의 localStorage에만 저장한다. 저장소 접근이 막힌 환경에서도 앱이 동작하도록 try/catch로 감싼다.
export function loadUserTags(): UserTagMap {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    const out: UserTagMap = {}
    for (const [id, tags] of Object.entries(v)) {
      if (Array.isArray(tags)) {
        const ok = new Set(tags.map((t) => LEGACY[t as string] ?? t).filter((t): t is UserTag => USER_TAGS.includes(t as UserTag)))
        if (ok.size) out[id] = [...ok]
      }
    }
    return out
  } catch {
    return {}
  }
}

/** 분류를 켜거나 끈 새 지도를 만들어 저장한다. 비어 있는 약국은 항목을 지운다. */
export function setUserTag(map: UserTagMap, id: string, tag: UserTag, on: boolean): UserTagMap {
  const cur = new Set(map[id] ?? [])
  if (on) cur.add(tag)
  else cur.delete(tag)
  const next = { ...map }
  if (cur.size) next[id] = USER_TAGS.filter((t) => cur.has(t))
  else delete next[id]
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* 저장 불가: 이번 방문에만 유지 */ }
  return next
}
