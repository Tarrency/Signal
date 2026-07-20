// ============================================================================
// 《末班信号站 · 暴雨调度》游戏引擎
// 权威模拟：不规则图网络 + 逐秒推进。列车开局自动沿默认路线前进。
// 玩家唯一操作：在列车即将抵达的分岔口点击方向箭头变道。
// 事故：两车同一秒占用同一路段（相撞）或驶入损坏路段。
// 开局即有若干损坏道路（红色危险），雷电还会在中途继续劈坏路段。
// ============================================================================
import type {
  DecisionOption,
  Game,
  GameLog,
  GameResult,
  GameView,
  LeaderboardEntry,
  MapEdge,
  MapGraph,
  Train,
  TrainDecision,
  TrainId,
  TrainPosition,
  TrainView,
} from './types.js';

const DEFAULT_PLAYER_NAME = '末班车调度员';
// 暴雨倒计时（挂钟推进，不冻结）。干净跑完约 16~18s，24s 留约 6~8s 余量：
// 暂停(3s)有感、检修(6s)一次会明显挤压到站窗口 —— 时间成为真资源。
const GAME_DURATION_SECONDS = 24;
const PAUSE_STALL_SECONDS = 3; // 全体暂停：列车停滞 3s
const REPAIR_STALL_SECONDS = 6; // 事故检修：列车停滞 6s
// 雷击都落在列车仍在路上的窗口，末击 22s 仍留变道反应时间。
const LIGHTNING_TIMES = [6, 14, 22];
const INITIAL_DAMAGE_COUNT = 3; // 开局损坏数
const REPAIR_REROLL_COUNT = 2; // 检修后重 roll 的损坏数（比开局克制）

let logSequence = 0;

