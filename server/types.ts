export type StationId = 'west_park' | 'south_bridge' | 'central' | 'east_harbor' | 'north_dock';
export type RouteId = 'blue' | 'orange';
export type TrainId = 'T1' | 'T2' | 'T3';
export type GameStatus = 'playing' | 'finished';
export type TrainStatus = 'waiting' | 'in_transit' | 'arrived' | 'incident';
export type SignalState = 'green' | 'red';
export type LogType = 'dispatch' | 'arrival' | 'signal_change' | 'incident' | 'finish' | 'system';
export type Rating = 'S' | 'A' | 'B' | 'C' | 'D';
export type ErrorCode =
  | 'INVALID_PAYLOAD'
  | 'GAME_NOT_FOUND'
  | 'GAME_FINISHED'
  | 'INVALID_TRAIN_ID'
  | 'INVALID_TRAIN_STATE'
  | 'SIGNAL_BLOCKED'
  | 'STATION_OCCUPIED';

export type SignalWindow = {
  from: number;
  to: number;
  state: SignalState;
};

export type Train = {
  id: TrainId;
  route: RouteId;
  status: TrainStatus;
  currentStationId: StationId | null;
  targetStationId: StationId | null;
  departureAt: string | null;
  arrivalDueAt: string | null;
  travelSeconds: number | null;
};

export type GameLog = {
  id: string;
  timestamp: string;
  type: LogType;
  message: string;
};

export type GameResult = {
  arrivedCount: number;
  incidentCount: number;
  unfinishedCount: number;
  completionTimeSeconds: number | null;
  rating: Rating;
};

export type Game = {
  id: string;
  playerName: string;
  status: GameStatus;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number;
  signalSchedule: SignalWindow[];
  trains: Train[];
  logs: GameLog[];
  result: GameResult | null;
  lastAdvancedElapsedSeconds: number;
  signalState: SignalState;
};

export type TrainView = {
  id: TrainId;
  route: RouteId;
  status: TrainStatus;
  currentStationId: StationId | null;
  nextStationId: StationId | null;
  canDispatch: boolean;
  blockedReason: string | null;
  travelSeconds: number | null;
  secondsToArrival: number | null;
};

export type GameView = {
  id: string;
  playerName: string;
  status: GameStatus;
  elapsedSeconds: number;
  remainingSeconds: number;
  signal: {
    stationId: 'central';
    state: SignalState;
    secondsUntilSwitch: number;
  };
  trains: TrainView[];
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
