/**
 * 玩家数据 API
 * 支持代理链路（/api/dynmap）与直连链路（https://satellite.ria.red/map）双通道读取
 */

import type { Player } from '@/types';

const WORLD_MAP: Record<string, string> = {
  zth: '_zth',
  eden: '_eden',
  naraku: '_naraku',
  houtu: '_houtu',
  laputa: '_laputa',
};

interface DynmapUpdateResponse {
  currentcount: number;
  hasStorm: boolean;
  isThundering: boolean;
  servertime: number;
  confighash: number;
  players: Array<{
    world: string;
    armor: number;
    name: string;
    x: number;
    y: number;
    z: number;
    health: number;
    sort: number;
    type: string;
    account: string;
  }>;
  updates: Array<{
    type: string;
    name: string;
    timestamp: number;
  }>;
}

export type PlayerFetchMode = 'direct' | 'proxy';
export interface PlayerFetchResult {
  players: Player[];
  source: PlayerFetchMode | null;
  error: string | null;
}

const DEFAULT_DIRECT_BASE_URL = 'https://satellite.ria.red/map';
const DEFAULT_PLAYER_API_MODE: PlayerFetchMode = 'proxy';

function normalizeBaseUrl(raw: string | undefined): string {
  const v = String(raw ?? '').trim();
  if (!v) return DEFAULT_DIRECT_BASE_URL;
  return v.replace(/\/+$/, '');
}

function getConfiguredMode(): PlayerFetchMode {
  const raw = String(import.meta.env.VITE_PLAYER_API_MODE ?? '').trim().toLowerCase();
  return raw === 'proxy' ? 'proxy' : DEFAULT_PLAYER_API_MODE;
}

function buildProxyUrl(apiWorld: string, timestamp: number): string {
  return `/api/dynmap/${apiWorld}/up/world/world/${timestamp}`;
}

function buildDirectUrl(apiWorld: string, timestamp: number): string {
  const base = normalizeBaseUrl(import.meta.env.VITE_DYNMAP_BASE_URL);
  return `${base}/${apiWorld}/up/world/world/${timestamp}`;
}

function mapPlayers(data: DynmapUpdateResponse): Player[] {
  return (data.players || []).map((p) => ({
    name: p.name,
    account: p.account,
    x: p.x,
    y: p.y,
    z: p.z,
    health: p.health,
    armor: p.armor,
    world: p.world,
  }));
}

async function tryFetchPlayers(url: string, source: PlayerFetchMode): Promise<PlayerFetchResult> {
  const res = await fetch(url, {
    cache: 'no-store',
    mode: source === 'proxy' ? 'same-origin' : 'cors',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`玩家接口返回 ${res.status}（${source}）`);
  }
  const data: DynmapUpdateResponse = await res.json();
  return {
    players: mapPlayers(data),
    source,
    error: null,
  };
}

export async function fetchPlayersDetailed(worldId: string): Promise<PlayerFetchResult> {
  const apiWorld = WORLD_MAP[worldId] || `_${worldId}`;
  const timestamp = Date.now();
  const preferredMode = getConfiguredMode();
  const candidates: Array<{ source: PlayerFetchMode; url: string }> =
    preferredMode === 'proxy'
      ? [
          { source: 'proxy', url: buildProxyUrl(apiWorld, timestamp) },
          { source: 'direct', url: buildDirectUrl(apiWorld, timestamp) },
        ]
      : [
          { source: 'direct', url: buildDirectUrl(apiWorld, timestamp) },
          { source: 'proxy', url: buildProxyUrl(apiWorld, timestamp) },
        ];

  let lastError: string | null = null;
  for (const candidate of candidates) {
    try {
      return await tryFetchPlayers(candidate.url, candidate.source);
    } catch (error) {
      lastError = String((error as Error)?.message ?? error ?? '玩家接口请求失败');
      console.warn(`[playerApi] ${candidate.source} failed:`, error);
    }
  }

  return {
    players: [],
    source: null,
    error: lastError ?? '玩家接口不可用',
  };
}

export async function fetchPlayers(worldId: string): Promise<Player[]> {
  const result = await fetchPlayersDetailed(worldId);
  return result.players;
}
