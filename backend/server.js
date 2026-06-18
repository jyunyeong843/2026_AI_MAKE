require('dotenv').config()

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ── ORS 설정 ─────────────────────────────────────────────
// API 키는 코드/깃에 박지 말고 환경변수로 주입하세요.
//   PowerShell:  $env:ORS_API_KEY="5b3ce..."; node server.js
//   bash/zsh:    ORS_API_KEY="5b3ce..." node server.js
//   (또는 dotenv 사용: 맨 위에  require('dotenv').config()  )
const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

const RAIN_THRESHOLD_MM = 10;
const WALK_SPEED_MPS = 1.0; // 어르신 기준 보행 속도 (프론트와 동일)

// 경사·계단 가중치 (CLAUDE.md 6장 매트릭스)
//   평상(dry): 5~10% ×1.5, >10% ×4.0, 계단 ×8.0 (모두 통행 가능)
//   우천(wet): 5~10% ×4.0, >10%·계단 = 통행불가(경로 제외)
const SLOPE_WARN_PCT = 5;
const SLOPE_DANGER_PCT = 10;
const WEIGHTS = {
  dry: { s5_10: 1.5, sOver10: 4.0, steps: 8.0, blockDanger: false, blockSteps: false },
  wet: { s5_10: 4.0, sOver10: null, steps: null, blockDanger: true, blockSteps: true },
};

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// === 목 데이터 로드 (시설 좌표 조회 / 폴백용) ===
let MOCK;
try {
    MOCK = JSON.parse(fs.readFileSync(path.join(__dirname, 'route_payload_mock.json'), 'utf-8'));
    console.log(`목데이터 로드 완료: 시설 ${MOCK.facilities.length}개 / 경로 ${MOCK.routes.length}개`);
} catch (e) {
    console.error("route_payload_mock.json 을 server.js 와 같은 폴더에 두세요.", e.message);
    process.exit(1);
}

app.get('/', (req, res) => {
    res.send('한걸음 백엔드 정상 작동 중입니다! (ORS 보행자 경로)');
});

// [API 1] 내 위치 1km 내 시설 목록 (변경 없음)
app.get('/api/facilities', (req, res) => {
    console.log("[시설 목록 요청]");
    res.status(200).json({
        success: true,
        user_location: MOCK.context.user_location,
        data: MOCK.facilities,
    });
});

// [API 2] 기존 목 경로 (호환용으로 그대로 유지)
app.get('/api/route', (req, res) => {
    const facilityId = req.query.facilityId || MOCK.facilities[0].id;
    const routes = MOCK.routes.filter(r => r.dest_facility_id === facilityId);
    if (routes.length === 0) {
        return res.status(404).json({ success: false, message: `해당 시설의 경로가 없습니다: ${facilityId}` });
    }
    const facility = MOCK.facilities.find(f => f.id === facilityId);
    const acc = routes.find(r => r.route_id.startsWith('r_acc'));
    res.status(200).json({
        context: MOCK.context,
        facilities: facility ? [facility] : [],
        recommended_route_id: acc ? acc.route_id : routes[0].route_id,
        no_safe_route: false,
        routes,
    });
});

/**
 * [API 3] ★ 프론트(api.js)가 실제로 호출하는 엔드포인트 ★
 * POST /api/route/score
 * body 예: {
 *   context: { user_location: {lat,lng}, rainfall_mm_per_h },
 *   facility: { id, name },          // 선택
 *   dest:     { lat, lng, facilityId, name }   // ← api.js 패치로 함께 보내면 모든 목적지 지원
 * }
 *
 * ORS foot-walking 으로 (1) 최단 (2) 계단 회피 두 경로를 만들어
 * 기존 route_payload_mock.json 스키마로 변환해 반환한다.
 * (경사/계단/거리 판단은 모두 여기서 — CLAUDE.md 규칙)
 */
