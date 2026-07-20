// ============================================================================
// 《末班信号站 · 暴雨调度》类型定义
// 暴雨 24 秒后到达，调度员需在暴雨前把多列车安全调回各自终点站。
// 服务端为权威模拟：图网络 + 逐秒推进 + 确定性事故（撞车 / 雷损路段）。
// ============================================================================

export type TrainId = 'T1' | 'T2' | 'T3';
export type GameStatus = 'playing' | 'finished';

// 列车运行态：
// - running：沿路段自动前进
// - stalled：全局停滞中（暂停或检修）冻结原地
// - arrived：安全到达终点站
// - stranded：末端误入别的终点站，卡住无法前进（记为未到站）
export type TrainStatus = 'running' | 'stalled' | 'arrived' | 'stranded';

export type LogType =
  | 'system'
  | 'move'
  | 'arrival'
  | 'incident'
  | 'lightning'
  | 'action'
  | 'finish';

export type Rating = 'S' | 'A' | 'B' | 'C' | 'D';

export type ErrorCode =
  | 'INVALID_PAYLOAD'
  | 'GAME_NOT_FOUND'
  | 'GAME_FINISHED'
  | 'INVALID_TRAIN_ID'
  | 'INVALID_TRAIN_STATE'
  | 'INVALID_REROUTE'
  | 'NO_ALTERNATE_ROUTE';

// ---------------------------------------------------------------------------
// 地图图网络
// ---------------------------------------------------------------------------

// 节点类型：始发端（起点）/ 终点站 / 普通枢纽节点
export type NodeKind = 'depot' | 'terminal' | 'junction';

export type MapNode = {
  id: string;
  label: string;
  kind: NodeKind;
  // 归一化坐标（0~1），前端按容器尺寸绘制。
  x: number;
  y: number;
};

export type MapEdge = {
  id: string;
  from: string;
  to: string;
  // 通过该路段所需秒数。
  seconds: number;
  // 曲线弯曲量（垂直于连线方向的偏移，归一化坐标系；0=直线）。前端据此画二次贝塞尔。
  curve: number;
};

export type MapGraph = {
  nodes: MapNode[];
  edges: MapEdge[];
};

// ---------------------------------------------------------------------------
// 雷电损坏时刻表：在指定秒随机劈坏一条当时未被占用的路段。
// 存 seed 保证同一对局可复现。
// ---------------------------------------------------------------------------

export type LightningStrike = {
  at: number; // 触发秒（相对开局）
  edgeId: string | null; // 实际被劈坏的路段（模拟推进时确定后写回）
  resolved: boolean;
};

// ---------------------------------------------------------------------------
// 列车运行状态（服务端内部）
// ---------------------------------------------------------------------------

export type Train = {
  id: TrainId;
  status: TrainStatus;
  // 规划路线：一串节点 id，从起点到终点。
  route: string[];
  // 已抵达路线中的第几个节点（索引）。
  routeIndex: number;
  // 若在路段上运行：当前路段 id 与已行驶秒数；否则均为 null/0。
  currentEdgeId: string | null;
  edgeElapsedSeconds: number;
  targetNodeId: string; // 终点站节点 id
};

export type GameLog = {
  id: string;
  timestamp: string;
  type: LogType;
  message: string;
};

export type GameResult = {
  arrivedCount: number;
  incidentCount: number; // 事故（检修）次数
  unfinishedCount: number;
  completionTimeSeconds: number | null;
  pauseCount: number; // 累计暂停次数
  rating: Rating;
};

// 全局停滞：暂停(3s) 或 事故检修(6s)。期间所有列车冻结，倒计时照常推进。
export type StallKind = 'pause' | 'repair';
export type Stall = {
  kind: StallKind;
  untilSeconds: number; // 有效经过秒 >= 该值时停滞结束
  /** 检修原因文案（仅 repair）；暂停无此字段 */
  reason?: string;
};

export type Game = {
  id: string;
  playerName: string;
  status: GameStatus;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number; // 暴雨倒计时（挂钟推进，不冻结）
  seed: number;
  graph: MapGraph;
  trains: Train[];
  lightning: LightningStrike[];
  damagedEdgeIds: string[]; // 已损坏（危险红）的路段
  traveledEdgeIds: string[]; // 已被任一列车走完的路段（雷电不再劈坏这些）
  logs: GameLog[];
  result: GameResult | null;
  lastAdvancedElapsedSeconds: number;
  // 停滞 / 计数：
  stall: Stall | null;
  pauseCount: number; // 累计暂停次数
  accidentCount: number; // 累计事故（检修）次数
  collidedPairs: string[]; // 已判定过的相撞对（edgeId|Ta|Tb），防止检修后重复触发
};

// ---------------------------------------------------------------------------
// 对外视图（前端渲染用）
// ---------------------------------------------------------------------------

// 列车位置：要么停在某节点，要么在某路段上（含进度 0~1）。
export type TrainPosition =
  | { kind: 'node'; nodeId: string }
  | { kind: 'edge'; edgeId: string; from: string; to: string; progress: number };

// 单个变道方向选项（在即将抵达的分岔节点处，指向某个相邻节点）。
export type DecisionOption = {
  viaNodeId: string; // 从分岔节点驶向的下一节点
  edgeId: string;
  damaged: boolean; // 该方向路段是否已损坏（不可选）
  isCurrent: boolean; // 是否为当前规划方向
  resultingRoute: string[]; // 选该方向后的完整新路线（供 hover 预览）
};

// 列车即将面临的变道决策（在其“即将抵达的节点”处）。
export type TrainDecision = {
  junctionNodeId: string; // 分岔节点
  lit: boolean; // 列车是否正行驶在“驶入该分岔节点”的路段上（箭头亮起）
  options: DecisionOption[];
};

export type TrainView = {
  id: TrainId;
  status: TrainStatus;
  route: string[];
  position: TrainPosition;
  nextNodeId: string | null;
  targetNodeId: string;
  secondsToNextNode: number | null;
  decision: TrainDecision | null;
};

export type GameView = {
  id: string;
  playerName: string;
  status: GameStatus;
  elapsedSeconds: number;
  remainingSeconds: number; // 暴雨到达剩余秒（挂钟推进）
  // 当前全局停滞（暂停/检修）；无则 null。secondsLeft 供前端显示。
  stall: { kind: StallKind; secondsLeft: number; reason?: string } | null;
  pauseCount: number;
  accidentCount: number;
  graph: MapGraph;
  trains: TrainView[];
  damagedEdgeIds: string[];
  // 各路段当前被哪些列车“点亮”（用于路段染色）。
  activeEdges: { edgeId: string; trainIds: TrainId[] }[];
  summary: {
    arrivedCount: number;
    incidentCount: number;
    unfinishedCount: number;
  };
  result: GameResult | null;
  logs: GameLog[];
};

export type LeaderboardEntry = {
  gameId: string;
  playerName: string;
  arrivedCount: number;
  incidentCount: number;
  unfinishedCount: number;
  completionTimeSeconds: number | null;
  rating: Rating;
  finishedAt: string;
};

export type ApiError = {
  code: ErrorCode;
  message: string;
};
