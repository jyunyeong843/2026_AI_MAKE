// 음성 안내(TTS) 유틸 — Web Speech API(speechSynthesis) 사용.
// 어르신 대상이라 또렷하고 약간 느린 한국어 발화를 기본값으로 둔다.
export function speak(text, { rate = 0.95, pitch = 1 } = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  try {
    window.speechSynthesis.cancel() // 진행 중 발화 중단 후 새로 말하기
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    u.rate = rate
    u.pitch = pitch
    u.volume = 1
    window.speechSynthesis.speak(u)
    return true
  } catch {
    return false
  }
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}
