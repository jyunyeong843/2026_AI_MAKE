const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// === 목 데이터 로드 (server.js 와 같은 폴더에 route_payload_mock.json 필요) ===
let MOCK;
try {
    MOCK = JSON.parse(fs.readFileSync(path.join(__dirname, 'route_payload_mock.json'), 'utf-8'));
    console.log(`목데이터 로드 완료: 시설 ${MOCK.facilities.length}개 / 경로 ${MOCK.routes.length}개`);
} catch (e) {
    console.error("route_payload_mock.json 을 server.js 와 같은 폴더에 두세요.", e.message);
    process.exit(1);
}

// 테스트용 메인 루트
app.get('/', (req, res) => {
    res.send('한걸음 백엔드(목데이터) 정상 작동 중입니다!');
});

/**
 * [API 1] 내 위치 1km 내 공공·복지 시설 목록 (목적지 선택 화면)
 * GET /api/facilities
 */
app.get('/api/facilities', (req, res) => {
    console.log("[시설 목록 요청]");
    res.status(200).json({
        success: true,
        user_location: MOCK.context.user_location,
        data: MOCK.facilities,            // [{id, name, lat, lng, distance_m}, ...]
    });
});

/**
 * [API 2] 선택한 목적지까지의 경로 (최단 + 어르신 친화)
 * GET /api/route?facilityId=fac_001
 * 그 시설의 두 경로만 추려, Leaflet 렌더러가 바로 먹는 payload 형태로 반환.
 */
app.get('/api/route', (req, res) => {
    const facilityId = req.query.facilityId || MOCK.facilities[0].id;
    console.log(`[경로 요청] 목적지 ID: ${facilityId}`);

    const routes = MOCK.routes.filter(r => r.dest_facility_id === facilityId);
    if (routes.length === 0) {
        return res.status(404).json({ success: false, message: `해당 시설의 경로가 없습니다: ${facilityId}` });
    }

    const facility = MOCK.facilities.find(f => f.id === facilityId);
    const acc = routes.find(r => r.route_id.startsWith('r_acc'));   // 어르신 친화를 추천
    const recommended_route_id = acc ? acc.route_id : routes[0].route_id;

    res.status(200).json({
        context: MOCK.context,
        facilities: facility ? [facility] : [],
        recommended_route_id,
        no_safe_route: false,
        routes,                            // [최단, 어르신친화] (segments.coords 로 그림)
    });
});

// 서버 실행 (같은 와이파이 프론트팀이 노트북 IP로 접속하도록 0.0.0.0 개방)
app.listen(PORT, '0.0.0.0', () => {
    console.log("==================================================");
    console.log("한걸음 백엔드 서버가 켜졌습니다!");
    console.log(`포트: http://localhost:${PORT}`);
    console.log("  - GET /api/facilities                  (1km 시설 목록)");
    console.log("  - GET /api/route?facilityId=fac_001    (선택 시설 경로)");
    console.log("==================================================");
});