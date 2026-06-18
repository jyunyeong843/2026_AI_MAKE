import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  getCurrentPosition,
  watchPosition,
  analyzeProgress,
} from '../lib/geo'
import { getRecommendedRoute } from '../lib/api'
import { speak } from '../lib/tts'
import { DEFAULT_ORIGIN } from '../data/destinations'

const OFF_ROUTE_M = 35 // 이 거리 이상 벗어나면 재안내
const ARRIVE_M = 20 // 도착지 이내로 들어오면 도착 처리

// 두 번째 화면 — 지도.
// 1) 시작과 동시에 "목적지까지의 경로안내를 시작합니다" TTS 출력
// 2) GPS 현재 위치 + 선택 도착지까지의 추천 우회 경로를 Leaflet 으로 그린다.
// 3) GPS 실시간 추적(모바일) 또는 "시연 안내"(데스크톱)로 현재 위치 점이 경로를 따라
//    이동하며, 남은 거리/시간 갱신·갈림길 TTS·도착 안내를 한다.
//    (경사/강수/비용 판단은 백엔드 채점 결과를 그대로 표시할 뿐 — CLAUDE.md 규칙)
export default function RouteMap({ destination, onBack }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const locMarkerRef = useRef(null) // 현재 위치 점
  const routeCoordsRef = useRef(null) // 추천 경로 좌표 [[lat,lng],...]
  const offRouteRef = useRef(false) // 직전 '경로 이탈' 상태 (중복 안내 방지)
  const arrivedRef = useRef(false)
  const watchStopRef = useRef(null) // 실시간 GPS 추적 해제 함수
  const simStopRef = useRef(null) // 시연 주행 중단 함수
  const progressFnRef = useRef(null) // updateProgress 참조 (버튼 핸들러에서 호출)
  const arrowTimerRef = useRef(null) // 방향 화살표 자동 숨김 타이머

  const [status, setStatus] = useState('loading') // loading | ready
  const [result, setResult] = useState(null) // 채점 엔진 출력
  const [live, setLive] = useState(null) // { remainingM, etaMin, offRoute, arrived }
  const [navigating, setNavigating] = useState(false) // 시연 주행 중 여부
  const [turnArrow, setTurnArrow] = useState(null) // 'left' | 'right' | 'straight' | null

  // TTS 안내 — 화면 진입 시 1회.
  useEffect(() => {
    speak('목적지까지의 경로안내를 시작합니다')
  }, [])

  // GPS → 경로 요청 → 지도 렌더 → 실시간 추적
  useEffect(() => {
    let cancelled = false

    async function run() {
      // GPS 실패 시 기본 출발지로 폴백
      let origin
      try {
        origin = await getCurrentPosition()
      } catch {
        origin = DEFAULT_ORIGIN
      }
      if (cancelled) return

      const scored = await getRecommendedRoute(origin, destination)
      if (cancelled) return
      setResult(scored)

      // 채점기가 알려준 경로 시작점(user_location)이 있으면 현재 위치 점을 거기에 맞춘다.
      // (데스크톱 등 GPS 부정확 시 경로와 점이 따로 노는 것을 방지)
      const drawOrigin = scored?.origin ?? origin

      const rec =
        scored?.routes?.find((r) => r.route_id === scored.recommended_route_id) ??
        scored?.routes?.[0]
      const line =
        rec?.coords ?? [
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ]
      routeCoordsRef.current = line

      // ── 지도 렌더 ──
      if (mapEl.current && !mapRef.current) {
        const map = L.map(mapEl.current, {
          zoomControl: true,
          attributionControl: false,
        })
        mapRef.current = map

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map)

        const route = L.polyline(line, {
          color: '#5d7a4f',
          weight: 7,
          opacity: 0.95,
          lineJoin: 'round',
        }).addTo(map)

        // 현재 위치 — 녹색 점 (이동시킬 마커)
        locMarkerRef.current = L.circleMarker([drawOrigin.lat, drawOrigin.lng], {
          radius: 11,
          color: '#fff',
          weight: 3,
          fillColor: '#4f6b41',
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip('현재 위치', { direction: 'top' })

        // 도착지 — 물방울 핀
        L.marker([destination.lat, destination.lng], { icon: dropPin() })
          .addTo(map)
          .bindTooltip(destination.name.replace(/\n/g, ' '), { direction: 'top' })

        map.fitBounds(route.getBounds().pad(0.25))

        // 비동기 로딩 직후엔 컨테이너 크기 인식이 안 돼 타일이 흰 화면으로 뜨기 쉽다.
        // 레이아웃이 잡힌 뒤 크기를 다시 알려주고(fitBounds 재적용) 흰 화면을 막는다.
        const refit = () => {
          if (!mapRef.current) return
          mapRef.current.invalidateSize()
          mapRef.current.fitBounds(route.getBounds().pad(0.25))
        }
        requestAnimationFrame(refit)
        setTimeout(refit, 300)
      }

      setStatus('ready')

      // 초기 진행 상태 한 번 계산
      updateProgress(drawOrigin)

      // ── 실시간 GPS 추적 시작 (모바일에서 실제 이동 시) ──
      watchStopRef.current = watchPosition((pos) => {
        if (cancelled || navigating) return // 시연 주행 중이면 GPS 무시
        if (locMarkerRef.current) locMarkerRef.current.setLatLng([pos.lat, pos.lng])
        if (mapRef.current) mapRef.current.panTo([pos.lat, pos.lng])
        updateProgress(pos)
      })
    }

    // 현재 위치 기준 남은거리/이탈 계산 + 안내
    function updateProgress(pos) {
      const coords = routeCoordsRef.current
      if (!coords) return
      const { offRouteM, remainingM } = analyzeProgress(coords, pos)
      const etaMin = Math.max(1, Math.round(remainingM / 60)) // 1.0 m/s 기준
      const offRoute = offRouteM > OFF_ROUTE_M

      // 도착 처리
      if (!arrivedRef.current && remainingM <= ARRIVE_M) {
        arrivedRef.current = true
        speak('목적지에 도착했습니다')
        if (navigator.vibrate) navigator.vibrate(200)
        setLive({ remainingM: 0, etaMin: 0, offRoute: false, arrived: true })
        setNavigating(false)
        if (watchStopRef.current) watchStopRef.current()
        if (simStopRef.current) {
          simStopRef.current()
          simStopRef.current = null
        }
        return
      }

      // 경로 이탈 → 진동 + 음성 (이탈 진입 순간 1회)
      if (offRoute && !offRouteRef.current) {
        offRouteRef.current = true
        if (navigator.vibrate) navigator.vibrate([200, 100, 200])
        speak('경로를 벗어났습니다. 원래 길로 돌아가세요')
      } else if (!offRoute && offRouteRef.current) {
        offRouteRef.current = false
      }

      setLive({ remainingM, etaMin, offRoute, arrived: false })
    }

    progressFnRef.current = updateProgress

    run()
    return () => {
      cancelled = true
      if (watchStopRef.current) watchStopRef.current()
      if (simStopRef.current) simStopRef.current()
      if (arrowTimerRef.current) clearTimeout(arrowTimerRef.current)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // destination 은 화면당 고정. 의존성 비움 의도.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "시연 안내 시작" — 경로를 따라 현재 위치 점을 자동 주행시킨다(실제 이동 대체).
  function handleStartGuide() {
    const coords = routeCoordsRef.current
    if (!coords || simStopRef.current) return

    // 실시간 GPS 추적 중단(시연이 마커를 제어), 상태 초기화
    if (watchStopRef.current) watchStopRef.current()
    arrivedRef.current = false
    offRouteRef.current = false
    setNavigating(true)

    simStopRef.current = startWalkSimulation({
      coords,
      stepM: 12, // 약 12m 간격으로 이동
      intervalMs: 450, // 한 스텝 주기
      marker: locMarkerRef.current,
      map: mapRef.current,
      onProgress: (p) => progressFnRef.current && progressFnRef.current(p),
      onTurn: showTurnArrow,
      onDone: () => {
        simStopRef.current = null
        setNavigating(false)
      },
    })
  }

  // 방향 화살표를 잠깐 띄웠다가(음성과 동시) 자동으로 숨긴다.
  function showTurnArrow(dir) {
    setTurnArrow(dir)
    if (arrowTimerRef.current) clearTimeout(arrowTimerRef.current)
    arrowTimerRef.current = setTimeout(() => setTurnArrow(null), 2600)
  }

  const rec =
    result?.routes?.find((r) => r.route_id === result.recommended_route_id) ??
    result?.routes?.[0]
  const destName = destination.name.replace(/\n/g, ' ')
  // 실시간 남은 시간이 있으면 그것을, 없으면 초기 추정치를 쓴다.
  const etaMin = live ? live.etaMin : rec?.eta_min

  return (
    <div className="screen map-screen">
      <header className="topbar map-topbar">
        <button type="button" className="back-btn" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <span>
          {destName}
          {etaMin != null ? ` - ${etaMin}분` : ''}
        </span>
      </header>

      <div className="map-wrap">
        <div ref={mapEl} className="map" />
        {status === 'loading' && (
          <div className="map-overlay">현재 위치와 경로를 불러오는 중…</div>
        )}
        {live?.offRoute && (
          <div className="off-route-banner">경로를 벗어났어요. 원래 길로 돌아가세요</div>
        )}
        {turnArrow && (
          <div className="turn-arrow-overlay">
            <TurnArrow dir={turnArrow} />
          </div>
        )}
      </div>

      <div className="route-info">
        {live?.arrived ? (
          <>
            <p className="route-label">안내 종료</p>
            <p className="route-eta">도착했어요 🎉</p>
          </>
        ) : (
          <>
            <p className="route-label">{rec?.label ?? '경로 안내'}</p>
            <p className="route-eta">{etaMin != null ? `${etaMin}분` : '계산 중'}</p>
            <p className="route-meta">
              {live
                ? `남은 거리 ${fmtDist(live.remainingM)}`
                : rec
                  ? `총 ${fmtDist(rec.total_distance_m)}`
                  : ''}
              {rec && result.mode === 'wet' ? ' · 우천 경로' : ''}
              {rec
                ? rec.stairs_count
                  ? ` · 계단 ${rec.stairs_count}곳`
                  : ' · 계단 없음'
                : ''}
            </p>
            <button
              type="button"
              className="guide-btn"
              onClick={handleStartGuide}
              disabled={status !== 'ready' || navigating}
            >
              {navigating ? '🧭 안내 중…' : '🧭 경로 안내 시작'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── 시연 주행: 경로 좌표를 따라 마커를 자동 이동시키고 갈림길마다 TTS 안내 ──
function startWalkSimulation({ coords, stepM, intervalMs, marker, map, onProgress, onTurn, onDone }) {
  const steps = buildWalkSteps(coords, stepM)
  let i = 0
  const id = setInterval(() => {
    if (i >= steps.length) {
      clearInterval(id)
      if (onDone) onDone()
      return
    }
    const s = steps[i++]
    if (marker) marker.setLatLng([s.lat, s.lng])
    if (map) map.panTo([s.lat, s.lng])
    if (s.say) {
      if (onTurn) onTurn(s.dir) // 화살표 표시(음성과 동시)
      speak(s.say)
    }
    if (onProgress) onProgress({ lat: s.lat, lng: s.lng })
  }, intervalMs)
  return () => clearInterval(id)
}

// 경로 좌표를 일정 간격으로 잘게 쪼개고, 각 구간 시작점에 좌/우회전 안내를 단다.
function buildWalkSteps(coords, stepM) {
  const steps = []
  for (let seg = 0; seg < coords.length - 1; seg++) {
    const a = coords[seg]
    const b = coords[seg + 1]
    const segLen = metersBetween(a, b)
    const k = Math.max(1, Math.round(segLen / stepM))

    // 이 구간을 시작할 때(= 정점 seg 통과) 안내 문구 + 화살표 방향
    let say = null
    let dir = null
    if (seg === 0) {
      say = '직진하세요'
      dir = 'straight'
    } else {
      const d = turnDir(coords[seg - 1], coords[seg], coords[seg + 1])
      if (d === 'left') {
        say = '왼쪽으로 가세요'
        dir = 'left'
      } else if (d === 'right') {
        say = '오른쪽으로 가세요'
        dir = 'right'
      }
      // 직진은 안내 생략(반복 안내 방지)
    }

    for (let j = 0; j < k; j++) {
      const t = j / k
      steps.push({
        lat: a[0] + (b[0] - a[0]) * t,
        lng: a[1] + (b[1] - a[1]) * t,
        say: j === 0 ? say : null,
        dir: j === 0 ? dir : null,
      })
    }
  }
  const last = coords[coords.length - 1]
  steps.push({ lat: last[0], lng: last[1], say: null, dir: null }) // 도착 안내는 updateProgress가 처리
  return steps
}

// 두 좌표([lat,lng]) 사이 거리(m) 근사
function metersBetween(a, b) {
  const dLat = (b[0] - a[0]) * 111320
  const dLng = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

// 정점 p1 에서의 진행 방향 변화 → 'left' | 'right' | 'straight'
function turnDir(p0, p1, p2) {
  const diff = ((bearing(p1, p2) - bearing(p0, p1) + 540) % 360) - 180
  if (diff > 20) return 'right'
  if (diff < -20) return 'left'
  return 'straight'
}

// a→b 방위각(도, 북=0 시계방향). 좌표는 [lat,lng].
function bearing(a, b) {
  const toR = (d) => (d * Math.PI) / 180
  const y = Math.sin(toR(b[1] - a[1])) * Math.cos(toR(b[0]))
  const x =
    Math.cos(toR(a[0])) * Math.sin(toR(b[0])) -
    Math.sin(toR(a[0])) * Math.cos(toR(b[0])) * Math.cos(toR(b[1] - a[1]))
  return (Math.atan2(y, x) * 180) / Math.PI
}

// 방향 화살표 — 직진 방향에서 꺾이는 ㄱ(엘보) 형태. 배경 없이 화살표만 렌더.
function TurnArrow({ dir }) {
  // shaft: 굵은 선(아래→위→꺾임), head: 끝의 삼각형
  const shafts = {
    straight: 'M50 90 L50 34',
    right: 'M34 90 L34 46 L66 46',
    left: 'M66 90 L66 46 L34 46',
  }
  const heads = {
    straight: '50,16 38,40 62,40', // 위쪽 향함
    right: '90,46 66,32 66,60', // 오른쪽 향함
    left: '10,46 34,32 34,60', // 왼쪽 향함
  }
  return (
    <svg viewBox="0 0 100 100" className="turn-arrow" role="img" aria-hidden="true">
      <path
        d={shafts[dir]}
        fill="none"
        stroke="#fff"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={heads[dir]} fill="none" stroke="#fff" strokeWidth="20" strokeLinejoin="round" />
      <path
        d={shafts[dir]}
        fill="none"
        stroke="#3f5a32"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={heads[dir]} fill="#3f5a32" />
    </svg>
  )
}

// 거리 표기: 1km 이상이면 km, 아니면 m
function fmtDist(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`
  return `${Math.round(m)}m`
}

// 도착지용 물방울 핀(divIcon) — 외부 이미지 의존 없이 렌더.
function dropPin() {
  return L.divIcon({
    className: '',
    html:
      '<div style="width:26px;height:26px;background:#6f8a5f;border:3px solid #fff;' +
      'border-radius:50% 50% 50% 0;transform:rotate(45deg);box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })
}
