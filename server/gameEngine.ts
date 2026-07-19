import type {
  Game,
  GameLog,
  GameResult,
  GameView,
  LeaderboardEntry,
  SignalState,
  SignalWindow,
  StationId,
  Train,
  TrainId,
  TrainView,
} from './types.js';

const DEFAULT_PLAYER_NAME = '末班车调度员';
const GAME_DURATION_SECONDS = 60;
const SIGNAL_SCHEDULE: SignalWindow[] = [
  { from: 0, to: 8, state: 'green' },
  { from: 8, to: 14, state: 'red' },
  { from: 14, to: 24, state: 'green' },
  { from: 24, to: 30, state: 'red' },
  { from: 30, to: 42, state: 'green' },
  { from: 42, to: 48, state: 'red' },
  { from: 48, to: 60, state: 'green' },
];

const ROUTES: Record<TrainId, StationId[]> = {
  T1: ['west_park', 'central', 'east_harbor'],
  T2: ['south_bridge', 'central', 'north_dock'],
  T3: ['west_park', 'central', 'east_harbor'],
};

let logSequence = 0;

export class GameRuleError extends Error {
  constructor(
    public code:
      | 'GAME_FINISHED'
      | 'INVALID_TRAIN_STATE'
      | 'SIGNAL_BLOCKED'
      | 'STATION_OCCUPIED',
    message: string,
  ) {
    super(message);
  }
}

function createLog(type: GameLog['type'], timestamp: string, message: string): GameLog {
  logSequence += 1;
  return {
    id: `${type}_${logSequence}`,
    timestamp,
    type,
    message,
  };
}

function cloneGame(game: Game): Game {
  return {
    ...game,
    trains: game.trains.map((train) => ({ ...train })),
    logs: [...game.logs],
    signalSchedule: [...game.signalSchedule],
    result: game.result ? { ...game.result } : null,
  };
}

function getElapsedSeconds(game: Game, now: Date) {
  const diffSeconds = Math.floor((now.getTime() - new Date(game.startedAt).getTime()) / 1000);
  return Math.max(0, Math.min(game.durationSeconds, diffSeconds));
}

function getSignalWindow(schedule: SignalWindow[], elapsedSeconds: number) {
  return schedule.find((window) => elapsedSeconds >= window.from && elapsedSeconds < window.to) ?? schedule[schedule.length - 1];
}

export function getSignalState(schedule: SignalWindow[], elapsedSeconds: number): SignalState {
  return getSignalWindow(schedule, elapsedSeconds).state;
}

export function getSecondsUntilNextSwitch(schedule: SignalWindow[], elapsedSeconds: number) {
  const window = getSignalWindow(schedule, elapsedSeconds);
  return Math.max(0, window.to - elapsedSeconds);
}

function getRoutePath(trainId: TrainId) {
  return ROUTES[trainId];
}

function getNextStationId(train: Train): StationId | null {
  if (train.status === 'arrived' || train.status === 'incident') {
    return null;
  }

  const route = getRoutePath(train.id);

  if (train.status === 'in_transit') {
    return train.targetStationId;
  }

  if (!train.currentStationId) {
    return null;
  }

  const currentIndex = route.indexOf(train.currentStationId);
  if (currentIndex === -1 || currentIndex === route.length - 1) {
    return null;
  }

  return route[currentIndex + 1];
}

function getTravelSeconds(from: StationId, to: StationId) {
  if ((from === 'west_park' || from === 'south_bridge') && to === 'central') {
    return 5;
  }
  if (from === 'central' && (to === 'east_harbor' || to === 'north_dock')) {
    return 4;
  }
  return 0;
}

function isStationOccupied(game: Game, stationId: StationId, excludingTrainId?: TrainId) {
  return game.trains.some(
    (train) =>
      train.id !== excludingTrainId &&
      ((train.status === 'waiting' && train.currentStationId === stationId) ||
        (train.status === 'in_transit' && train.targetStationId === stationId)),
  );
}

function getSummary(game: Game) {
  const arrivedCount = game.trains.filter((train) => train.status === 'arrived').length;
  const incidentCount = game.trains.filter((train) => train.status === 'incident').length;
  const unfinishedCount = game.trains.filter((train) => train.status !== 'arrived' && train.status !== 'incident').length;
  return { arrivedCount, incidentCount, unfinishedCount };
}

function calculateRating(result: Omit<GameResult, 'rating'>): GameResult['rating'] {
  if (result.arrivedCount === 3 && result.incidentCount === 0 && (result.completionTimeSeconds ?? 999) <= 40) {
    return 'S';
  }
  if (result.arrivedCount === 3 && result.incidentCount === 0 && (result.completionTimeSeconds ?? 999) <= 60) {
    return 'A';
  }
  if (result.arrivedCount === 2 && result.incidentCount === 0) {
    return 'B';
  }
  if ((result.arrivedCount === 2 && result.incidentCount === 1) || result.arrivedCount === 1) {
    return 'C';
  }
  return 'D';
}

