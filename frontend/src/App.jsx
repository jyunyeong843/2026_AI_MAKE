import { useState } from 'react'
import DestinationSelect from './screens/DestinationSelect'
import RouteMap from './screens/RouteMap'
import './App.css'

// 복지ON길 — 두 화면 사이를 단순 상태로 전환한다.
//   select : 도착지 선택       (첫 화면)
//   map    : 경로 지도 + TTS    (두 번째 화면)
function App() {
  const [screen, setScreen] = useState('select')
  const [destination, setDestination] = useState(null)

  function handleSelect(dest) {
    setDestination(dest)
    setScreen('map')
  }

  function handleBack() {
    setScreen('select')
    setDestination(null)
  }

  if (screen === 'map' && destination) {
    return <RouteMap destination={destination} onBack={handleBack} />
  }
  return <DestinationSelect onSelect={handleSelect} />
}

export default App
