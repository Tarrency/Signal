export type TrainId = 'T1' | 'T2' | 'T3';
export type GameStatus = 'playing' | 'finished';
export type TrainStatus = 'running' | 'stalled' | 'arrived' | 'stranded';
export type StallKind = 'pause' | 'repair';
export type Rating = 'S' | 'A' | 'B' | 'C' | 'D';
export type NodeKind = 'depot' | 'terminal' | 'junction';

export type MapNode = {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
};

export type MapEdge = {
  id: string;
  from: string;
  to: string;
  seconds: number;
  curve: number;
};

export type MapGraph = {
  nodes: MapNode[];
  edges: MapEdge[];
};

export type TrainPosition =
  | { kind: 'node'; nodeId: string }
  | { kind: 'edge'; edgeId: string; from: string; to: string; progress: number };

export type DecisionOption = {
  viaNodeId: string;
  edgeId: string;
  damaged: boolean;
  isCurrent: boolean;
  resultingRoute: string[];
};

export type TrainDecision = {
  junctionNodeId: string;
  lit: boolean;
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

export type GameResult = {
  arrivedCount: number;
  incidentCount: number;
  unfinishedCount: number;
  completionTimeSeconds: number | null;
  pauseCount: number;
  rating: Rating;
};

export type GameLog = {
  id: string;
  timestamp: string;
  type: 'system' | 'move' | 'arrival' | 'incident' | 'lightning' | 'action' | 'finish';
  message: string;
};

export type GameView = {
  id: string;
  playerName: string;
  status: GameStatus;
  elapsedSeconds: number;
  remainingSeconds: number;
  stall: { kind: StallKind; secondsLeft: number; reason?: string } | null;
  pauseCount: number;
  accidentCount: number;
  graph: MapGraph;
  trains: TrainView[];
  damagedEdgeIds: string[];
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

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};