export class GameRuleError extends Error {
  constructor(
    public code: 'GAME_FINISHED' | 'INVALID_TRAIN_STATE' | 'INVALID_REROUTE' | 'NO_ALTERNATE_ROUTE',
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// 左→右格状网络（归一化坐标 0~1）
// 所有路段严格向右推进；每个分岔口最多 2 个前进选择：右上 / 右下。
// 不存在向左（左上/左下）的路段，列车只会越走越靠近终点。
// 列(col)：始发端(0) → 4 层枢纽 → 终点站(6)。
// ---------------------------------------------------------------------------
const NODES = [
  // col0：三起点（始发）
  { id: 'DA', label: '甲始', kind: 'depot' as const, x: 0.05, y: 0.16 },
  { id: 'DB', label: '乙始', kind: 'depot' as const, x: 0.05, y: 0.5 },
  { id: 'DC', label: '丙始', kind: 'depot' as const, x: 0.05, y: 0.84 },
  // col1
  { id: 'A1', label: 'A1', kind: 'junction' as const, x: 0.21, y: 0.28 },
  { id: 'A2', label: 'A2', kind: 'junction' as const, x: 0.2, y: 0.62 },
  { id: 'A3', label: 'A3', kind: 'junction' as const, x: 0.22, y: 0.92 },
  // col2
  { id: 'B1', label: 'B1', kind: 'junction' as const, x: 0.37, y: 0.14 },
  { id: 'B2', label: 'B2', kind: 'junction' as const, x: 0.38, y: 0.45 },
  { id: 'B3', label: 'B3', kind: 'junction' as const, x: 0.36, y: 0.78 },
  // col3
  { id: 'C1', label: 'C1', kind: 'junction' as const, x: 0.54, y: 0.29 },
  { id: 'C2', label: 'C2', kind: 'junction' as const, x: 0.53, y: 0.61 },
  { id: 'C3', label: 'C3', kind: 'junction' as const, x: 0.55, y: 0.9 },
  // col4
  { id: 'D1', label: 'D1', kind: 'junction' as const, x: 0.7, y: 0.16 },
  { id: 'D2', label: 'D2', kind: 'junction' as const, x: 0.71, y: 0.47 },
  { id: 'D3', label: 'D3', kind: 'junction' as const, x: 0.69, y: 0.79 },
  // col5
  { id: 'E1', label: 'E1', kind: 'junction' as const, x: 0.84, y: 0.32 },
  { id: 'E2', label: 'E2', kind: 'junction' as const, x: 0.85, y: 0.66 },
  // col6：三终点站
  { id: 'TA', label: '甲站', kind: 'terminal' as const, x: 0.96, y: 0.18 },
  { id: 'TB', label: '乙站', kind: 'terminal' as const, x: 0.96, y: 0.5 },
  { id: 'TC', label: '丙站', kind: 'terminal' as const, x: 0.96, y: 0.82 },
];

// [from, to, seconds, curve]。from 一律在 to 左侧（x 更小），保证只向右。
// curve 为归一化弯曲量：右上路段用负、右下路段用正，视觉上分开两个方向。
const EDGE_DEFS: Array<[string, string, number, number]> = [
  // col0 → col1
  ['DA', 'A1', 3, -0.03], // 右上
  ['DA', 'A2', 4, 0.04], // 右下
  ['DB', 'A1', 4, -0.04],
  ['DB', 'A2', 3, 0.03],
  ['DC', 'A2', 4, -0.04],
  ['DC', 'A3', 3, 0.03],
  // col1 → col2
  ['A1', 'B1', 3, -0.03],
  ['A1', 'B2', 3, 0.04],
  ['A2', 'B2', 3, -0.04],
  ['A2', 'B3', 3, 0.03],
  ['A3', 'B3', 3, -0.03],
  ['A3', 'B2', 4, -0.05],
  // col2 → col3
  ['B1', 'C1', 3, 0.03],
  ['B1', 'C2', 4, 0.05],
  ['B2', 'C1', 3, -0.04],
  ['B2', 'C2', 3, 0.04],
  ['B3', 'C2', 3, -0.04],
  ['B3', 'C3', 3, 0.03],
  // col3 → col4
  ['C1', 'D1', 3, -0.03],
  ['C1', 'D2', 3, 0.04],
  ['C2', 'D2', 3, -0.04],
  ['C2', 'D3', 3, 0.04],
  ['C3', 'D3', 3, -0.03],
  ['C3', 'D2', 4, -0.05],
  // col4 → col5
  ['D1', 'E1', 3, 0.03],
  ['D2', 'E1', 3, -0.04],
  ['D2', 'E2', 3, 0.04],
  ['D3', 'E2', 3, -0.04],
  // col5 → col6（终点）
  ['E1', 'TA', 3, -0.03],
  ['E1', 'TB', 3, 0.04],
  ['E2', 'TB', 3, -0.04],
  ['E2', 'TC', 3, 0.03],
  // 少量直达，丰富选择
  ['D1', 'TA', 4, -0.04],
  ['D3', 'TC', 4, 0.04],
];

function buildGraph(): MapGraph {
  const edges: MapEdge[] = EDGE_DEFS.map(([from, to, seconds, curve]) => ({
    id: `${from}-${to}`,
    from,
    to,
    seconds,
    curve,
  }));
  return { nodes: NODES.map((n) => ({ ...n })), edges };
}

const GRAPH = buildGraph();

const TRAIN_TARGET: Record<TrainId, { start: string; target: string }> = {
  T1: { start: 'DA', target: 'TA' },
  T2: { start: 'DB', target: 'TB' },
  T3: { start: 'DC', target: 'TC' },
};

// ---------------------------------------------------------------------------
// 图工具：无向邻接、路段查找、Dijkstra
// ---------------------------------------------------------------------------
function edgeKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const EDGE_BY_KEY = new Map<string, MapEdge>();
for (const edge of GRAPH.edges) {
  EDGE_BY_KEY.set(edgeKey(edge.from, edge.to), edge);
}

function findEdge(a: string, b: string): MapEdge | undefined {
  return EDGE_BY_KEY.get(edgeKey(a, b));
}

function neighborsOf(nodeId: string): string[] {
  const result: string[] = [];
  for (const edge of GRAPH.edges) {
    if (edge.from === nodeId) result.push(edge.to);
    else if (edge.to === nodeId) result.push(edge.from);
  }
  return result;
}

const NODE_X = new Map(GRAPH.nodes.map((n) => [n.id, n.x]));
const TERMINAL_IDS = new Set(GRAPH.nodes.filter((n) => n.kind === 'terminal').map((n) => n.id));

function isTerminal(nodeId: string) {
  return TERMINAL_IDS.has(nodeId);
}

// 只向右（x 更大）的前进方向：分岔口最多右上 / 右下两个选择，绝不向左。
function forwardNeighborsOf(nodeId: string): string[] {
  const baseX = NODE_X.get(nodeId) ?? 0;
  return neighborsOf(nodeId)
    .filter((v) => (NODE_X.get(v) ?? 0) > baseX)
    .sort((a, b) => (NODE_X.get(a) ?? 0) - (NODE_X.get(b) ?? 0));
}

// 从 start 到 goal 的最短路（按秒），可排除若干路段（key 集合）。返回节点序列或 null。
function shortestPath(start: string, goal: string, blockedEdgeKeys: Set<string>): string[] | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();
  for (const node of GRAPH.nodes) dist.set(node.id, Number.POSITIVE_INFINITY);
  dist.set(start, 0);
  prev.set(start, null);

  while (visited.size < GRAPH.nodes.length) {
    let current: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const [nodeId, d] of dist) {
      if (!visited.has(nodeId) && d < best) {
        best = d;
        current = nodeId;
      }
    }
    if (current === null || best === Number.POSITIVE_INFINITY) break;
    if (current === goal) break;
    visited.add(current);

    for (const edge of GRAPH.edges) {
      let neighbor: string | null = null;
      if (edge.from === current) neighbor = edge.to;
      else if (edge.to === current) neighbor = edge.from;
      if (neighbor === null || visited.has(neighbor)) continue;
      if (blockedEdgeKeys.has(edgeKey(edge.from, edge.to))) continue;
      const alt = best + edge.seconds;
      if (alt < (dist.get(neighbor) ?? Number.POSITIVE_INFINITY)) {
        dist.set(neighbor, alt);
        prev.set(neighbor, current);
      }
    }
  }

