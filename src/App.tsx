import MapContainer from './components/Map/MapContainer'
import PWAInstallPrompt from './components/PWAInstallPrompt/PWAInstallPrompt'

function App() {
  return (
    <div className="app-root h-screen w-screen">
      <MapContainer />
      <PWAInstallPrompt />
    </div>
  )
}

export default App
