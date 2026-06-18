import { useState } from 'react'
import DestinationSelect from './screens/DestinationSelect'
import RouteMap from './screens/RouteMap'
import ArrivalScreen from './screens/ArrivalScreen'
import './App.css'

// 한걸음 — 세 화면 사이를 단순 상태로 전환한다.
//   select  : 도착지 선택        (첫 화면)
//   map     : 경로 지도 + 안내    (두 번째 화면)
//   arrival : 도착 완료          (세 번째 화면)
function App() {
  const [screen, setScreen] = useState('select')
  const [destination, setDestination] = useState(null)
  const [arrival, setArrival] = useState(null) // { name, etaMin, stairs }

  function handleSelect(dest) {
    setDestination(dest)
    setScreen('map')
  }

  function handleBack() {
    setScreen('select')
    setDestination(null)
  }

  function handleArrive(info) {
    setArrival(info)
    setScreen('arrival')
  }

  function handleRestart() {
    setScreen('select')
    setDestination(null)
    setArrival(null)
  }

  if (screen === 'arrival' && arrival) {
    return (
      <ArrivalScreen
        destinationName={arrival.name}
        etaMin={arrival.etaMin}
        stairsCount={arrival.stairs}
        onRestart={handleRestart}
      />
    )
  }
  if (screen === 'map' && destination) {
    return <RouteMap destination={destination} onBack={handleBack} onArrive={handleArrive} />
  }
  return <DestinationSelect onSelect={handleSelect} />
}

export default App
