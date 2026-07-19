import { describe, expect, it } from 'vitest';
import {
  GameRuleError,
  advanceGameToTime,
  buildLeaderboardEntry,
  createNewGame,
  dispatchTrain,
  getSecondsUntilNextSwitch,
  getSignalState,
  serializeGameView,
} from '../server/gameEngine.js';
import type { Game, SignalWindow, TrainId } from '../server/types.js';

// 固定基准时间，所有时序都相对它推进，避免依赖真实时钟。
const BASE = new Date('2026-07-19T00:00:00.000Z');

// 引擎里的固定信号时刻表（与 gameEngine 中的 SIGNAL_SCHEDULE 一致）。
const SCHEDULE: SignalWindow[] = [
  { from: 0, to: 8, state: 'green' },
  { from: 8, to: 14, state: 'red' },
  { from: 14, to: 24, state: 'green' },
  { from: 24, to: 30, state: 'red' },
  { from: 30, to: 42, state: 'green' },
  { from: 42, to: 48, state: 'red' },
  { from: 48, to: 60, state: 'green' },
];

/** 返回相对基准时间偏移 seconds 秒的 Date。 */
function at(seconds: number) {
  return new Date(BASE.getTime() + seconds * 1000);
}

describe('getSignalState', () => {
  it('区间起点取该区间状态', () => {
    expect(getSignalState(SCHEDULE, 0)).toBe('green');
    expect(getSignalState(SCHEDULE, 8)).toBe('red');
    expect(getSignalState(SCHEDULE, 14)).toBe('green');
    expect(getSignalState(SCHEDULE, 30)).toBe('green');
  });

  it('区间是左闭右开：to 的那一秒属于下一区间', () => {
    // 7 秒仍是首个绿灯区间，8 秒切到红灯。
    expect(getSignalState(SCHEDULE, 7)).toBe('green');
    expect(getSignalState(SCHEDULE, 8)).toBe('red');
  });

  it('超出时刻表末尾时落到最后一个区间', () => {
    expect(getSignalState(SCHEDULE, 60)).toBe('green');
    expect(getSignalState(SCHEDULE, 999)).toBe('green');
  });
});

describe('getSecondsUntilNextSwitch', () => {
  it('返回距当前区间结束的剩余秒数', () => {
    expect(getSecondsUntilNextSwitch(SCHEDULE, 0)).toBe(8);
    expect(getSecondsUntilNextSwitch(SCHEDULE, 7)).toBe(1);
    expect(getSecondsUntilNextSwitch(SCHEDULE, 8)).toBe(6); // 红灯区间 8->14
  });

  it('不会返回负数', () => {
    expect(getSecondsUntilNextSwitch(SCHEDULE, 999)).toBe(0);
  });
});

describe('createNewGame', () => {
  it('初始化 3 列等待中的车与绿灯', () => {
    const game = createNewGame(BASE);
    expect(game.status).toBe('playing');
    expect(game.trains).toHaveLength(3);
    expect(game.trains.every((t) => t.status === 'waiting')).toBe(true);
    expect(game.signalState).toBe('green');
    expect(game.durationSeconds).toBe(60);
  });

  it('列车起点站符合各自路线', () => {
    const game = createNewGame(BASE);
    const byId = Object.fromEntries(game.trains.map((t) => [t.id, t]));
    expect(byId.T1.currentStationId).toBe('west_park');
    expect(byId.T2.currentStationId).toBe('south_bridge');
    expect(byId.T3.currentStationId).toBe('west_park');
  });
});

describe('dispatchTrain', () => {
  it('绿灯下发车：列车进入区间运行', () => {
    const game = createNewGame(BASE);
    const next = dispatchTrain(game, 'T1', at(1)); // 1 秒时为绿灯
    const t1 = next.trains.find((t) => t.id === 'T1')!;
    expect(t1.status).toBe('in_transit');
    expect(t1.targetStationId).toBe('central');
    expect(t1.travelSeconds).toBe(5); // west_park -> central
    expect(t1.currentStationId).toBeNull();
  });

  it('红灯时前往中央站会被 SIGNAL_BLOCKED 拒绝', () => {
    const game = createNewGame(BASE);
    // 10 秒处于红灯区间 (8->14)。
    expect(() => dispatchTrain(game, 'T1', at(10))).toThrowError(GameRuleError);
    try {
      dispatchTrain(game, 'T1', at(10));
    } catch (err) {
      expect((err as GameRuleError).code).toBe('SIGNAL_BLOCKED');
    }
  });

  it('目标中央站被占用时抛 STATION_OCCUPIED', () => {
    let game = createNewGame(BASE);
    // T1 先发车占住去中央站的名额。
    game = dispatchTrain(game, 'T1', at(1));
    // 同一时刻 T3 也想去中央站，应被占用拦截。
    try {
      dispatchTrain(game, 'T3', at(1));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GameRuleError);
      expect((err as GameRuleError).code).toBe('STATION_OCCUPIED');
    }
  });

  it('非 waiting 状态的车不能发车', () => {
    let game = createNewGame(BASE);
    game = dispatchTrain(game, 'T1', at(1)); // T1 变为 in_transit
    try {
      dispatchTrain(game, 'T1', at(2));
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as GameRuleError).code).toBe('INVALID_TRAIN_STATE');
    }
  });
});