function buildResult(game: Game, elapsedSeconds: number): GameResult {
  const summary = getSummary(game);
  const completionTimeSeconds = summary.arrivedCount === 3 && summary.incidentCount === 0 ? elapsedSeconds : null;
  const resultBase = {
    ...summary,
    completionTimeSeconds,
  };
  return {
    ...resultBase,
    rating: calculateRating(resultBase),
  };
}

function finishGameIfNeeded(game: Game, now: Date, elapsedSeconds: number) {
  if (game.status === 'finished') {
    return game;
  }

  const allResolved = game.trains.every((train) => train.status === 'arrived' || train.status === 'incident');
  if (elapsedSeconds >= game.durationSeconds || allResolved) {
    game.status = 'finished';
    game.finishedAt = now.toISOString();
    game.result = buildResult(game, elapsedSeconds);
    game.logs.push(createLog('finish', now.toISOString(), `本局结束，评级 ${game.result.rating}。`));
  }

  return game;
}

function getStationName(stationId: StationId) {
  switch (stationId) {
    case 'west_park':
      return '西园站';
    case 'south_bridge':
      return '南桥站';
    case 'central':
      return '中央信号站';
    case 'east_harbor':
      return '东港站';
    case 'north_dock':
      return '北码头站';
  }
}

function resolveArrival(game: Game, train: Train, elapsedSeconds: number, now: Date) {
  const targetStationId = train.targetStationId;
  if (!targetStationId) {
    return;
  }

  if (targetStationId === 'central' && getSignalState(game.signalSchedule, elapsedSeconds) === 'red') {
    train.status = 'incident';
    train.targetStationId = null;
    train.arrivalDueAt = null;
    train.departureAt = null;
    train.travelSeconds = null;
    game.logs.push(createLog('incident', now.toISOString(), `${train.id} 因中央信号站转红被困区间，判定为事故。`));
    return;
  }

  train.status = targetStationId === 'east_harbor' || targetStationId === 'north_dock' ? 'arrived' : 'waiting';
  train.currentStationId = targetStationId;
  train.targetStationId = null;
  train.arrivalDueAt = null;
  train.departureAt = null;
  train.travelSeconds = null;

  if (train.status === 'arrived') {
    game.logs.push(createLog('arrival', now.toISOString(), `${train.id} 已安全到达${targetStationId === 'east_harbor' ? '东港站' : '北码头站'}。`));
  } else {
    game.logs.push(createLog('arrival', now.toISOString(), `${train.id} 到达中央信号站，等待下一次放行。`));
  }
}

export function createNewGame(now: Date): Game {
  return {
    id: `game_${now.getTime()}`,
    playerName: DEFAULT_PLAYER_NAME,
    status: 'playing',
    startedAt: now.toISOString(),
    finishedAt: null,
    durationSeconds: GAME_DURATION_SECONDS,
    signalSchedule: SIGNAL_SCHEDULE,
    signalState: 'green',
    lastAdvancedElapsedSeconds: 0,
    result: null,
    logs: [createLog('system', now.toISOString(), '值班开始，请在 60 秒内调度末班车安全到站。')],
    trains: [
      {
        id: 'T1',
        route: 'blue',
        status: 'waiting',
        currentStationId: 'west_park',
        targetStationId: null,
        departureAt: null,
        arrivalDueAt: null,
        travelSeconds: null,
      },
      {
        id: 'T2',
        route: 'orange',
        status: 'waiting',
        currentStationId: 'south_bridge',
        targetStationId: null,
        departureAt: null,
        arrivalDueAt: null,
        travelSeconds: null,
      },
      {
        id: 'T3',
        route: 'blue',
        status: 'waiting',
        currentStationId: 'west_park',
        targetStationId: null,
        departureAt: null,
        arrivalDueAt: null,
        travelSeconds: null,
      },
    ],
  };
}

export function advanceGameToTime(inputGame: Game, now: Date): Game {
  const game = cloneGame(inputGame);
  const elapsedSeconds = getElapsedSeconds(game, now);

  if (elapsedSeconds <= game.lastAdvancedElapsedSeconds || game.status === 'finished') {
    game.signalState = getSignalState(game.signalSchedule, elapsedSeconds);
    return finishGameIfNeeded(game, now, elapsedSeconds);
  }

  for (let second = game.lastAdvancedElapsedSeconds + 1; second <= elapsedSeconds; second += 1) {
    const nextSignalState = getSignalState(game.signalSchedule, second);
    if (nextSignalState !== game.signalState) {
      game.signalState = nextSignalState;
      game.logs.push(
        createLog(
          'signal_change',
          now.toISOString(),
          `中央信号站信号切换为${nextSignalState === 'green' ? '绿灯' : '红灯'}。`,
        ),
      );
    }

    game.trains
      .filter((train) => train.status === 'in_transit' && train.arrivalDueAt)
      .forEach((train) => {
        const dueElapsedSeconds = getElapsedSeconds(game, new Date(train.arrivalDueAt!));
        if (second >= dueElapsedSeconds) {
          resolveArrival(game, train, second, now);
        }
      });

    const possiblyFinishedGame = finishGameIfNeeded(game, now, second);
    if (possiblyFinishedGame.status === 'finished') {
      return possiblyFinishedGame;
    }
  }

  game.lastAdvancedElapsedSeconds = elapsedSeconds;
  game.signalState = getSignalState(game.signalSchedule, elapsedSeconds);
  return finishGameIfNeeded(game, now, elapsedSeconds);
}

