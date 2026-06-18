// 경로 추천 API 클라이언트.
//
// CLAUDE.md 규칙: 경사/강수/비용 판단은 백엔드(채점 엔진)에서만 한다.
// 프론트는 (1) 컨텍스트를 만들어 보내고, (2) 받은 좌표·추천 플래그를 그릴 뿐이다.
//
// 백엔드 채점 엔드포인트가 아직 없으면, CLAUDE.md 데이터 계약과 동일한 형태의
// 로컬 mock 으로 폴백한다(데모가 단독으로 동작하도록).
import { distanceM } from './geo'

const RULES = {
  slope_warn_pct: 5,
  slope_danger_pct: 10,
  rain_threshold_mm: 10,
  walk_speed_mps: 1.0,
  weights: {
    dry: { slope_5_10: 1.5, slope_over_10: 4.0, steps: 8.0, block_danger: false, block_steps: false },
    wet: { slope_5_10: 4.0, slope_over_10: null, steps: null, block_danger: true, block_steps: true },
  },
}

// 메인 진입점: 출발지·도착지로 추천 경로(채점 결과)를 받는다.
export async function getRecommendedRoute(origin, dest, { rainfall = 0 } = {}) {
  const payload = buildPayload(origin, dest, rainfall)
  try {
    const res = await fetch('/api/route/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const json = await res.json()
      // 백엔드가 {data} 래핑을 쓰는 경우와 직접 반환 둘 다 허용
      return json.data ?? json
    }
  } catch {
    /* 네트워크/엔드포인트 없음 → mock 폴백 */
  }
  return scorePayloadMock(payload)
}

// CLAUDE.md 입력 스키마(context/facilities/routes) 구성
function buildPayload(origin, dest, rainfall) {
  return {
    context: {
      user_location: { lat: origin.lat, lng: origin.lng },
      rainfall_mm_per_h: rainfall,
      rules: RULES,
    },
    facilities: [
      {
        id: dest.id,
        name: dest.name.replace(/\n/g, ' '),
        category: dest.category,
        lat: dest.lat,
        lng: dest.lng,
        distance_m: Math.round(distanceM(origin, dest)),
      },
    ],
    routes: buildCandidateRoutes(origin, dest),
  }
}

// 후보 경로 2개 생성: 최단 경로 + 경사 우회(무장애) 경로.
// (실서비스에서는 osmnx 그래프가 만들지만, 데모용으로 좌표를 합성한다.)
function buildCandidateRoutes(origin, dest) {
  const shortest = makeRoute('r_short', '최단 경로', origin, dest, dest.id, {
    bend: 0.0002,
    grades: [2, 7, 12, 6], // 일부 가파른 구간 포함
    steps: [false, false, true, false],
  })
  const accessible = makeRoute('r_acc', '경사로 우회경로', origin, dest, dest.id, {
    bend: 0.0011,
    detour: true,
    grades: [2, 3, 4, 3, 2], // 완만한 구간 위주
    steps: [false, false, false, false, false],
  })
  return [shortest, accessible]
}

// 출발→도착 사이를 구간(segment)으로 쪼개 합성한다.
function makeRoute(route_id, label, origin, dest, dest_facility_id, opt) {
  const n = opt.grades.length
  const pts = [origin]
  for (let i = 1; i < n; i++) {
    const t = i / n
    const lat = origin.lat + (dest.lat - origin.lat) * t
    const lng = origin.lng + (dest.lng - origin.lng) * t
    // 경로가 한 줄로 겹치지 않게 좌우로 휜다. 우회 경로는 더 크게 우회.
    const wobble = Math.sin(t * Math.PI) * opt.bend * (opt.detour ? 1 : -1)
    pts.push({ lat: lat + wobble, lng: lng - wobble })
  }
  pts.push(dest)

  const segments = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    segments.push({
      seg_id: i,
      coords: [[a.lat, a.lng], [b.lat, b.lng]],
      length_m: Math.round(distanceM(a, b)),
      grade_pct: opt.grades[i] ?? 2,
      is_steps: opt.steps[i] ?? false,
    })
  }
  return { route_id, label, dest_facility_id, segments }
}

// ── 로컬 채점기 (CLAUDE.md 6장 비용 공식과 동일) ─────────────────
function scorePayloadMock(payload) {
  const rain = payload.context.rainfall_mm_per_h
  const mode = rain >= RULES.rain_threshold_mm ? 'wet' : 'dry'
  const w = RULES.weights[mode]

  const routes = payload.routes.map((r) => {
    let total = 0
    let cost = 0
    let maxGrade = 0
    let stairs = 0
    let blocked = false
    const flags = []
    const coords = [r.segments[0].coords[0]]

    for (const s of r.segments) {
      coords.push(s.coords[1])
      total += s.length_m
      maxGrade = Math.max(maxGrade, s.grade_pct)
      const at = s.coords[1]

      let mult = 1.0
      if (s.is_steps) {
        stairs += 1
        if (w.block_steps) blocked = true
        else mult = w.steps
        flags.push({ type: 'steps', at })
      } else if (s.grade_pct > RULES.slope_danger_pct) {
        if (w.block_danger) blocked = true
        else mult = w.slope_over_10
        flags.push({ type: 'slope_over_10', at })
      } else if (s.grade_pct >= RULES.slope_warn_pct) {
        mult = w.slope_5_10
        flags.push({ type: 'slope_5_10', at })
      }
      cost += s.length_m * mult
    }

    return {
      route_id: r.route_id,
      label: r.label,
      coords,
      total_distance_m: total,
      eta_min: Math.max(1, Math.round(total / RULES.walk_speed_mps / 60)),
      max_grade_pct: Math.round(maxGrade * 10) / 10,
      stairs_count: stairs,
      cost: Math.round(cost * 10) / 10,
      blocked,
      flags,
    }
  })

  // 통행 가능한 경로 중 비용 최소를 추천
  const usable = routes.filter((r) => !r.blocked)
  const recommended = (usable.length ? usable : routes).reduce((best, r) =>
    r.cost < best.cost ? r : best,
  )

  return {
    mode,
    rainfall_mm_per_h: rain,
    recommended_route_id: recommended.route_id,
    routes,
  }
}
