# CLAUDE.md — 어르신 친화 무장애 경로 추천 (프로젝트명: 복지ON길)

어르신 친화 보행 경로 안내 서비스. GPS 기반 현재 위치에서 어르신이 자주 방문하는 공공·복지
시설까지, 경사·계단·강수량을 고려한 **우회 경로**를 계산·추천하고 Leaflet 지도에 그려 보여준다.

## 1. 프로젝트 목표
사용자 GPS 위치 기준 반경 1km 내 공공·복지 시설 목록을 제공하고, 사용자가 목적지를
선택하면 경사도·계단·실시간 강수량을 반영해 **어르신 친화 우회 경로**를 계산·추천한다.
최종 경로는 Leaflet 지도에 그려 보여준다.

## 2. 화면 (프론트)

### 첫 번째 화면 (도착지 선택)
- 2행 2열로 배치된 사각형 버튼들로 도착지 목록을 표시한다.
- 각 사각형 버튼을 클릭하면 두 번째 화면(지도)으로 넘어간다.
- 예시 도착지: 성북구청, 동선동 주민센터, 경로당, 삼선동 주민센터.

### 두 번째 화면 (지도)
- 현재 GPS 위치를 지도 화면에 띄운다.
- 첫 번째 화면에서 선택한 도착지까지의 우회 경로를 표시한다.
- 경로 결정 규칙은 **4. 기능 규칙(지도 룰)** 을 따른다.
- 하단에 경로 유형(예: "경사로 우회경로")과 예상 소요 시간(예: "15분")을 표시한다.
- **실시간 내비게이션**: GPS를 계속 추적해 현재 위치 점을 따라 이동시키고, 남은 거리·시간을
  갱신하며, 경로 이탈/도착을 감지해 안내한다(아래 참고).

### 실시간 내비게이션 동작
- `navigator.geolocation.watchPosition()` 으로 위치를 계속 추적해 현재 위치 점을 이동시키고 지도를 따라가게 한다.
- **남은 거리/시간**: 추천 경로 폴리라인에서 현재 위치와 가장 가까운 구간을 찾아 그 이후 거리를 합산한다.
  예상 시간은 **남은 거리 ÷ 1.0 m/s**(3장 보행 속도)로 계산해 표시한다.
- **경로 이탈**: 경로에서 35m 이상 벗어나면 진동(`navigator.vibrate`) + TTS 재안내. 다시 경로로 복귀하면 해제(중복 안내 방지).
- **도착**: 도착지 20m 이내 진입 시 도착 안내(진동 + TTS) 후 추적을 종료한다.
- ⚠️ 위 거리/이탈 계산은 **표시·안내용 단순 산수**다. 경사/강수/비용 등 경로 **판단**은
  하지 않으며(채점 엔진의 몫), 정확도는 백엔드가 주는 좌표 품질에 종속된다.
- 코드: `frontend/src/lib/geo.js`(`watchPosition`, `analyzeProgress`), `frontend/src/screens/RouteMap.jsx`.

### TTS (음성 안내)
- 두 번째 화면이 시작되면서 **"목적지까지의 경로안내를 시작합니다"** 를 TTS로 출력한다.
- 경로 이탈 시 **"경로를 벗어났습니다. 원래 길로 돌아가세요"**, 도착 시 **"목적지에 도착했습니다"** 를 추가 출력한다.
- 구현: 브라우저 Web Speech API(`speechSynthesis`), 언어 `ko-KR`. 코드: `frontend/src/lib/tts.js`.

## 3. 기술 스택 / 역할 (확정)
- **경로 탐색 + 구간 속성 원천**: `osmnx` + `networkx` — 그래프에서 직접 라우팅한다.
- **고도/경사**: opentopodata SRTM 30m (노드 고도 → 구간 경사).
- **강수**: 기상청 초단기실황 API, 카테고리 `RN1`(현재 1시간 강수량, mm).
- **시설 목록**: 공공데이터포털(행정복지센터·노인복지시설 등) 또는 카테고리 POI.
- **표시(프론트)**: Leaflet — **그리기 전용**. 경사/강수/비용 판단을 절대 프론트에서 하지 않는다.

> 네이버 지도 API는 사용하지 않는다. 모든 라우팅은 osmnx 그래프에서 수행한다.