  if (dist.get(goal) === Number.POSITIVE_INFINITY) return null;
  const path: string[] = [];
  let cursor: string | null = goal;
  while (cursor !== null) {
    path.unshift(cursor);
    cursor = prev.get(cursor) ?? null;
  }
  return path;
}

function damagedKeySet(damagedEdgeIds: string[]): Set<string> {
  const set = new Set<string>();
  for (const id of damagedEdgeIds) {
    const e = GRAPH.edges.find((x) => x.id === id);
    if (e) set.add(edgeKey(e.from, e.to));
  }
  return set;
}

// ---------------------------------------------------------------------------
// 种子随机（mulberry32）：保证同一 seed 的对局可复现。
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createLog(type: GameLog['type'], timestamp: string, message: string): GameLog {
  logSequence += 1;
  return { id: `${type}_${logSequence}`, timestamp, type, message };
}

function cloneGame(game: Game): Game {
  return {
    ...game,
    graph: game.graph,
    trains: game.trains.map((t) => ({ ...t, route: [...t.route] })),
    lightning: game.lightning.map((l) => ({ ...l })),
    damagedEdgeIds: [...game.damagedEdgeIds],
    traveledEdgeIds: [...game.traveledEdgeIds],
    logs: [...game.logs],
    result: game.result ? { ...game.result } : null,
    stall: game.stall ? { ...game.stall } : null,
    collidedPairs: [...game.collidedPairs],
  };
}

function getElapsedSeconds(game: Game, now: Date) {
  const diff = Math.floor((now.getTime() - new Date(game.startedAt).getTime()) / 1000);
  return Math.max(0, Math.min(game.durationSeconds, diff));
}

function nodeLabel(id: string) {
  return GRAPH.nodes.find((n) => n.id === id)?.label ?? id;
}

// 所有列车在给定损坏集合下仍都能到达终点。
function allTrainsReachable(routes: Record<TrainId, string[]>, damaged: Set<string>): boolean {
  return (Object.keys(TRAIN_TARGET) as TrainId[]).every((id) => {
    const { start, target } = TRAIN_TARGET[id];
    return shortestPath(start, target, damaged) !== null;
  });
}

// 选择开局损坏路段：落在默认路线上（制造变道动机），但不在任一列车的第一段（留反应时间），
// 且保证每列车仍存在避开损坏的可行路线。
function pickInitialDamage(routes: Record<TrainId, string[]>, seed: number): string[] {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const firstEdgeKeys = new Set<string>();
  const candidateKeys = new Set<string>();
  for (const id of Object.keys(routes) as TrainId[]) {
    const route = routes[id];
    for (let i = 0; i < route.length - 1; i += 1) {
      const key = edgeKey(route[i], route[i + 1]);
      if (i === 0) firstEdgeKeys.add(key);
      else candidateKeys.add(key);
    }
  }
  for (const k of firstEdgeKeys) candidateKeys.delete(k);

  const candidates = [...candidateKeys].sort(); // 稳定顺序
  // Fisher-Yates（种子）
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const chosen = new Set<string>();
  for (const key of candidates) {
    if (chosen.size >= INITIAL_DAMAGE_COUNT) break;
    const trial = new Set(chosen);
    trial.add(key);
    if (allTrainsReachable(routes, trial)) {
      chosen.add(key);
    }
  }
  // 映射回 edgeId
  return [...chosen]
    .map((key) => {
      const [a, b] = key.split('|');
      return findEdge(a, b)?.id;
    })
    .filter((x): x is string => Boolean(x));
}

