import Icon from '../components/Icon'
import { DESTINATIONS } from '../data/destinations'

// 첫 번째 화면 — 도착지 선택.
// 2행 2열 카드 버튼. 클릭하면 onSelect(dest) 로 지도 화면으로 넘어간다.
export default function DestinationSelect({ onSelect }) {
  return (
    <div className="screen">
      <header className="topbar">어디로 가시나요?</header>

      <h1 className="page-title">목적지 선택</h1>
      <div className="title-rule" />

      <div className="dest-grid">
        {DESTINATIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            className="dest-card"
            onClick={() => onSelect(d)}
            aria-label={`${d.name.replace(/\n/g, ' ')} 경로 안내`}
          >
            <span className="dest-icon">
              <Icon name={d.icon} />
            </span>
            <span className="dest-name">
              {d.name.split('\n').map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