describe('advanceGameToTime', () => {
  it('列车到达中央站后转为 waiting 等待放行', () => {
    let game = createNewGame(BASE);
    game = dispatchTrain(game, 'T1', at(1)); // 1 秒发车，5 秒行程 -> 6 秒到达
    game = advanceGameToTime(game, at(7));
    const t1 = game.trains.find((t) => t.id === 'T1')!;
    expect(t1.status).toBe('waiting');
    expect(t1.currentStationId).toBe('central');
  });

  it('抵达中央站瞬间信号为红灯则判定事故', () => {
    let game = createNewGame(BASE);
    // 4 秒发车（绿灯），5 秒行程 -> 9 秒到达，此时处于红灯区间 (8->14)。
    game = dispatchTrain(game, 'T1', at(4));
    game = advanceGameToTime(game, at(10));
    const t1 = game.trains.find((t) => t.id === 'T1')!;
    expect(t1.status).toBe('incident');
  });

  it('时间到达 60 秒后游戏结束', () => {
    let game = createNewGame(BASE);
    game = advanceGameToTime(game, at(60));
    expect(game.status).toBe('finished');
    expect(game.result).not.toBeNull();
    expect(game.finishedAt).not.toBeNull();
  });
});

describe('评级与完整通关', () => {
  /** 把一列车从起点一路调度到终点站。 */
  function runTrainToEnd(game: Game, trainId: TrainId, startSecond: number): { game: Game; endSecond: number } {
    // 第一段：起点 -> 中央站（5 秒）。
    game = dispatchTrain(game, trainId, at(startSecond));
    let cursor = startSecond + 5;
    game = advanceGameToTime(game, at(cursor));
    // 第二段：中央站 -> 终点（4 秒）。
    game = dispatchTrain(game, trainId, at(cursor));
    cursor += 4;
    game = advanceGameToTime(game, at(cursor));
    return { game, endSecond: cursor };
  }

  it('三车全部安全到站且 40 秒内完成得 S 级', () => {
    let game = createNewGame(BASE);
    // 依次错峰调度，避开中央站占用和红灯。
    // T1: 0s 发 -> 5s 到中央 -> 5s 发 -> 9s 到东港。
    ({ game } = runTrainToEnd(game, 'T1', 0));
    // T2: 14s（绿灯 14->24）发 -> 19s 到中央 -> 19s 发 -> 23s 到北码头。
    ({ game } = runTrainToEnd(game, 'T2', 14));
    // T3: 30s（绿灯 30->42）发 -> 35s 到中央 -> 35s 发 -> 39s 到东港。
    let end = 0;
    ({ game, endSecond: end } = runTrainToEnd(game, 'T3', 30));

    game = advanceGameToTime(game, at(end));
    expect(game.status).toBe('finished');
    expect(game.result?.arrivedCount).toBe(3);
    expect(game.result?.incidentCount).toBe(0);
    expect(game.result?.completionTimeSeconds).toBeLessThanOrEqual(40);
    expect(game.result?.rating).toBe('S');
  });

  it('一列车都没到站得 D 级', () => {
    let game = createNewGame(BASE);
    game = advanceGameToTime(game, at(60));
    expect(game.result?.arrivedCount).toBe(0);
    expect(game.result?.rating).toBe('D');
  });
});

describe('serializeGameView', () => {
  it('输出对外视图并裁剪日志到最近 12 条', () => {
    const game = createNewGame(BASE);
    const view = serializeGameView(game, at(2));
    expect(view.elapsedSeconds).toBe(2);
    expect(view.remainingSeconds).toBe(58);
    expect(view.signal.state).toBe('green');
    expect(view.trains).toHaveLength(3);
    expect(view.logs.length).toBeLessThanOrEqual(12);
  });
});

describe('buildLeaderboardEntry', () => {
  it('未结束的游戏不能生成排行榜条目', () => {
    const game = createNewGame(BASE);
    expect(() => buildLeaderboardEntry(game)).toThrowError();
  });

  it('结束后能生成含评级的条目', () => {
    let game = createNewGame(BASE);
    game = advanceGameToTime(game, at(60));
    const entry = buildLeaderboardEntry(game);
    expect(entry.gameId).toBe(game.id);
    expect(entry.rating).toBe(game.result?.rating);
    expect(entry.finishedAt).toBe(game.finishedAt);
  });
});
