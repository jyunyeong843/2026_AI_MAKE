// 경로 추천 API 클라이언트.
//
// CLAUDE.md 규칙: 경사/강수/비용 판단은 백엔드(채점 엔진)에서만 한다.
// 프론트는 (1) 컨텍스트를 만들어 보내고, (2) 받은 좌표·추천 플래그를 그릴 뿐이다.
//
// 백엔드 채점 엔드포인트(/api/route/score)가 있으면 그 결과를 쓰고,
// 없으면 채점 엔진이 미리 만들어 둔 route_mock.json(파이썬 출력)을 폴백으로 쓴다.
// 어느 경우든 파이썬 출력 스키마를 프론트 계약 형태로 변환(normalize)한다.
import routeMock from '../data/route_mock.json'

const RAIN_THRESHOLD_MM = 10
const WALK_SPEED_MPS = 1.0

// 메인 진입점: 출발지·도착지로 추천 경로(채점 결과)를 받는다.
export async function getRecommendedRoute(origin, dest, { rainfall = 0 } = {}) {
  const payload = {
    context: {
      user_location: { lat: origin.lat, lng: origin.lng },
      rainfall_mm_per_h: rainfall,
    },
    facility: dest.facilityId
      ? { id: dest.facilityId, name: dest.name.replace(/\n/g, ' ') }
      : null,
    // 목적지 좌표를 함께 보내면 백엔드가 시설 4개뿐 아니라 모든 목적지를 ORS로 라우팅한다.
    dest: {
      lat: dest.lat,
      lng: dest.lng,
      facilityId: dest.facilityId ?? null,
      name: dest.name.replace(/\n/g, ' '),
    },
  }

  try {
    const res = await fetch('/api/route/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const json = await res.json()
      return normalizeScorerOutput(json.data ?? json, dest)
    }
  } catch {
    /* 네트워크/엔드포인트 없음 → 로컬 폴백 */
  }

  // 폴백 1: 채점 데이터가 있는 도착지(동선동·삼선동)는 route_mock.json 사용
  const hasMock =
    dest.facilityId && (routeMock.routes || []).some((r) => r.dest_facility_id === dest.facilityId)
  if (hasMock) return normalizeScorerOutput(routeMock, dest)

  // 폴백 2: 형식상 도착지(성북구청·경로당 등)는 간단 합성 경로로 표시
  return buildSyntheticResult(origin, dest, rainfall)
}

// 채점 데이터가 없는 도착지를 위한 간단 합성 우회경로(데모 형식용).
// 출발→도착을 살짝 휘어 잇고, 거리/시간만 실제로 계산해 표시한다.
function buildSyntheticResult(origin, dest, rainfall) {
  const n = 6
  const coords = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const lat = origin.lat + (dest.lat - origin.lat) * t
    const lng = origin.lng + (dest.lng - origin.lng) * t
    const wobble = Math.sin(t * Math.PI) * 0.0009 // 우회처럼 보이도록 좌우로 휨
    coords.push([lat + wobble, lng - wobble])
  }
  const total = Math.round(routeLength(coords))
  return {
    mode: rainfall >= RAIN_THRESHOLD_MM ? 'wet' : 'dry',
    rainfall_mm_per_h: rainfall,
    recommended_route_id: 'r_demo',
    origin: { lat: origin.lat, lng: origin.lng },
    routes: [
      {
        route_id: 'r_demo',
        label: '경사로 우회경로',
        coords,
        total_distance_m: total,
        eta_min: Math.max(1, Math.round(total / WALK_SPEED_MPS / 60)),
        max_grade_pct: 0,
        stairs_count: 0,
        cost: null,
        blocked: false,
      },
    ],
  }
}

// 파이썬 채점 출력(weather_mode / summary / segments / lon) → 프론트 계약 형태로 변환.
// dest 가 주어지면 그 시설(facilityId)의 경로만 골라낸다.
function normalizeScorerOutput(out, dest) {
  const ctx = out.context || {}
  const rain = ctx.rainfall_mm_per_h ?? out.rainfall_mm_per_h ?? 0
  const mode = out.mode || out.weather_mode || (rain >= RAIN_THRESHOLD_MM ? 'wet' : 'dry')

  // 선택한 도착지가 있으면 그 시설의 경로만, 없으면 전체.
  const facilityId = dest?.facilityId
  const raw = (out.routes || []).filter(
    (r) => !facilityId || r.dest_facility_id === facilityId,
  )

  const routes = raw.map((r) => {
    const s = r.summary || {}
    const coords = flattenCoords(r)
    const total = Math.round(r.total_distance_m ?? s.distance_m ?? routeLength(coords))
    return {
      route_id: r.route_id,
      label: normalizeLabel(r.label),
      coords,
      total_distance_m: total,
      eta_min: r.eta_min ?? s.eta_min ?? Math.max(1, Math.round(total / WALK_SPEED_MPS / 60)),
      max_grade_pct: r.max_grade_pct ?? s.max_grade_pct ?? 0,
      stairs_count: r.stairs_count ?? s.stairs ?? 0,
      cost: r.cost ?? null,
      blocked: r.blocked ?? false,
    }
  })

  // 추천 경로: 파일의 recommended_route_id 가 이 시설 경로에 속하면 그걸,
  // 아니면 '어르신 친화'(r_acc) 경로를, 그것도 없으면 거리 최소 경로를 추천.
  let recommendedId = routes.find((r) => r.route_id === out.recommended_route_id)?.route_id
  if (!recommendedId) {
    const acc = routes.find((r) => r.route_id.startsWith('r_acc') || r.label.includes('우회'))
    recommendedId = acc?.route_id ?? routes[0]?.route_id
  }

  return {
    mode,
    rainfall_mm_per_h: rain,
    recommended_route_id: recommendedId,
    // 현재 위치 점을 경로 시작점에 정확히 맞추기 위해 채점기의 user_location 을 함께 전달
    origin: ctx.user_location ? { lat: ctx.user_location.lat, lng: ctx.user_location.lng } : null,
    routes,
  }
}

// '어르신 친화' / '최단' 라벨을 화면 표기에 맞춰 다듬는다.
function normalizeLabel(label) {
  if (!label) return '경로'
  if (label.includes('친화') || label.includes('우회')) return '경사로 우회경로'
  if (label.includes('최단')) return '최단 경로'
  return label
}

// 경로의 모든 segment 좌표를 하나의 [[lat,lng],...] 배열로 평탄화(이음점 중복 제거).
function flattenCoords(route) {
  if (Array.isArray(route.coords) && route.coords.length) return route.coords
  const out = []
  for (const seg of route.segments || []) {
    for (const c of seg.coords || []) {
      const last = out[out.length - 1]
      if (!last || last[0] !== c[0] || last[1] !== c[1]) out.push(c)
    }
  }
  return out
}

// 좌표 배열의 대략적 총 길이(m) — total_distance 가 없을 때 보조용.
function routeLength(coords) {
  let m = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const dLat = (coords[i + 1][0] - coords[i][0]) * 111320
    const dLng = (coords[i + 1][1] - coords[i][1]) * 111320 * Math.cos((coords[i][0] * Math.PI) / 180)
    m += Math.hypot(dLat, dLng)
  }
  return m
}
