// 도착지 목록 (첫 화면 2x2 버튼)
// 좌표는 항상 [위도(lat), 경도(lng)] 순서를 따른다 — CLAUDE.md 규칙.
// category 는 CLAUDE.md 시설 카테고리 enum 을 따른다.
//
// facilityId 가 있는 도착지(동선동·삼선동)는 route_mock.json 의 실제 채점 경로를 쓴다.
// facilityId 가 없는 도착지(성북구청·경로당)는 시연용 형식 카드로, 간단 합성 경로를 그린다.
export const DESTINATIONS = [
  {
    id: 'seongbuk_gu_office',
    name: '성북구청',
    category: 'district_office',
    icon: 'office',
    lat: 37.5894,
    lng: 127.0167,
  },
  {
    id: 'dongseon_dong_center',
    facilityId: 'fac_003',
    name: '동선동\n주민센터',
    category: 'community_center',
    icon: 'building',
    lat: 37.5939893309527,
    lng: 127.02041567567342,
  },
  {
    id: 'senior_center',
    name: '경로당',
    category: 'senior_center',
    icon: 'people',
    lat: 37.5905,
    lng: 127.019,
  },
  {
    id: 'samseon_dong_center',
    facilityId: 'fac_004',
    name: '삼선동\n주민센터',
    category: 'community_center',
    icon: 'building',
    lat: 37.59082770536046,
    lng: 127.0146515622994,
  },
]

// 카테고리 → 한국어 라벨 (목록/안내용)
export const CATEGORY_LABEL = {
  community_center: '주민센터',
  district_office: '구청',
  welfare_center: '복지관',
  culture_center: '문화센터',
  senior_center: '경로당',
}

// GPS 미허용 시 사용할 기본 출발지 — route_mock.json 의 user_location 과 동일하게 맞춰
// 데모 시 현재 위치 점이 경로 시작점에 정확히 놓이도록 한다.
export const DEFAULT_ORIGIN = { lat: 37.5896611324901, lng: 127.019963630869 }
