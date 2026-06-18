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
// 3) GPS 를 실시간 추적해 현재 위치 점을 이동시키고, 남은 거리/시간을 갱신하며,
//    경로를 벗어나면 진동 + 음성으로 재안내한다.
//    (경사/강수/비용 판단은 백엔드 채점 결과를 그대로 표시할 뿐 — CLAUDE.md 규칙)
export default function RouteMap({ destination, onBack }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const locMarkerRef = useRef(null) // 현재 위치 점
  const routeCoordsRef = useRef(null) // 추천 경로 좌표 [[lat,lng],...]
  const offRouteRef = useRef(false) // 직전 '경로 이탈' 상태 (중복 안내 방지)
  const arrivedRef = useRef(false)

  const [status, setStatus] = useState('loading') // loading | ready
  const [result, setResult] = useState(null) // 채점 엔진 출력
  const [live, setLive] = useState(null) // { remainingM, etaMin, offRoute, arrived }

  // TTS 안내 — 화면 진입 시 1회.
  useEffect(() => {
    speak('목적지까지의 경로안내를 시작합니다')
  }, [])

  // GPS → 경로 요청 → 지도 렌더 → 실시간 추적
  useEffect(() => {
    let cancelled = false
    let clearWatch = null

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

        // 현재 위치 — 녹색 점 (실시간으로 이동시킬 마커)
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
      }

      setStatus('ready')

      // 초기 진행 상태 한 번 계산
      updateProgress(drawOrigin)

      // ── 실시간 GPS 추적 시작 ──
      clearWatch = watchPosition((pos) => {
        if (cancelled) return
        // 위치 점 이동 + 지도 따라가기
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
        if (clearWatch) clearWatch()
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

    run()
    return () => {
      cancelled = true
      if (clearWatch) clearWatch()
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // destination 은 화면당 고정. 의존성 비움 의도.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          </>
        )}
      </div>
    </div>
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
