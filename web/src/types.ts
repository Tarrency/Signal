export type TrainId = 'T1' | 'T2' | 'T3';
export type RouteId = 'blue' | 'orange';
export type TrainStatus = 'waiting' | 'in_transit' | 'arrived' | 'incident';
export type StationId = 'west_park' | 'south_bridge' | 'central' | 'east_harbor' | 'north_dock';
export type SignalState = 'green' | 'red';
export type Rating = 'S' | 'A' | 'B' | 'C' | 'D';

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

export type GameResult = {
  arrivedCount: number;
  incidentCount: number;
  unfinishedCount: number;
  completionTimeSeconds: number | null;
  rating: Rating;
};

export type GameLog = {
  id: string;
  timestamp: string;
  type: 'dispatch' | 'arrival' | 'signal_change' | 'incident' | 'finish' | 'system';
  message: string;
};

export type GameView = {
  id: string;
  playerName: string;
  status: 'playing' | 'finished';
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

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};
