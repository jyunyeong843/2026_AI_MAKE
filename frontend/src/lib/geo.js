// 좌표 계산 유틸. 좌표는 모두 [위도, 경도] 또는 {lat, lng}.

const R = 6371000 // 지구 반지름(m)
const toRad = (d) => (d * Math.PI) / 180

// 두 지점 사이 거리(m) — Haversine
export function distanceM(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// {lat,lng} → [lat,lng] (Leaflet 폴리라인용)
export const toLatLng = (p) => [p.lat, p.lng]

// 현재 GPS 위치를 Promise 로 반환. 실패 시 reject.
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('geolocation unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000, ...options },
    )
  })
}

// GPS 위치를 실시간으로 추적. 위치가 바뀔 때마다 onMove({lat,lng}) 호출.
// 반환값은 추적 중단 함수(clear). geolocation 미지원이면 null 반환.
export function watchPosition(onMove, onError) {
  if (!('geolocation' in navigator)) return null
  const id = navigator.geolocation.watchPosition(
    (pos) => onMove({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => onError && onError(err),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}

// 점 p 에서 선분 a-b 까지의 근사 거리(m). 짧은 거리라 위/경도를 평면으로 근사.
function distanceToSegment(p, a, b) {
  const mPerLat = 111320
  const mPerLng = 111320 * Math.cos(toRad(p.lat))
  const px = p.lng * mPerLng
  const py = p.lat * mPerLat
  const ax = a.lng * mPerLng
  const ay = a.lat * mPerLat
  const bx = b.lng * mPerLng
  const by = b.lat * mPerLat
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

// 경로 폴리라인(coords: [[lat,lng],...]) 기준으로 현재 위치를 분석한다.
//   offRouteM   : 경로(가장 가까운 구간)에서 벗어난 거리(m)
//   remainingM  : 가장 가까운 구간 이후 도착지까지 남은 거리(m)
export function analyzeProgress(coords, pos) {
  if (!coords || coords.length < 2) return { offRouteM: 0, remainingM: 0 }
  const pts = coords.map(([lat, lng]) => ({ lat, lng }))

  let bestSeg = 0
  let bestDist = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distanceToSegment(pos, pts[i], pts[i + 1])
    if (d < bestDist) {
      bestDist = d
      bestSeg = i
    }
  }

  // 가장 가까운 구간의 끝점 ~ 도착지까지의 남은 거리
  let remaining = distanceM(pos, pts[bestSeg + 1])
  for (let i = bestSeg + 1; i < pts.length - 1; i++) {
    remaining += distanceM(pts[i], pts[i + 1])
  }
  return { offRouteM: bestDist, remainingM: remaining }
}
