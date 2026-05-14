import { useDataStore } from '@/store/dataStore';
import { useLoadingStore } from '@/store/loadingStore';

const LEGACY_DATA_STAGES = [
  { name: 'bureaus', label: '铁路局配置' },
  { name: 'zth-railway', label: '零洲铁路数据' },
  { name: 'zth-rmp', label: '零洲 RMP 数据' },
  { name: 'zth-landmark', label: '零洲地标数据' },
  { name: 'houtu-railway', label: '后土洲铁路数据' },
  { name: 'houtu-rmp', label: '后土洲 RMP 数据' },
  { name: 'houtu-landmark', label: '后土洲地标数据' },
  { name: 'naraku-railway', label: '奈落洲铁路数据' },
  { name: 'naraku-landmark', label: '奈落洲地标数据' },
  { name: 'eden-railway', label: '伊甸铁路数据' },
  { name: 'eden-landmark', label: '伊甸地标数据' },
  { name: 'laputa-railway', label: '拉普塔铁路数据' },
  { name: 'laputa-landmark', label: '拉普塔地标数据' },
];

let legacyDataLoadPromise: Promise<void> | null = null;

function waitForCurrentLegacyDataLoad(): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      const state = useDataStore.getState();
      if (!state.isLoading) {
        resolve();
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

export async function ensureLegacyDataLoaded(): Promise<void> {
  const initial = useDataStore.getState();
  if (initial.isLoaded) return;
  if (legacyDataLoadPromise) return legacyDataLoadPromise;
  if (initial.isLoading) {
    legacyDataLoadPromise = waitForCurrentLegacyDataLoad().finally(() => {
      legacyDataLoadPromise = null;
    });
    return legacyDataLoadPromise;
  }

  const flowId = `legacy-data:${Date.now()}`;
  const loadingStore = useLoadingStore.getState();
  loadingStore.startLoading(LEGACY_DATA_STAGES, { flowId });

  legacyDataLoadPromise = useDataStore.getState().loadAllData((stage, status) => {
    const latest = useLoadingStore.getState();
    if (!latest.isLoading || latest.activeFlowId !== flowId || latest.activeRuleWorldId) return;
    latest.updateStage(stage, status);
  }).finally(() => {
    window.setTimeout(() => {
      const latest = useLoadingStore.getState();
      if (latest.isLoading && latest.activeFlowId === flowId && !latest.activeRuleWorldId) {
        latest.finishLoadingByFlow(flowId);
      }
    }, 500);
    legacyDataLoadPromise = null;
  });

  return legacyDataLoadPromise;
}
