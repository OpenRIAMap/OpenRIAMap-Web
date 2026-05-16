/**
 * 支持多镜像源的数据获取工具
 * 自动尝试多个镜像源，任意一个成功即返回
 */

import {
  buildRawCompatibleUrlFromParts,
  getCurrentSourceLinkMode,
  parseRawCompatibleUrl,
  RAW_GITHUB_BASE_URL,
  type RawCompatibleUrlParts,
} from '@/components/Rules/data/sourceLinkModes';

// GitHub 原始地址和镜像地址配置。第一优先级会动态插入当前“源数据仓库链接模式”。
const RAW_KKGITHUB_BASE_URL = 'https://raw.kkgithub.com';
const JSDELIVR_GH_BASE_URL = 'https://fastly.jsdelivr.net/gh';

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function buildJsDelivrUrl(parts: RawCompatibleUrlParts): string {
  return `${JSDELIVR_GH_BASE_URL}/${parts.owner}/${parts.repo}@${parts.branch}/${parts.path}`;
}

function buildMirrorCandidates(parts: RawCompatibleUrlParts): Array<{ label: string; url: string }> {
  const currentMode = getCurrentSourceLinkMode();
  const bases = unique([
    currentMode.rawCompatibleBaseUrl,
    RAW_GITHUB_BASE_URL,
    RAW_KKGITHUB_BASE_URL,
  ]);

  const rawCompatibleUrls = bases.map((base) => ({
    label: base,
    url: buildRawCompatibleUrlFromParts(base, parts),
  }));

  return [
    ...rawCompatibleUrls,
    { label: JSDELIVR_GH_BASE_URL, url: buildJsDelivrUrl(parts) },
  ];
}

// 加载进度回调类型
export interface LoadingProgress {
  stage: string;
  status: 'loading' | 'success' | 'error';
  message?: string;
}

export type ProgressCallback = (progress: LoadingProgress) => void;

/**
 * 从多个镜像源获取数据，任意一个成功即返回。
 * url 需要是 GitHub Raw 兼容路径：{base}/{owner}/{repo}/{branch}/{path}
 */
export async function fetchWithMirror<T>(
  url: string,
  stageName: string,
  onProgress?: ProgressCallback
): Promise<T> {
  onProgress?.({ stage: stageName, status: 'loading' });

  const parts = parseRawCompatibleUrl(url);
  const candidates = parts ? buildMirrorCandidates(parts) : [{ label: url, url }];
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      onProgress?.({ stage: stageName, status: 'success' });
      return data as T;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Mirror ${candidate.label} failed for ${stageName}:`, error);
    }
  }

  onProgress?.({
    stage: stageName,
    status: 'error',
    message: lastError?.message || '所有镜像源均不可用'
  });
  throw new Error(`Failed to fetch ${stageName} from all mirrors: ${lastError?.message}`);
}

/**
 * 简单的 fetch 包装（用于本地资源）
 */
export async function fetchLocal<T>(
  url: string,
  stageName: string,
  onProgress?: ProgressCallback
): Promise<T> {
  onProgress?.({ stage: stageName, status: 'loading' });

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    onProgress?.({ stage: stageName, status: 'success' });
    return data as T;
  } catch (error) {
    onProgress?.({
      stage: stageName,
      status: 'error',
      message: (error as Error).message
    });
    throw error;
  }
}
