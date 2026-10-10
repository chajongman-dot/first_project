// 시도 전체 이름 → 약어 (공공데이터 주소에는 "경기 수원시"처럼 약어가 섞여 있다)
const SIDO_ABBR: Record<string, string> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주',
  대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원특별자치도: '강원',
  충청북도: '충북', 충청남도: '충남', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북',
  경상남도: '경남', 제주특별자치도: '제주',
}

/**
 * 약국 주소가 지역 라벨("경기도 수원시 팔달구 인계동")에 속하는지 판정한다.
 * - 시도: 전체 이름 또는 약어로 시작
 * - 시군구(1~2단어): 주소에 포함
 * - 동·읍·면·가·리: 주소 끝 괄호의 첫 항목이 같아야 함 (지역별 약국 수를 셀 때와 같은 기준)
 */
export function inRegion(address: string, label: string): boolean {
  const [sido, ...rest] = label.split(' ')
  if (!(address.startsWith(sido) || address.startsWith(SIDO_ABBR[sido] ?? '\0'))) return false
  const dong = /(동|읍|면|가|리)$/.test(rest[rest.length - 1] ?? '') ? rest.pop()! : ''
  if (!rest.every((t) => address.includes(t))) return false
  if (!dong) return true
  const paren = address.match(/\(([^)]*)\)\s*$/)?.[1].split(',')[0].trim()
  return paren === dong
}

/** 라벨의 마지막 단어 (필터 버튼 이름용): "경기도 수원시 팔달구 인계동" → "인계동" */
export const regionShortName = (label: string) => label.split(' ').pop() ?? label

/** 동·읍·면 단위 라벨인지 (시도·시군구만이면 false) */
export const isDongLevel = (label: string) => /(동|읍|면|가|리)$/.test(regionShortName(label)) && label.split(' ').length >= 3