## 4. 핵심 상수 (임계값)
| 항목 | 값 |
|---|---|
| 경사 주의 기준 | 5% |
| 경사 위험 기준 | 10% |
| 강수 기준 | 10 mm/h |
| 어르신 보행 속도(예상시간 계산) | 1.0 m/s |
| 시설 검색 반경 | 1000 m |

가중치(배수):
- 평상(dry): 5~10% = ×1.5, >10% = ×4.0, 계단 = ×8.0 (통행 가능)
- 우천(wet): 5~10% = ×4.0, >10% = 통행불가, 계단 = 통행불가

## 5. 기능 규칙 (지도 룰 / 구현 사양)
1. 사용자 GPS 기준 반경 1km 내 공공·복지 시설 목록을 출력한다.
   대상 카테고리는 **주민센터/동사무소(행정복지센터), 구청, 복지관, 문화센터** 등
   어르신 방문 가능성이 높은 시설로 한정한다(아래 카테고리 enum 참고).
2. 사용자가 목적지를 선택하면 **osmnx 그래프에서 기본 최단 경로**를 탐색한다.
3. 탐색된 경로를 **구간(segment)** 으로 나누고, 각 구간의 경사도·계단 여부·현재 시간당
   강수량을 분석한다.
4. **평상시(강수 < 10mm/h)**: 경사 <5% 정상 통과 / 5~10% 약한 가중치 /
   >10% 와 계단 강한 가중치(통행은 가능).
5. **우천 시(강수 ≥ 10mm/h)**: 경사 <5% 만 정상 통과 / 5~10% 강한 가중치 /
   >10% 와 계단은 **통행 불가 → 경로 탐색 대상에서 제외**.
6. 각 경로의 총 이동거리·예상 시간·경사 가중치·우천 가중치를 종합해 **최종 보행 비용**을
   계산한다.
7. 보행 비용이 **가장 낮은 경로**를 어르신 친화 우회 경로로 추천한다.

## 6. 경사·강수 결정 매트릭스
| 강수 \ 경사·계단 | <5% | 5–10% | >10% | 계단 |
|---|---|---|---|---|
| 평상 (<10mm) | 정상 ×1.0 | 약 ×1.5 | 강 ×4.0 | 강 ×8.0 |
| 우천 (≥10mm) | 정상 ×1.0 | 강 ×4.0 | **통행불가(제외)** | **통행불가(제외)** |

## 7. 비용 공식
```
mode      = "wet" if rainfall_mm_per_h >= 10 else "dry"
구간 비용 = length_m × (해당 구간의 가중치 배수)     # <5% 는 ×1.0
경로 비용 = Σ(구간 비용)                              # 통행불가 구간 포함 시 경로 자체를 제외
예상 시간 = 총거리(m) / 1.0(m/s) / 60                 # 분
추천      = blocked=False 인 경로 중 경로 비용 최소
```

## 8. 데이터 계약 (스키마)
채점 엔진 입력 — 경로별 `segments` 배열이 핵심. 좌표는 항상 `[위도, 경도]`(Leaflet 기준).
```json
{
  "context": {
    "user_location": { "lat": 37.5913, "lng": 127.0209 },
    "rainfall_mm_per_h": 3.2,
    "rules": {
      "slope_warn_pct": 5, "slope_danger_pct": 10,
      "rain_threshold_mm": 10, "walk_speed_mps": 1.0,
      "weights": {
        "dry": { "slope_5_10": 1.5, "slope_over_10": 4.0, "steps": 8.0, "block_danger": false, "block_steps": false },
        "wet": { "slope_5_10": 4.0, "slope_over_10": null, "steps": null, "block_danger": true,  "block_steps": true }
      }
    }
  },
  "facilities": [
    { "id": "fac_001", "name": "정릉2동 주민센터", "category": "community_center",
      "lat": 37.6100, "lng": 127.0120, "distance_m": 540 }
  ],
  "routes": [
    { "route_id": "r_acc", "label": "어르신 친화", "dest_facility_id": "fac_001",
      "segments": [
        { "seg_id": 0, "coords": [[37.5913,127.0209],[37.5930,127.0185]],
          "length_m": 240, "grade_pct": 2.5, "is_steps": false }
      ] }
  ]
}
```
채점 엔진 출력 — Leaflet은 `recommended_route_id` 의 `coords` 를 폴리라인으로 그린다.
```json
{
  "mode": "dry", "rainfall_mm_per_h": 3.2, "recommended_route_id": "r_acc",
  "routes": [
    { "route_id": "r_acc", "label": "어르신 친화", "coords": [[37.5913,127.0209]],
      "total_distance_m": 612, "eta_min": 10, "max_grade_pct": 8.4,
      "stairs_count": 0, "cost": 740.5, "blocked": false,
      "flags": [ { "type": "slope_5_10", "at": [37.61,127.012] } ] }
  ]
}
```