// ---------------------------------------------------------------------------
// 新建对局
// ---------------------------------------------------------------------------
export function createNewGame(now: Date, seed?: number): Game {
  const gameSeed = seed ?? (now.getTime() % 2147483647 || 1);

  const routes = {} as Record<TrainId, string[]>;
  for (const id of Object.keys(TRAIN_TARGET) as TrainId[]) {
    const { start, target } = TRAIN_TARGET[id];
    routes[id] = shortestPath(start, target, new Set()) ?? [start, target];
  }

  const damagedEdgeIds = pickInitialDamage(routes, gameSeed);

  const trains: Train[] = (Object.keys(TRAIN_TARGET) as TrainId[]).map((id) => ({
    id,
    status: 'running',
    route: [...routes[id]],
    routeIndex: 0,
    currentEdgeId: null,
    edgeElapsedSeconds: 0,
    targetNodeId: TRAIN_TARGET[id].target,
  }));

  return {
    id: `game_${now.getTime()}`,
    playerName: DEFAULT_PLAYER_NAME,
    status: 'playing',
    startedAt: now.toISOString(),
    finishedAt: null,
    durationSeconds: GAME_DURATION_SECONDS,
    seed: gameSeed,
    graph: GRAPH,
    trains,
    lightning: LIGHTNING_TIMES.map((at) => ({ at, edgeId: null, resolved: false })),
    damagedEdgeIds,
    traveledEdgeIds: [],
    logs: [
      createLog('system', now.toISOString(), `暴雨 ${GAME_DURATION_SECONDS} 秒后到达。3 列车已自动发车，前方有损坏路段（红色）。`),
      createLog('system', now.toISOString(), '临近分岔口点箭头变道绕开损坏；必要时点“全体暂停”让所有车停 3 秒错峰。'),
    ],
    result: null,
    lastAdvancedElapsedSeconds: 0,
    stall: null,
    pauseCount: 0,
    accidentCount: 0,
    collidedPairs: [],
  };
}

// ---------------------------------------------------------------------------
// 逐秒模拟
// 模型：列车在节点停靠 1 秒后驶入下一段路（沿其规划路线的下一节点）。
// 事故：驶入损坏路段，或同一秒两车占用同一路段。
// ---------------------------------------------------------------------------
function currentEdgeOf(train: Train): MapEdge | null {
  if (!train.currentEdgeId) return null;
  return GRAPH.edges.find((e) => e.id === train.currentEdgeId) ?? null;
}

// 触发全员检修停滞（事故）。若已在停滞中则不叠加。
function startRepair(game: Game, second: number, now: Date, reason: string) {
  game.accidentCount += 1;
  game.logs.push(createLog('incident', now.toISOString(), `${reason} 全体列车检修停滞 ${REPAIR_STALL_SECONDS} 秒。`));
  if (!game.stall || game.stall.kind === 'pause') {
    game.stall = { kind: 'repair', untilSeconds: second + REPAIR_STALL_SECONDS, reason };
  }
}

function departFromNode(game: Game, train: Train, second: number, now: Date) {
  const atNode = train.route[train.routeIndex];
  // 抵达目标终点站 → 安全到站。
  if (atNode === train.targetNodeId) {
    if (train.status !== 'arrived') {
      train.status = 'arrived';
      train.currentEdgeId = null;
      game.logs.push(createLog('arrival', now.toISOString(), `${train.id} 已安全回到${nodeLabel(train.targetNodeId)}。`));
    }
    return;
  }
  // 抵达“别的终点站”（末端选错方向）→ 卡住无法前进，记为未到站（非事故）。
  if (isTerminal(atNode)) {
    train.status = 'stranded';
    train.currentEdgeId = null;
    game.logs.push(createLog('incident', now.toISOString(), `${train.id} 误入${nodeLabel(atNode)}，无法回到${nodeLabel(train.targetNodeId)}。`));
    return;
  }
  if (train.routeIndex >= train.route.length - 1) return;
  const nextNode = train.route[train.routeIndex + 1];
  const edge = findEdge(atNode, nextNode);
  if (!edge) return;
  train.currentEdgeId = edge.id;
  train.edgeElapsedSeconds = 0;
  // 仅挂上当前路段；是否「驶入损坏」在真正沿路段移动后再判定（路过端点节点不算）。
}

function advanceTrainOneSecond(game: Game, train: Train, second: number, now: Date) {
  if (train.status !== 'running') return;
  if (!train.currentEdgeId) {
    departFromNode(game, train, second, now);
    return;
  }
  train.edgeElapsedSeconds += 1;
  const edge = currentEdgeOf(train);
  if (!edge) return;
  // 真正沿损坏路段移动了至少 1 秒才算驶入；仅到达/路过其端点节点不触发。
  if (game.damagedEdgeIds.includes(edge.id) && train.edgeElapsedSeconds >= 1) {
    startRepair(game, second, now, `${train.id} 驶入损坏路段`);
    return;
  }
  if (train.edgeElapsedSeconds >= edge.seconds) {
    if (!game.traveledEdgeIds.includes(edge.id)) game.traveledEdgeIds.push(edge.id);
    train.routeIndex += 1;
    train.currentEdgeId = null;
    train.edgeElapsedSeconds = 0;
    departFromNode(game, train, second, now);
  }
}

