// 도착지 카드용 아이콘 (첫 화면 스크린샷의 녹색 라인 아이콘과 동일 계열).
// stroke 색은 CSS 의 currentColor 를 따른다.
const PATHS = {
  // 구청 — 높이 다른 두 건물
  office: (
    <>
      <path d="M14 40V14l10-4 10 4v26" />
      <path d="M34 40V22l8 3v15" />
      <path d="M19 18h2M19 24h2M19 30h2M27 18h2M27 24h2M27 30h2" />
      <path d="M8 40h36" />
    </>
  ),
  // 주민센터 — 창문 격자 건물
  building: (
    <>
      <rect x="14" y="10" width="20" height="30" rx="1" />
      <path d="M20 16h2M26 16h2M20 22h2M26 22h2M20 28h2M26 28h2" />
      <path d="M22 34h4v6h-4z" />
      <path d="M8 40h32" />
    </>
  ),
  // 경로당 — 두 사람
  people: (
    <>
      <circle cx="18" cy="17" r="5" />
      <circle cx="31" cy="19" r="4" />
      <path d="M9 40c0-6 4-11 9-11s9 5 9 11" />
      <path d="M27 40c0-5 3-9 7-9s7 4 7 9" />
    </>
  ),
}

export default function Icon({ name, size = 56 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="presentation"
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.building}
    </svg>
  )
}