app.post('/api/route/score', async (req, res) => {
    const body = req.body || {};
    const origin = body.context && body.context.user_location;
    const rainfall = (body.context && body.context.rainfall_mm_per_h) || 0;
    const facilityId = (body.facility && body.facility.id) || (body.dest && body.dest.facilityId) || null;

    // 도착지 좌표: payload.dest 우선, 없으면 시설 id로 목데이터에서 조회
    let dest = body.dest && body.dest.lat != null ? body.dest : null;
    if (!dest && facilityId) {
        const f = MOCK.facilities.find(x => x.id === facilityId);
        if (f) dest = { lat: f.lat, lng: f.lng };
    }

    if (!origin || !dest) {
        return res.status(400).json({ success: false, message: 'origin/dest 좌표가 필요합니다.' });
    }
    if (!ORS_API_KEY) {
        return res.status(500).json({ success: false, message: 'ORS_API_KEY 환경변수가 설정되지 않았습니다.' });
    }

    console.log(`[경로 요청] ${origin.lat},${origin.lng} → ${dest.lat},${dest.lng} (facility=${facilityId})`);

    try {
        // 최단 / 계단 회피 두 경로를 병렬 요청. 계단 없는 경로가 아예 없으면 accessible=null
        const [shortest, accessible] = await Promise.all([
            orsRoute(origin, dest, { avoidSteps: false }),
            orsRoute(origin, dest, { avoidSteps: true }).catch(() => null),
        ]);

        const weather_mode = rainfall >= RAIN_THRESHOLD_MM ? 'wet' : 'dry';

        const routes = [];
        if (shortest)   routes.push(toRoute('r_short', '최단', facilityId, shortest, weather_mode));
        if (accessible) routes.push(toRoute('r_acc', '어르신 친화', facilityId, accessible, weather_mode));

        if (routes.length === 0) {
            return res.status(502).json({ success: false, message: 'ORS 경로 계산 실패' });
        }

        // ★ 진짜 경사 채점: 통행 가능한 경로 중 보행 비용(거리×경사·계단 가중치)이
        //   가장 낮은 = 가장 완만한 경로를 추천. (계단 회피를 무조건 고르지 않음)
        const usable = routes.filter(r => !r.blocked);
        const pool = usable.length ? usable : routes;
        const recommended = pool.reduce((best, r) => (r.cost < best.cost ? r : best), pool[0]);

        res.status(200).json({
            data: {
                context: { user_location: origin, rainfall_mm_per_h: rainfall, weather_mode },
                weather_mode,
                recommended_route_id: recommended.route_id,
                no_safe_route: usable.length === 0,
                routes,
            },
        });
    } catch (e) {
        console.error('[ORS 오류]', e.message);
        res.status(502).json({ success: false, message: 'ORS 요청 실패: ' + e.message });
    }
});

// ── ORS 호출: foot-walking + (옵션)계단 회피 + 고도/경사/길종류 정보 ──
async function orsRoute(origin, dest, { avoidSteps }) {
    const reqBody = {
        coordinates: [
            [origin.lng, origin.lat], // ★ ORS는 [경도, 위도] 순서
            [dest.lng, dest.lat],
        ],
        elevation: true,                    // 3번째 좌표값=고도 → 경사 계산용
        extra_info: ['steepness', 'waytype'],
    };
    if (avoidSteps) reqBody.options = { avoid_features: ['steps'] };

    const r = await fetch(ORS_BASE, {
        method: 'POST',
        headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
    });
    if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`ORS ${r.status} ${txt.slice(0, 200)}`);
    }
    const json = await r.json();
    const feat = json.features && json.features[0];
    if (!feat) throw new Error('ORS 경로 없음');
    return feat;
}

// ── ORS feature → 프론트 계약(route) 형태로 변환 (+경사·계단 비용 채점) ──
function toRoute(idPrefix, label, facilityId, feat, mode) {
    const coords3d = feat.geometry.coordinates;              // [[lng,lat,elev],...]
    const coords = coords3d.map(([lng, lat]) => [lat, lng]); // Leaflet용 [위도,경도]
    const props = feat.properties || {};
    const distance = Math.round((props.summary && props.summary.distance) || routeLength(coords3d));
    const stairs = countSteps(feat);
    const maxGrade = maxGradePct(coords3d);
    const eta = Math.max(1, Math.round(distance / WALK_SPEED_MPS / 60));
    const { cost, blocked } = scoreRoute(coords3d, feat, mode);

    return {
        route_id: facilityId ? `${idPrefix}_${facilityId}` : idPrefix,
        label,
        dest_facility_id: facilityId,
        coords, // 평탄화된 폴리라인 (프론트 flattenCoords가 그대로 사용)
        total_distance_m: distance,
        eta_min: eta,
        max_grade_pct: maxGrade,
        stairs_count: stairs,
        cost,
        blocked,
        summary: { distance_m: distance, stairs, max_grade_pct: maxGrade, eta_min: eta },
    };
}