// 两车同一秒占用同一路段 → 相撞事故（检修）。用 collidedPairs 去重，
// 防止检修 6s 后两车仍在同一段而反复触发。
function detectCollisions(game: Game, second: number, now: Date) {
  const byEdge = new Map<string, Train[]>();
  for (const train of game.trains) {
    if (train.status !== 'running' || !train.currentEdgeId) continue;
    const list = byEdge.get(train.currentEdgeId) ?? [];
    list.push(train);
    byEdge.set(train.currentEdgeId, list);
  }
  // 清理已不再共处的旧对。
  const stillTogether = new Set<string>();
  for (const [edgeId, trains] of byEdge) {
    if (trains.length < 2) continue;
    const ids = trains.map((t) => t.id).sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        stillTogether.add(`${edgeId}|${ids[i]}|${ids[j]}`);
      }
    }
  }
  game.collidedPairs = game.collidedPairs.filter((k) => stillTogether.has(k));

  for (const [edgeId, trains] of byEdge) {
    if (trains.length < 2) continue;
    const ids = trains.map((t) => t.id).sort();
    const key = `${edgeId}|${ids.join('|')}`;
    if (game.collidedPairs.includes(key)) continue; // 本次共处已判过
    game.collidedPairs.push(key);
    startRepair(game, second, now, `${ids.join('、')} 相撞`);
  }
}

// 挑一条可损坏的随机路段（避开列车当前所在、即将驶入的下一段、已走过的路）。
function pickLightningEdge(game: Game, seedOffset: number): string | null {
  const occupied = new Set<string>();
  for (const train of game.trains) {
    if (train.status !== 'running') continue;
    if (train.currentEdgeId) {
      occupied.add(train.currentEdgeId);
      // 保护即将抵达节点后的出站路段，避免「到站瞬间下一段变红」。
      if (train.routeIndex + 2 < train.route.length) {
        const outbound = findEdge(train.route[train.routeIndex + 1], train.route[train.routeIndex + 2]);
        if (outbound) occupied.add(outbound.id);
      }
    } else if (train.routeIndex < train.route.length - 1) {
      // 停在节点上：保护即将驶入的下一段。
      const next = findEdge(train.route[train.routeIndex], train.route[train.routeIndex + 1]);
      if (next) occupied.add(next.id);
    }
  }
  const candidates = GRAPH.edges.filter(
    (e) => !occupied.has(e.id) && !game.damagedEdgeIds.includes(e.id) && !game.traveledEdgeIds.includes(e.id),
  );
  if (candidates.length === 0) return null;
  const rng = mulberry32(game.seed + seedOffset);
  return candidates[Math.floor(rng() * candidates.length)].id;
}

// 雷击窗口：列车已驶入当前路段，且距抵达下一节点仍 >1 秒。
// 避免在「即将到站」时突然刷新损坏，导致下一段变红、列车像失踪/误入事故。
function canResolveLightning(game: Game): boolean {
  const movers = game.trains.filter((t) => t.status === 'running');
  if (movers.length === 0) return true;
  return movers.every((t) => {
    if (!t.currentEdgeId) {
      // 仍停在节点且还能出发 → 再等驶入路段；无路可走则不阻塞雷击。
      if (t.routeIndex >= t.route.length - 1) return true;
      const next = findEdge(t.route[t.routeIndex], t.route[t.routeIndex + 1]);
      return !next;
    }
    const edge = currentEdgeOf(t);
    if (!edge) return true;
    return edge.seconds - t.edgeElapsedSeconds > 1;
  });
}

function resolveLightning(game: Game, second: number, now: Date) {
  // at <= second：允许因临近到站而推迟的雷击在后续秒补打。
  const strike = game.lightning.find((l) => l.at <= second && !l.resolved);
  if (!strike) return;
  if (!canResolveLightning(game)) return;
  strike.resolved = true;
  const pickedId = pickLightningEdge(game, second);
  if (!pickedId) return;
  const picked = GRAPH.edges.find((e) => e.id === pickedId)!;
  game.damagedEdgeIds.push(picked.id);
  game.logs.push(createLog('lightning', now.toISOString(), `⚡ 雷击损坏路段：${nodeLabel(picked.from)}↔${nodeLabel(picked.to)}。`));
}

// 检修结束：清除并重 roll 损坏路段；并顶替（轮空）下一次定时雷击。
function onRepairComplete(game: Game, second: number, now: Date) {
  game.damagedEdgeIds = [];
  const rerolled: string[] = [];
  // 重 roll 一批（比开局克制），且保证每列车从当前位置仍可达终点。
  for (let i = 0; i < REPAIR_REROLL_COUNT; i += 1) {
    const candidateId = pickLightningEdge(game, second * 31 + i * 7);
    if (!candidateId) break;
    const e = GRAPH.edges.find((x) => x.id === candidateId)!;
    const trial = new Set([...rerolled, e.id].map((id) => {
      const ed = GRAPH.edges.find((x) => x.id === id)!;
      return edgeKey(ed.from, ed.to);
    }));
    const reachable = game.trains.every((t) => {
      if (t.status !== 'running') return true;
      const from = t.currentEdgeId ? t.route[t.routeIndex + 1] : t.route[t.routeIndex];
      return from ? shortestPath(from, t.targetNodeId, trial) !== null : true;
    });
    if (reachable) rerolled.push(e.id);
  }
  game.damagedEdgeIds = rerolled;
  // 顶替一次定时雷击（轮空）。
  const nextStrike = game.lightning.find((l) => !l.resolved);
  if (nextStrike) nextStrike.resolved = true;
  game.logs.push(createLog('lightning', now.toISOString(), '检修完成，损坏路段已刷新（本次顶替一次雷击）。'));
}

