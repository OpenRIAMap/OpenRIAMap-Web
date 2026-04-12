/**
 * 加载状态管理
 * 使用 Zustand 管理全局加载进度
 */

import { create } from 'zustand';

export interface LoadingStage {
  name: string;
  label: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  message?: string;
}

type LoadingStartOptions = {
  flowId?: string | null;
  ruleWorldId?: string | null;
};

type LoadingStageDefinition = Pick<LoadingStage, 'name' | 'label'>;

interface LoadingState {
  // 是否正在加载
  isLoading: boolean;
  // 加载阶段列表
  stages: LoadingStage[];
  // 是否首次加载完成
  initialized: boolean;
  // 当前加载流程标识（用于区分 Rules 世界加载与其它加载）
  activeFlowId: string | null;
  // 当前正在等待首帧渲染的 worldId（仅 Rules 世界加载使用）
  activeRuleWorldId: string | null;

  // Actions
  startLoading: (stages: LoadingStageDefinition[], options?: LoadingStartOptions) => void;
  updateStage: (name: string, status: LoadingStage['status'], message?: string) => void;
  finishLoading: () => void;
  finishLoadingByFlow: (flowId?: string | null) => void;
  resetLoading: () => void;
  hasStage: (name: string) => boolean;
  isRuleWorldFlow: (worldId: string) => boolean;
}

export const useLoadingStore = create<LoadingState>()((set, get): LoadingState => ({
  isLoading: false,
  stages: [],
  initialized: false,
  activeFlowId: null,
  activeRuleWorldId: null,

  startLoading: (stages, options) => {
    set({
      isLoading: true,
      stages: stages.map((stage): LoadingStage => ({
        name: stage.name,
        label: stage.label,
        status: 'pending',
      })),
      activeFlowId: options?.flowId ?? null,
      activeRuleWorldId: options?.ruleWorldId ?? null,
    });
  },

  updateStage: (name, status, message) => {
    set((state) => ({
      stages: state.stages.map((stage) =>
        stage.name === name ? { ...stage, status, message } : stage
      ),
    }));
  },

  finishLoading: () => {
    set({
      isLoading: false,
      initialized: true,
      activeFlowId: null,
      activeRuleWorldId: null,
    });
  },

  finishLoadingByFlow: (flowId) => {
    const target = flowId ?? null;
    const state = get();
    if (!state.isLoading) return;
    if (target !== null && state.activeFlowId !== target) return;
    set({
      isLoading: false,
      initialized: true,
      activeFlowId: null,
      activeRuleWorldId: null,
    });
  },

  resetLoading: () => {
    set({
      isLoading: false,
      stages: [],
      activeFlowId: null,
      activeRuleWorldId: null,
    });
  },

  hasStage: (name) => {
    return get().stages.some((stage) => stage.name === name);
  },

  isRuleWorldFlow: (worldId) => {
    const state = get();
    return state.isLoading && state.activeRuleWorldId === String(worldId ?? '').trim();
  },
}));
