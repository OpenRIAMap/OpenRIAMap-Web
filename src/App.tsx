import MapContainer from './components/Map/MapContainer'
import PWAInstallPrompt from './components/PWAInstallPrompt/PWAInstallPrompt'
import FeatureModuleLoadDialog from './components/Common/FeatureModuleLoadDialog'
import FeatureModuleLoadingOverlay from './components/Common/FeatureModuleLoadingOverlay'
import { useEffect } from 'react'
import { useFeatureModuleStore } from './store/featureModuleStore'

function App() {
  const hydrateFeatureModules = useFeatureModuleStore((state) => state.hydrate)

  useEffect(() => {
    hydrateFeatureModules()
  }, [hydrateFeatureModules])

  return (
    <div className="app-root h-screen w-screen">
      <MapContainer />
      <PWAInstallPrompt />
      <FeatureModuleLoadDialog />
      <FeatureModuleLoadingOverlay />
    </div>
  )
}

export default App