// 보행 비용 = Σ(구간 길이 × 경사·계단 가중치). 통행불가 구간이 있으면 blocked=true.
// (CLAUDE.md 7장 비용 공식 / 6장 매트릭스)
function scoreRoute(coords3d, feat, mode) {
    const w = WEIGHTS[mode] || WEIGHTS.dry;
    const stepSeg = buildStepSegments(feat, coords3d.length); // 구간별 계단 여부
    let cost = 0;
    let blocked = false;

    for (let i = 0; i < coords3d.length - 1; i++) {
        const [lng1, lat1, e1] = coords3d[i];
        const [lng2, lat2, e2] = coords3d[i + 1];
        const segLen = haversine(lat1, lng1, lat2, lng2);
        if (segLen < 0.5) continue;
        const grade = (e1 != null && e2 != null) ? Math.abs((e2 - e1) / segLen) * 100 : 0;

        let mult = 1.0;
        if (stepSeg[i]) {
            if (w.blockSteps) { blocked = true; mult = 1.0; } else { mult = w.steps; }
        } else if (grade > SLOPE_DANGER_PCT) {
            if (w.blockDanger) { blocked = true; mult = 1.0; } else { mult = w.sOver10; }
        } else if (grade >= SLOPE_WARN_PCT) {
            mult = w.s5_10;
        }
        cost += segLen * mult;
    }
    return { cost: Math.round(cost * 10) / 10, blocked };
}

// waytype extras(좌표 인덱스 범위) → 구간별 계단 여부 boolean 배열
function buildStepSegments(feat, n) {
    const seg = new Array(Math.max(0, n - 1)).fill(false);
    const vals = (feat.properties && feat.properties.extras
        && feat.properties.extras.waytype && feat.properties.extras.waytype.values) || [];
    for (const [start, end, type] of vals) {
        if (type !== 8) continue; // 8 = Steps
        for (let i = start; i < end && i < seg.length; i++) seg[i] = true;
    }
    return seg;
}

// 계단 구간 수: extras.waytype 에서 value === 8(Steps) 인 구간 개수
function countSteps(feat) {
    const vals = (feat.properties && feat.properties.extras
        && feat.properties.extras.waytype && feat.properties.extras.waytype.values) || [];
    return vals.filter(v => v[2] === 8).length;
}

// 고도 배열로 최대 경사도(%) 계산
function maxGradePct(coords3d) {
    let max = 0;
    for (let i = 0; i < coords3d.length - 1; i++) {
        const [lng1, lat1, e1] = coords3d[i];
        const [lng2, lat2, e2] = coords3d[i + 1];
        if (e1 == null || e2 == null) continue;
        const horiz = haversine(lat1, lng1, lat2, lng2);
        if (horiz < 1) continue;
        const g = Math.abs((e2 - e1) / horiz) * 100;
        if (g > max) max = g;
    }
    return Math.round(max * 10) / 10;
}

// 좌표 총길이(m) — summary.distance 없을 때 보조
function routeLength(coords3d) {
    let m = 0;
    for (let i = 0; i < coords3d.length - 1; i++) {
        m += haversine(coords3d[i][1], coords3d[i][0], coords3d[i + 1][1], coords3d[i + 1][0]);
    }
    return m;
}

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000, toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

app.listen(PORT, '0.0.0.0', () => {
    console.log("==================================================");
    console.log("한걸음 백엔드(ORS 보행자 경로) 서버가 켜졌습니다!");
    console.log(`포트: http://localhost:${PORT}`);
    console.log("  - GET  /api/facilities                 (1km 시설 목록)");
    console.log("  - GET  /api/route?facilityId=fac_001   (기존 목, 호환용)");
    console.log("  - POST /api/route/score                (★ ORS 보행자 경로)");
    console.log(`  - ORS_API_KEY: ${ORS_API_KEY ? '설정됨' : '※ 미설정 — 환경변수 필요'}`);
    console.log("==================================================");
});