function getSummary(game: Game) {
  const arrivedCount = game.trains.filter((t) => t.status === 'arrived').length;
  const unfinishedCount = game.trains.filter((t) => t.status !== 'arrived').length;
  return { arrivedCount, incidentCount: game.accidentCount, unfinishedCount };
}

function calculateRating(r: Omit<GameResult, 'rating'>): GameResult['rating'] {
  // S：三车全到、0 事故、0 暂停（全靠变道零失误）。
  if (r.arrivedCount === 3 && r.incidentCount === 0 && r.pauseCount === 0) return 'S';
  if (r.arrivedCount === 3 && r.incidentCount === 0) return 'A';
  if (r.arrivedCount === 3) return 'B';
  if (r.arrivedCount === 2) return 'C';
  return 'D';
}

function buildResult(game: Game, elapsedSeconds: number): GameResult {
  const summary = getSummary(game);
  const completionTimeSeconds = summary.arrivedCount === 3 ? elapsedSeconds : null;
  const base = { ...summary, completionTimeSeconds, pauseCount: game.pauseCount };
  return { ...base, rating: calculateRating(base) };
}

function finishGameIfNeeded(game: Game, now: Date, elapsedSeconds: number) {
  if (game.status === 'finished') return game;
  // 仅当全部到站（stranded 不算终态解决，需等暴雨到达）或暴雨到达时结束。
  const allArrivedOrStranded = game.trains.every((t) => t.status === 'arrived' || t.status === 'stranded');
  if (elapsedSeconds >= game.durationSeconds || allArrivedOrStranded) {
    game.status = 'finished';
    game.finishedAt = now.toISOString();
    game.result = buildResult(game, elapsedSeconds);
    game.logs.push(createLog('finish', now.toISOString(), `暴雨到达，本局结束，评级 ${game.result.rating}。`));
  }
  return game;
}

export function advanceGameToTime(inputGame: Game, now: Date): Game {
  const game = cloneGame(inputGame);
  const elapsedSeconds = getElapsedSeconds(game, now);
  if (elapsedSeconds <= game.lastAdvancedElapsedSeconds || game.status === 'finished') {
    return finishGameIfNeeded(game, now, elapsedSeconds);
  }
  for (let second = game.lastAdvancedElapsedSeconds + 1; second <= elapsedSeconds; second += 1) {
    // 停滞中：列车与雷击都冻结，仅倒计时（挂钟）推进。
    if (game.stall) {
      if (second >= game.stall.untilSeconds) {
        const wasRepair = game.stall.kind === 'repair';
        game.stall = null;
        if (wasRepair) onRepairComplete(game, second, now);
      }
      // 停滞结束的那一秒起恢复推进；本秒仍视为停滞不动。
      if (game.stall) {
        const finishedNow = finishGameIfNeeded(game, now, second);
        if (finishedNow.status === 'finished') {
          game.lastAdvancedElapsedSeconds = second;
          return finishedNow;
        }
        continue;
      }
    }
    // 先推进列车，再结算雷击：让「刚驶入新路段」的时刻能立刻满足雷击窗口，
    // 避免在即将到站（路段末秒）时刷新损坏。
    for (const train of game.trains) advanceTrainOneSecond(game, train, second, now);
    resolveLightning(game, second, now);
    detectCollisions(game, second, now);
    const finished = finishGameIfNeeded(game, now, second);
    if (finished.status === 'finished') {
      game.lastAdvancedElapsedSeconds = second;
      return finished;
    }
  }
  game.lastAdvancedElapsedSeconds = elapsedSeconds;
  return finishGameIfNeeded(game, now, elapsedSeconds);
}

// ---------------------------------------------------------------------------
// 玩家动作：全体暂停（所有列车停滞 3 秒，倒计时照走）
// ---------------------------------------------------------------------------
export function pauseAllTrains(inputGame: Game, now: Date): Game {
  const game = advanceGameToTime(inputGame, now);
  if (game.status === 'finished') throw new GameRuleError('GAME_FINISHED', '暴雨已到达，游戏结束');
  const elapsed = getElapsedSeconds(game, now);
  if (game.stall) {
    throw new GameRuleError('INVALID_TRAIN_STATE', '当前已处于停滞中，无法再次暂停');
  }
  game.pauseCount += 1;
  game.stall = { kind: 'pause', untilSeconds: elapsed + PAUSE_STALL_SECONDS };
  game.logs.push(createLog('action', now.toISOString(), `全体暂停：所有列车停滞 ${PAUSE_STALL_SECONDS} 秒（倒计时继续）。`));
  return finishGameIfNeeded(game, now, elapsed);
}