function getBlockedReason(game: Game, train: Train, elapsedSeconds: number): string | null {
  if (game.status === 'finished') {
    return '当前游戏已结束';
  }
  if (train.status === 'in_transit') {
    return '列车正在区间运行中';
  }
  if (train.status === 'arrived') {
    return '列车已安全到站';
  }
  if (train.status === 'incident') {
    return '列车已发生事故';
  }

  const nextStationId = getNextStationId(train);
  if (!nextStationId) {
    return '当前没有可前往的下一站';
  }
  if (nextStationId === 'central' && getSignalState(game.signalSchedule, elapsedSeconds) === 'red') {
    return '中央信号站当前为红灯';
  }
  if (isStationOccupied(game, nextStationId, train.id)) {
    return nextStationId === 'central' ? '中央信号站当前被占用' : '目标站当前被占用';
  }
  return null;
}

function toTrainView(game: Game, train: Train, elapsedSeconds: number): TrainView {
  const nextStationId = getNextStationId(train);
  const blockedReason = getBlockedReason(game, train, elapsedSeconds);
  const secondsToArrival =
    train.status === 'in_transit' && train.arrivalDueAt
      ? Math.max(0, getElapsedSeconds(game, new Date(train.arrivalDueAt)) - elapsedSeconds)
      : null;

  return {
    id: train.id,
    route: train.route,
    status: train.status,
    currentStationId: train.currentStationId,
    nextStationId,
    canDispatch: blockedReason === null,
    blockedReason,
    travelSeconds: train.travelSeconds,
    secondsToArrival,
  };
}

export function serializeGameView(game: Game, now: Date): GameView {
  const elapsedSeconds = getElapsedSeconds(game, now);
  const summary = getSummary(game);
  return {
    id: game.id,
    playerName: game.playerName,
    status: game.status,
    elapsedSeconds,
    remainingSeconds: Math.max(0, game.durationSeconds - elapsedSeconds),
    signal: {
      stationId: 'central',
      state: getSignalState(game.signalSchedule, elapsedSeconds),
      secondsUntilSwitch: getSecondsUntilNextSwitch(game.signalSchedule, elapsedSeconds),
    },
    trains: game.trains.map((train) => toTrainView(game, train, elapsedSeconds)),
    summary,
    result: game.result,
    logs: game.logs.slice(-12),
  };
}

export function dispatchTrain(inputGame: Game, trainId: TrainId, now: Date): Game {
  const game = advanceGameToTime(inputGame, now);
  if (game.status === 'finished') {
    throw new GameRuleError('GAME_FINISHED', '当前游戏已结束，不能继续调度');
  }

  const train = game.trains.find((item) => item.id === trainId);
  if (!train || train.status !== 'waiting' || !train.currentStationId) {
    throw new GameRuleError('INVALID_TRAIN_STATE', `${trainId} 当前不处于可发车状态`);
  }

  const elapsedSeconds = getElapsedSeconds(game, now);
  const nextStationId = getNextStationId(train);
  if (!nextStationId) {
    throw new GameRuleError('INVALID_TRAIN_STATE', `${trainId} 当前没有可前往的下一站`);
  }
  if (nextStationId === 'central' && getSignalState(game.signalSchedule, elapsedSeconds) === 'red') {
    throw new GameRuleError('SIGNAL_BLOCKED', `中央信号站当前为红灯，${trainId} 无法发车`);
  }
  if (isStationOccupied(game, nextStationId, train.id)) {
    throw new GameRuleError(
      'STATION_OCCUPIED',
      `${nextStationId === 'central' ? '中央信号站' : '目标站'}当前被占用，${trainId} 无法发车`,
    );
  }

  const travelSeconds = getTravelSeconds(train.currentStationId, nextStationId);
  train.status = 'in_transit';
  train.targetStationId = nextStationId;
  train.travelSeconds = travelSeconds;
  train.departureAt = now.toISOString();
  train.arrivalDueAt = new Date(now.getTime() + travelSeconds * 1000).toISOString();
  train.currentStationId = null;

  const fromName = getStationName(train.route === 'orange' && nextStationId === 'central' ? 'south_bridge' : train.route === 'blue' && nextStationId === 'central' ? 'west_park' : 'central');
  const toName = getStationName(nextStationId);
  game.logs.push(createLog('dispatch', now.toISOString(), `${trainId} 从${fromName}发车，前往${toName}，预计 ${travelSeconds} 秒后到达。`));

  return finishGameIfNeeded(game, now, elapsedSeconds);
}

export function buildLeaderboardEntry(game: Game): LeaderboardEntry {
  if (!game.result || !game.finishedAt) {
    throw new Error('Game is not finished');
  }

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
