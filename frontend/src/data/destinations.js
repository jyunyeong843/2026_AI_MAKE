// 도착지 목록 (첫 화면 카드)
// 좌표는 항상 [위도(lat), 경도(lng)] 순서를 따른다 — CLAUDE.md 규칙.
// category 는 CLAUDE.md 시설 카테고리 enum 을 따른다.
//
// facilityId 가 있는 도착지(동선동·삼선동)는 route_mock.json 의 실제 채점 경로를 쓴다.
// facilityId 가 없는 도착지는 시연용 형식 카드로, 간단 합성 경로를 그린다.
//
// ⚠️ 아래 신규 도착지 좌표 대부분은 성북구 일대 기준 "근사 좌표"다.
//    실제 시설 좌표가 확정되면 교체할 것.
export const DESTINATIONS = [
  // ── 구청 ──────────────────────────────────────────
  {
    id: 'seongbuk_gu_office',
    name: '성북구청',
    category: 'district_office',
    icon: 'office',
    lat: 37.5894,
    lng: 127.0167,
  },

  // ── 주민센터 ──────────────────────────────────────
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
    id: 'samseon_dong_center',
    facilityId: 'fac_004',
    name: '삼선동\n주민센터',
    category: 'community_center',
    icon: 'building',
    lat: 37.59082770536046,
    lng: 127.0146515622994,
  },
  {
    id: 'anam_dong_center',
    name: '안암동\n주민센터',
    category: 'community_center',
    icon: 'building',
    lat: 37.5852,
    lng: 127.0286,
  },
  {
    id: 'bomun_dong_center',
    name: '보문동\n주민센터',
    category: 'community_center',
    icon: 'building',
    lat: 37.5859,
    lng: 127.0188,
  },
  {
    id: 'sungin1_dong_center',
    name: '숭인1동\n주민센터',
    category: 'community_center',
    icon: 'building',
    lat: 37.5763,
    lng: 127.0156,
  },
  {
    id: 'sungin2_dong_center',
    name: '숭인2동\n주민센터',
    category: 'community_center',
    icon: 'building',
    lat: 37.5748,
    lng: 127.0189,
  },
  {
    id: 'sinseol_dong_center',
    name: '신설동\n주민센터',
    category: 'community_center',
    icon: 'building',
    lat: 37.5768,
    lng: 127.0254,
  },

  // ── 경로당 (노인정) ──────────────────────────────
  {
    id: 'bomun_neutinamu_senior',
    name: '보문\n느티나무\n경로당',
    category: 'senior_center',
    icon: 'people',
    lat: 37.5862,
    lng: 127.0195,
  },
  {
    id: 'bomun2_dong_senior',
    name: '보문제2동\n경로당',
    category: 'senior_center',
    icon: 'people',
    lat: 37.5868,
    lng: 127.0202,
  },
  {
    id: 'dongwon_senior',
    name: '동원\n경로당',
    category: 'senior_center',
    icon: 'people',
    lat: 37.591,
    lng: 127.0175,
  },
  {
    id: 'anam3ga_senior',
    name: '안암동3가\n경로당',
    category: 'senior_center',
    icon: 'people',
    lat: 37.5848,
    lng: 127.0282,
  },
  {
    id: 'hanmadang_senior',
    name: '한마당\n경로당',
    category: 'senior_center',
    icon: 'people',
    lat: 37.5905,
    lng: 127.0188,
  },
  {
    id: 'anam_dong_nojeong',
    name: '안암동\n노인정',
    category: 'senior_center',
    icon: 'people',
    lat: 37.5855,
    lng: 127.029,
  },
  {
    id: 'anam2ga_senior',
    name: '안암2가\n경로당',
    category: 'senior_center',
    icon: 'people',
    lat: 37.586,
    lng: 127.027,
  },
  {
    id: 'bomun1_senior',
    name: '보문제1\n경로당',
    category: 'senior_center',
    icon: 'people',
    lat: 37.5872,
    lng: 127.0185,
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