// ---------------------------------------------------------------------------
// 变道决策上下文
// junction = 列车“即将抵达的节点”：在路段上时为 route[routeIndex+1]，停在节点时为 route[routeIndex]。
// prevNode = 来的方向（不允许原路折返）。lit = 列车正驶入该分岔口（在其入边上）。
// ---------------------------------------------------------------------------
type DecisionContext = {
  junctionNodeId: string;
  junctionIndex: number;
  prevNodeId: string | null;
  lit: boolean;
};

function getDecisionContext(train: Train): DecisionContext | null {
  if (train.status !== 'running') return null;
  let junctionIndex: number;
  let lit: boolean;
  if (train.currentEdgeId) {
    junctionIndex = train.routeIndex + 1;
    lit = true;
  } else {
    junctionIndex = train.routeIndex;
    lit = false;
  }
  if (junctionIndex >= train.route.length) return null;
  const junctionNodeId = train.route[junctionIndex];
  if (junctionNodeId === train.targetNodeId) return null;
  const prevNodeId = junctionIndex > 0 ? train.route[junctionIndex - 1] : null;
  return { junctionNodeId, junctionIndex, prevNodeId, lit };
}

function buildDecision(train: Train, game: Game): TrainDecision | null {
  const ctx = getDecisionContext(train);
  if (!ctx) return null;
  const damagedKeys = damagedKeySet(game.damagedEdgeIds);
  const plannedNext = ctx.junctionIndex + 1 < train.route.length ? train.route[ctx.junctionIndex + 1] : null;

  const options: DecisionOption[] = [];
  for (const v of forwardNeighborsOf(ctx.junctionNodeId)) {
    if (v === ctx.prevNodeId) continue;
    const edge = findEdge(ctx.junctionNodeId, v)!;
    const damaged = game.damagedEdgeIds.includes(edge.id);
    const prefix = train.route.slice(0, ctx.junctionIndex + 1);
    let resultingRoute: string[];
    if (isTerminal(v)) {
      // 选向某个终点站：路线就到该站为止。若选错站，抵达即事故（预览如实展示）。
      resultingRoute = [...prefix, v];
    } else {
      const tail = shortestPath(v, train.targetNodeId, damagedKeys);
      if (tail) {
        resultingRoute = [...prefix, ...tail];
      } else {
        const loose = shortestPath(v, train.targetNodeId, new Set());
        resultingRoute = loose ? [...prefix, ...loose] : [...prefix, v];
      }
    }
    options.push({ viaNodeId: v, edgeId: edge.id, damaged, isCurrent: v === plannedNext, resultingRoute });
  }
  if (options.length < 2) return null;
  return { junctionNodeId: ctx.junctionNodeId, lit: ctx.lit, options };
}

// ---------------------------------------------------------------------------
// 玩家动作：变道（点击某个分岔方向）
// ---------------------------------------------------------------------------
function findTrain(game: Game, trainId: TrainId): Train {
  const train = game.trains.find((t) => t.id === trainId);
  if (!train) throw new GameRuleError('INVALID_TRAIN_STATE', `未知列车 ${trainId}`);
  return train;
}

export function rerouteTrain(
  inputGame: Game,
  trainId: TrainId,
  viaNodeId: string,
  now: Date,
  junctionNodeId?: string,
): Game {
  const game = advanceGameToTime(inputGame, now);
  if (game.status === 'finished') throw new GameRuleError('GAME_FINISHED', '暴雨已到达，游戏结束');
  const train = findTrain(game, trainId);
  if (train.status !== 'running') {
    throw new GameRuleError('INVALID_TRAIN_STATE', `${trainId} 已进入终态，无法变道`);
  }
  const ctx = getDecisionContext(train);
  if (!ctx) throw new GameRuleError('INVALID_REROUTE', `${trainId} 当前没有可变道的分岔口`);
  // 过期点击：客户端点的箭头属于列车已驶过的分岔口（轮询延迟所致）。
  if (junctionNodeId && junctionNodeId !== ctx.junctionNodeId) {
    throw new GameRuleError('INVALID_REROUTE', `${trainId} 已驶过该分岔口，变道取消，请对准当前分岔口重试`);
  }
  if (viaNodeId === ctx.prevNodeId || !forwardNeighborsOf(ctx.junctionNodeId).includes(viaNodeId)) {
    throw new GameRuleError('INVALID_REROUTE', `${viaNodeId} 不是 ${nodeLabel(ctx.junctionNodeId)} 的可选方向`);
  }
  const edge = findEdge(ctx.junctionNodeId, viaNodeId)!;
  if (game.damagedEdgeIds.includes(edge.id)) {
    throw new GameRuleError('INVALID_REROUTE', '该方向路段已损坏，不能选择');
  }
  const prefix = train.route.slice(0, ctx.junctionIndex + 1);
  if (isTerminal(viaNodeId)) {
    // 直接驶向所选终点站：不自动纠正。选错站将在抵达时判事故。
    train.route = [...prefix, viaNodeId];
    game.logs.push(
      createLog('action', now.toISOString(), `${trainId} 在${nodeLabel(ctx.junctionNodeId)}驶向${nodeLabel(viaNodeId)}。`),
    );
    return finishGameIfNeeded(game, now, getElapsedSeconds(game, now));
  }
  const damagedKeys = damagedKeySet(game.damagedEdgeIds);
  const tail = shortestPath(viaNodeId, train.targetNodeId, damagedKeys);
  if (!tail) throw new GameRuleError('NO_ALTERNATE_ROUTE', `${trainId} 从该方向无法避开损坏抵达终点`);

  train.route = [...prefix, ...tail];
  game.logs.push(
    createLog('action', now.toISOString(), `${trainId} 在${nodeLabel(ctx.junctionNodeId)}变道，改经 ${tail.map(nodeLabel).join(' → ')}。`),
  );
  return finishGameIfNeeded(game, now, getElapsedSeconds(game, now));
}