## 9. 필드 출처 (전부 osmnx 파이프라인에서 생성)
| 필드 | 출처 |
|---|---|
| `coords`, `length_m` | osmnx 엣지 지오메트리 / `edge["length"]` |
| `grade_pct` | 노드 고도차 ÷ 거리 (opentopodata SRTM) |
| `is_steps` | OSM `highway=steps` |
| `rainfall_mm_per_h` | 기상청 초단기실황 `RN1` |
| `facilities` | 공공데이터포털 시설 목록을 GPS 1km 로 필터 |
| `routes`(후보) | 같은 그래프에서 가중치별 `nx.shortest_path` 다회 실행 |

## 10. 시설 카테고리 enum
```
community_center  : 주민센터 / 동사무소 / 행정복지센터
district_office   : 구청
welfare_center    : 사회복지관 / 노인복지관
culture_center    : 문화센터
senior_center     : 경로당
```
- `distance_m <= 1000` 인 항목만 목록에 포함한다.

## 11. 규칙 / 컨벤션 (에이전트가 지킬 것)
- 좌표는 **항상 `[위도, 경도]`** 순서(Leaflet). 다른 순서가 들어오면 변환 후 사용.
- 후보 경로는 **최소 2개** 생성한다(거리최단 / 무장애 `w_acc` / 계단제외).
  경로 1개만으로 추천을 결정하지 않는다(규칙 6·7은 비교가 전제).
- **통행불가 구간을 포함한 경로는 추천 후보에서 제외**한다.
- 경사·강수·비용 판단은 **채점 엔진(파이썬)** 에서만 한다. Leaflet에는 좌표·추천 플래그·
  마커 위치만 전달한다.
- 네이버 등 외부 길찾기 API를 추가하지 않는다(Leaflet + osmnx 로 확정).

## 12. 프로젝트 구조 / 구현 현황
```
frontend/                     # React 19 + Vite, 큰 글씨·고대비 어르신 친화 UI
  src/
    App.jsx                   # 두 화면(select <-> map) 상태 전환 (라우터 없음)
    data/destinations.js      # 도착지 4종(성북구청/동선동·삼선동 주민센터/경로당) + 카테고리 라벨
    screens/
      DestinationSelect.jsx   # 첫 화면: 2x2 도착지 카드
      RouteMap.jsx            # 둘째 화면: Leaflet 지도 + TTS + 실시간 추적
    components/Icon.jsx        # 카드용 라인 아이콘(SVG)
    lib/
      api.js                  # 경로 추천 클라이언트. POST /api/route/score 호출,
                              #   실패 시 데이터 계약과 동일한 로컬 mock 채점기로 폴백
      geo.js                  # 거리/좌표/GPS 추적/경로 진행도 계산
      tts.js                  # 음성 안내(speechSynthesis)
backend/                      # Express(:5000). 현재는 데모용 mock 엔드포인트만 있음
```

- 프론트는 API를 **`/api`** 로만 호출한다. `frontend/vite.config.js` 에서 `/api → http://localhost:5000` 프록시.
- **백엔드 연동 계약**: 프론트는 `POST /api/route/score` 에 **8장 입력 스키마**를 보내고 **출력 스키마**를 받기를 기대한다.
- **백엔드 현황**: `/api/route/score` 는 **아직 구현돼 있지 않다**(시도했다가 되돌림). 그래서 현재는
  `frontend/src/lib/api.js` 의 **로컬 mock 채점기**(7장 비용 공식 그대로 구현)로 폴백해 동작한다.
  → 백엔드가 이 계약대로 응답하면 **프론트 수정 없이** 실제 osmnx 경로가 그려진다.
- 기존 `backend/server.js` 의 `/api/navigation/route` 는 스키마가 달라 연결돼 있지 않다.
- 실행: 프론트 `cd frontend && npm run dev`, 백엔드 `cd backend && node server.js`.

## 13. 참고 파일
- 규칙 채점기 + 예시 데이터: `elderly_route_dataset_and_scorer.py`
  (입력 payload → `score_payload()` → Leaflet 출력) — 백엔드가 `/api/route/score` 로 감쌀 대상.
