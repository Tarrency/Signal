import fs from 'node:fs';
import path from 'node:path';
import type { Game, LeaderboardEntry } from './types.js';

const leaderboardFile = path.resolve(process.cwd(), 'data/leaderboard.json');
const games = new Map<string, Game>();
let leaderboardCache: LeaderboardEntry[] = [];

function ensureLeaderboardFile() {
  const dir = path.dirname(leaderboardFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(leaderboardFile)) {
    fs.writeFileSync(leaderboardFile, '[]\n', 'utf8');
  }
}

export function loadLeaderboardFromDisk() {
  ensureLeaderboardFile();
  const raw = fs.readFileSync(leaderboardFile, 'utf8');
  leaderboardCache = JSON.parse(raw) as LeaderboardEntry[];
}

export function saveGame(game: Game) {
  games.set(game.id, game);
}

export function getGame(gameId: string) {
  return games.get(gameId) ?? null;
}

export function listLeaderboard() {
  return [...leaderboardCache];
}

function compareLeaderboard(a: LeaderboardEntry, b: LeaderboardEntry) {
  if (b.arrivedCount !== a.arrivedCount) {
    return b.arrivedCount - a.arrivedCount;
  }
  if (a.incidentCount !== b.incidentCount) {
    return a.incidentCount - b.incidentCount;
  }
  const aTime = a.completionTimeSeconds ?? Number.POSITIVE_INFINITY;
  const bTime = b.completionTimeSeconds ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  return new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime();
}

export function appendLeaderboard(entry: LeaderboardEntry) {
  leaderboardCache.push(entry);
  leaderboardCache.sort(compareLeaderboard);
  ensureLeaderboardFile();
  fs.writeFileSync(leaderboardFile, JSON.stringify(leaderboardCache, null, 2) + '\n', 'utf8');
}
