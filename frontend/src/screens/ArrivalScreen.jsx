// 세 번째 화면 — 도착 완료.
// 지도 안내 중 목적지 20m 이내로 들어오면 RouteMap 이 onArrive 로 이 화면을 띄운다.
export default function ArrivalScreen({ destinationName, etaMin, stairsCount, onHome, onRestart }) {
  const noStairs = (stairsCount ?? 0) === 0

  return (
    <div className="screen arrival">
      <div className="arrival-badge" aria-hidden="true">
        <span className="arrival-ray" />
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>

      <h1 className="arrival-title">도착했어요!</h1>
      <p className="arrival-place">{destinationName}</p>

      <div className="arrival-summary">
        <span>
          {etaMin != null ? `${etaMin}분 만에 ` : ''}
          {noStairs && <em>계단 없이</em>}
        </span>
        <br />
        <span>안전하게 도착했어요</span>
      </div>

      <div className="arrival-spacer" />

      <div className="arrival-actions">
        <button type="button" className="arrival-btn primary" onClick={onHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 21V8l8-5 8 5v13" />
            <path d="M9 21v-7h6v7" />
          </svg>
          집으로 가는 길
        </button>
        <button type="button" className="arrival-btn ghost" onClick={onRestart}>
          처음으로
        </button>
      </div>
    </div>
  )
}