// ---------------------------------------------------------------------------
// 对外视图
// ---------------------------------------------------------------------------
function getTrainPosition(train: Train): TrainPosition {
  if (train.currentEdgeId && train.status === 'running') {
    const edge = currentEdgeOf(train);
    if (edge) {
      const progress = edge.seconds > 0 ? Math.min(1, train.edgeElapsedSeconds / edge.seconds) : 1;
      // 用路线行进方向，而不是 edge 定义方向，避免轨迹/底图颜色对错车。
      const from = train.route[train.routeIndex] ?? edge.from;
      const to = train.route[train.routeIndex + 1] ?? edge.to;
      return { kind: 'edge', edgeId: edge.id, from, to, progress };
    }
  }
  return { kind: 'node', nodeId: train.route[train.routeIndex] };
}

function toTrainView(train: Train, game: Game): TrainView {
  const nextNodeId = train.routeIndex < train.route.length - 1 ? train.route[train.routeIndex + 1] : null;
  const edge = currentEdgeOf(train);
  const secondsToNextNode = edge ? Math.max(0, edge.seconds - train.edgeElapsedSeconds) : null;
  // 停滞中：运行车对外显示为 stalled（冻结），且不提供变道选项。
  const stalled = game.stall !== null && train.status === 'running';
  return {
    id: train.id,
    status: stalled ? 'stalled' : train.status,
    route: [...train.route],
    position: getTrainPosition(train),
    nextNodeId,
    targetNodeId: train.targetNodeId,
    secondsToNextNode,
    decision: stalled ? null : buildDecision(train, game),
  };
}

export function serializeGameView(game: Game, now: Date): GameView {
  const elapsedSeconds = getElapsedSeconds(game, now);
  const summary = getSummary(game);
  const activeEdges = new Map<string, TrainId[]>();
  for (const train of game.trains) {
    if (train.status === 'running' && train.currentEdgeId) {
      const list = activeEdges.get(train.currentEdgeId) ?? [];
      list.push(train.id);
      activeEdges.set(train.currentEdgeId, list);
    }
  }
  return {
    id: game.id,
    playerName: game.playerName,
    status: game.status,
    elapsedSeconds,
    remainingSeconds: Math.max(0, game.durationSeconds - elapsedSeconds),
    stall: game.stall
      ? {
          kind: game.stall.kind,
          secondsLeft: Math.max(0, game.stall.untilSeconds - elapsedSeconds),
          ...(game.stall.reason ? { reason: game.stall.reason } : {}),
        }
      : null,
    pauseCount: game.pauseCount,
    accidentCount: game.accidentCount,
    graph: game.graph,
    trains: game.trains.map((t) => toTrainView(t, game)),
    damagedEdgeIds: [...game.damagedEdgeIds],
    activeEdges: [...activeEdges.entries()].map(([edgeId, trainIds]) => ({ edgeId, trainIds })),
    summary,
    result: game.result,
    logs: game.logs.slice(-14),
  };
}

export function buildLeaderboardEntry(game: Game): LeaderboardEntry {
  if (!game.result || !game.finishedAt) throw new Error('Game is not finished');
  return {
    gameId: game.id,
    playerName: game.playerName,
    arrivedCount: game.result.arrivedCount,
    incidentCount: game.result.incidentCount,
    unfinishedCount: game.result.unfinishedCount,
    completionTimeSeconds: game.result.completionTimeSeconds,
    rating: game.result.rating,
    finishedAt: game.finishedAt,
  };
}

export { GRAPH, shortestPath };




