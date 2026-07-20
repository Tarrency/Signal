import { API_BASE_URL } from './constants';
import type { ApiErrorResponse, GameView, LeaderboardEntry, TrainId } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });

  const data = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    throw new Error((data as ApiErrorResponse).error?.message ?? '请求失败');
  }

  return data as T;
}

export async function createGame() {
  return request<{ game: GameView }>('/games', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getGame(gameId: string) {
  return request<{ game: GameView }>(`/games/${gameId}`);
}

export async function sendReroute(gameId: string, trainId: TrainId, viaNodeId: string) {
  return request<{ ok: true; game: GameView }>(`/games/${gameId}/reroute`, {
    method: 'POST',
    body: JSON.stringify({ trainId, viaNodeId }),
  });
}

export async function sendPause(gameId: string) {
  return request<{ ok: true; game: GameView }>(`/games/${gameId}/pause`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getLeaderboard() {
  return request<{ items: LeaderboardEntry[] }>('/leaderboard');
}
