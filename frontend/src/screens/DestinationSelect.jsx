import { DESTINATIONS } from '../data/destinations'

// 첫 번째 화면 — 도착지 선택.
// 도착지를 카테고리별 3개 섹션(구청 / 경로당 / 주민센터)으로 나눠 보여준다.
// 각 섹션은 제목 + 구분선 + 2열 카드 그리드. 화면 전체는 세로 스크롤된다.
const SECTIONS = [
  { key: 'district_office', label: '구청' },
  { key: 'senior_center', label: '경로당 (노인정)' },
  { key: 'community_center', label: '주민센터' },
]

export default function DestinationSelect({ onSelect }) {
  return (
    <div className="screen">
      <header className="topbar">어디로 가시나요?</header>

      <h1 className="page-title">목적지 선택</h1>
      <div className="title-rule" />

      <div className="dest-scroll">
        {SECTIONS.map((section) => {
          const items = DESTINATIONS.filter((d) => d.category === section.key)
          if (items.length === 0) return null

          return (
            <section key={section.key} className="dest-section">
              <h2 className="section-title">{section.label}</h2>
              <div className="section-rule" />

              <div className="dest-grid">
                {items.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="dest-card"
                    onClick={() => onSelect(d)}
                    aria-label={`${d.name.replace(/\n/g, ' ')} 경로 안내`}
                  >
                    <span className="dest-name">
                      {d.name.split('\n').map((line, i) => (
                        <span key={i}>{line}</span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
