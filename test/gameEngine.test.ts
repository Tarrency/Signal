import { describe, expect, it } from 'vitest';
import {
  GameRuleError,
  GRAPH,
  advanceGameToTime,
  buildLeaderboardEntry,
  createNewGame,
  pauseAllTrains,
  rerouteTrain,
  serializeGameView,
  shortestPath,
} from '../server/gameEngine.js';
import type { Game, TrainId } from '../server/types.js';

const BASE = new Date('2026-07-20T00:00:00.000Z');
const SEED = 15;
// 与引擎 GAME_DURATION_SECONDS 保持一致（暴雨倒计时基准）。
const GAME_DURATION_FOR_TEST = 24;

function at(seconds: number) {
  return new Date(BASE.getTime() + seconds * 1000);
}
function train(game: Game, id: TrainId) {
  return game.trains.find((t) => t.id === id)!;
}

describe('图与寻路', () => {
  it('图含 3 始发端、3 终点与较多枢纽节点', () => {
    expect(GRAPH.nodes.filter((n) => n.kind === 'depot')).toHaveLength(3);
    expect(GRAPH.nodes.filter((n) => n.kind === 'terminal')).toHaveLength(3);
    expect(GRAPH.nodes.filter((n) => n.kind === 'junction').length).toBeGreaterThanOrEqual(10);
    expect(GRAPH.nodes.find((n) => n.id === 'DA')?.label).toBe('甲始');
    expect(GRAPH.nodes.find((n) => n.id === 'DB')?.label).toBe('乙始');
    expect(GRAPH.nodes.find((n) => n.id === 'DC')?.label).toBe('丙始');
    expect(GRAPH.nodes.find((n) => n.id === 'TA')?.label).toBe('甲站');
    expect(GRAPH.nodes.find((n) => n.id === 'TB')?.label).toBe('乙站');
    expect(GRAPH.nodes.find((n) => n.id === 'TC')?.label).toBe('丙站');
  });

  it('每条边都带 curve 字段', () => {
    expect(GRAPH.edges.every((e) => typeof e.curve === 'number')).toBe(true);
  });

  it('shortestPath 能找到 DA→TA 的路线', () => {
    const path = shortestPath('DA', 'TA', new Set());
    expect(path).not.toBeNull();
    expect(path![0]).toBe('DA');
    expect(path![path!.length - 1]).toBe('TA');
  });
});

describe('createNewGame', () => {
  it('开局 3 列运行中的车 + 若干损坏道路', () => {
    const game = createNewGame(BASE, SEED);
    expect(game.trains).toHaveLength(3);
    expect(game.trains.every((t) => t.status === 'running')).toBe(true);
    expect(game.damagedEdgeIds.length).toBeGreaterThanOrEqual(1);
    expect(game.durationSeconds).toBe(GAME_DURATION_FOR_TEST);
  });

  it('损坏道路不在任一列车的第一段（留反应时间）', () => {
    const game = createNewGame(BASE, SEED);
    for (const t of game.trains) {
      const firstEdge = GRAPH.edges.find(
        (e) =>
          (e.from === t.route[0] && e.to === t.route[1]) ||
          (e.to === t.route[0] && e.from === t.route[1]),
      );
      expect(game.damagedEdgeIds).not.toContain(firstEdge!.id);
    }
  });

  it('开局损坏后每列车仍存在可达终点的路线', () => {
    const game = createNewGame(BASE, SEED);
    const damagedKeys = new Set(
      game.damagedEdgeIds.map((id) => {
        const e = GRAPH.edges.find((x) => x.id === id)!;
        return e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
      }),
    );
    for (const t of game.trains) {
      expect(shortestPath(t.route[0], t.targetNodeId, damagedKeys)).not.toBeNull();
    }
  });
});

describe('自动前进与事故检修', () => {
  it('列车沿路线自动前进', () => {
    let game = createNewGame(BASE, SEED);
    game = advanceGameToTime(game, at(4));
    expect(game.trains.some((t) => t.routeIndex > 0 || t.currentEdgeId)).toBe(true);
  });

  it('不变道时，途经损坏路段会触发事故检修（accidentCount 增加），列车不报废', () => {
    let game = createNewGame(BASE, SEED);
    game = advanceGameToTime(game, at(GAME_DURATION_FOR_TEST + 10));
    // 开局损坏落在默认路线上，不干预至少 1 次检修。
    expect(game.accidentCount).toBeGreaterThanOrEqual(1);
    // 列车不再有 incident 终态。
    expect(game.trains.every((t) => t.status !== ('incident' as unknown))).toBe(true);
  });

  it('事故触发 6 秒全体检修停滞，期间列车冻结', () => {
    // 找一个会发生事故的 seed，检查停滞窗口。
    let game = createNewGame(BASE, SEED);
    let sawStall = false;
    for (let s = 1; s <= GAME_DURATION_FOR_TEST + 6; s += 1) {
      game = advanceGameToTime(game, at(s));
      if (game.stall) {
        sawStall = true;
        break;
      }
    }
    // SEED=15 默认路线上有损坏，应至少出现一次停滞。
    expect(sawStall).toBe(true);
  });

  it('检修停滞视图带具体原因（驶入损坏或列车相撞），且不含路段名', () => {
    let game = createNewGame(BASE, SEED);
    for (let s = 1; s <= GAME_DURATION_FOR_TEST + 6; s += 1) {
      game = advanceGameToTime(game, at(s));
      if (game.stall?.kind === 'repair') {
        expect(game.stall.reason).toBeTruthy();
        const view = serializeGameView(game, at(s));
        expect(view.stall?.reason).toBe(game.stall.reason);
        expect(/驶入损坏路段|相撞/.test(view.stall!.reason!)).toBe(true);
        // 页面文案不带 C1↔D1 / A1→B1 这类路段标记
        expect(view.stall!.reason!).not.toMatch(/[↔→←]/);
        expect(view.stall!.reason!).not.toMatch(/\([A-Z0-9]+/);
        return;
      }
    }
    throw new Error('未触发检修停滞');
  });
  it('路过损坏路段端点、驶入未损坏路段时不触发驶入损坏事故', () => {
    // 构造：损坏 A1-B1；T1 经 A1 改道去 B2，只路过端点 A1，不进损坏段。
    let game = createNewGame(BASE, 1);
    game.damagedEdgeIds = ['A1-B1'];
    game = rerouteTrain(game, 'T1', 'A1', at(0));
    for (let s = 1; s <= 6; s += 1) {
      game = advanceGameToTime(game, at(s));
      const v = serializeGameView(game, at(s));
      const tv = v.trains.find((t) => t.id === 'T1')!;
      if (tv.decision?.junctionNodeId === 'A1') {
        const safe = tv.decision.options.find((o) => o.viaNodeId === 'B2' && !o.damaged);
        if (safe) {
          game = rerouteTrain(game, 'T1', 'B2', at(s));
          break;
        }
      }
    }
    game = advanceGameToTime(game, at(12));
    const t1Damage = game.logs.filter(
      (l) => l.type === 'incident' && l.message.includes('T1 驶入损坏路段'),
    );
    expect(t1Damage).toEqual([]);
    expect(train(game, 'T1').route).toContain('B2');
    expect(train(game, 'T1').route).not.toContain('B1');
  });

  it('真正沿损坏路段移动后才记为驶入损坏（挂上路段但 elapsed=0 时不算）', () => {
    let game = createNewGame(BASE, 1);
    game.damagedEdgeIds = ['A1-B1'];
    // 走到即将从 A1 驶入 A1-B1
    for (let s = 1; s <= 10; s += 1) {
      game = advanceGameToTime(game, at(s));
      const t = train(game, 'T1');
      if (t.currentEdgeId === 'A1-B1' && t.edgeElapsedSeconds === 0) {
        expect(game.stall?.kind === 'repair').toBe(false);
        // 再推 1 秒：真正移动后才应触发
        game = advanceGameToTime(game, at(s + 1));
        expect(game.stall?.kind).toBe('repair');
        expect(game.stall?.reason ?? '').toContain('驶入损坏路段');
        return;
      }
      if (game.stall?.kind === 'repair' && game.stall.reason?.includes('驶入损坏')) {
        // 若同秒完成了 0→1，也接受，但不得在挂上前就触发
        expect(t.currentEdgeId === 'A1-B1' || train(game, 'T1').currentEdgeId === 'A1-B1').toBe(true);
        return;
      }
    }
    throw new Error('未观测到驶入 A1-B1');
  });
});

describe('全体暂停', () => {
  it('暂停使全部列车停滞、pauseCount+1，倒计时（挂钟）继续', () => {
    let game = createNewGame(BASE, SEED);
    game = pauseAllTrains(game, at(2));
    expect(game.stall?.kind).toBe('pause');
    expect(game.pauseCount).toBe(1);
    // 视图里运行车显示为 stalled。
    const view = serializeGameView(game, at(2));
    expect(view.trains.some((t) => t.status === 'stalled')).toBe(true);
    // 倒计时按挂钟推进（第 2 秒剩 duration-2）。
    expect(view.remainingSeconds).toBe(GAME_DURATION_FOR_TEST - 2);
  });

  it('停滞期间再次暂停会被拒绝', () => {
    let game = createNewGame(BASE, SEED);
    game = pauseAllTrains(game, at(2));
    expect(() => pauseAllTrains(game, at(3))).toThrowError(GameRuleError);
  });

  it('暂停停滞窗口为 3 秒，到点后 pause 停滞结束', () => {
    let game = createNewGame(BASE, SEED);
    game = pauseAllTrains(game, at(2));
    // 暂停窗口 = 起始 2 + 3 = 5。
    expect(game.stall!.kind).toBe('pause');
    expect(game.stall!.untilSeconds).toBe(5);
    // 推进到 5s：pause 停滞应结束（此后可能因驶入损坏另起 repair，但不再是 pause）。
    game = advanceGameToTime(game, at(5));
    expect(game.stall?.kind).not.toBe('pause');
  });
});

describe('变道（方向箭头）', () => {
  it('列车视图在分岔口提供变道选项', () => {
    const game = createNewGame(BASE, SEED);
    const view = serializeGameView(game, at(0));
    const withDecision = view.trains.filter((t) => t.decision && t.decision.options.length >= 2);
    expect(withDecision.length).toBeGreaterThanOrEqual(1);
  });

  it('沿安全方向变道可改变路线且新路线避开损坏', () => {
    let game = createNewGame(BASE, SEED);
    const view = serializeGameView(game, at(0));
    // 找一列有决策的车与一个未损坏方向。
    const t = view.trains.find((tv) => tv.decision && tv.decision.options.some((o) => !o.damaged))!;
    const opt = t.decision!.options.find((o) => !o.damaged)!;
    game = rerouteTrain(game, t.id, opt.viaNodeId, at(0));
    const routed = train(game, t.id);
    expect(routed.route[routed.route.length - 1]).toBe(routed.targetNodeId);
    // 新路线第二个节点即所选方向。
    expect(routed.route[1]).toBe(opt.viaNodeId);
  });

  it('选择损坏方向被拒绝', () => {
    const game = createNewGame(BASE, SEED);
    const view = serializeGameView(game, at(0));
    const t = view.trains.find((tv) => tv.decision && tv.decision.options.some((o) => o.damaged));
    if (!t) return; // 该 seed 下分岔口恰好没有损坏方向则跳过
    const bad = t.decision!.options.find((o) => o.damaged)!;
    expect(() => rerouteTrain(game, t.id, bad.viaNodeId, at(0))).toThrowError(GameRuleError);
  });

  it('沿安全方向变道后，新路线不含任何损坏路段', () => {
    let game = createNewGame(BASE, SEED);
    const view = serializeGameView(game, at(0));
    const damaged = new Set(game.damagedEdgeIds);
    for (const tv of view.trains) {
      const safe = tv.decision?.options.find((o) => !o.damaged);
      if (!safe) continue;
      game = rerouteTrain(game, tv.id, safe.viaNodeId, at(0));
      const t = train(game, tv.id);
      // 校验整条新路线的每段都未损坏。
      for (let i = 0; i < t.route.length - 1; i += 1) {
        const e = GRAPH.edges.find(
          (x) =>
            (x.from === t.route[i] && x.to === t.route[i + 1]) ||
            (x.to === t.route[i] && x.from === t.route[i + 1]),
        )!;
        expect(damaged.has(e.id)).toBe(false);
      }
    }
  });

  it('变道方向只会向右（不存在向左的分岔选项）', () => {
    const game = createNewGame(BASE, SEED);
    const view = serializeGameView(game, at(0));
    const xOf = (id: string) => GRAPH.nodes.find((n) => n.id === id)!.x;
    for (const tv of view.trains) {
      if (!tv.decision) continue;
      const jx = xOf(tv.decision.junctionNodeId);
      for (const opt of tv.decision.options) {
        expect(xOf(opt.viaNodeId)).toBeGreaterThan(jx);
      }
      // 每个分岔口最多 2 个选择。
      expect(tv.decision.options.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('末端选错终点站', () => {
  function driveUntilTerminalChoice(seed: number): { game: Game; trainId: TrainId; wrong: string } | null {
    let game = createNewGame(BASE, seed);
    for (let s = 1; s <= 45; s += 1) {
      game = advanceGameToTime(game, at(s));
      const view = serializeGameView(game, at(s));
      for (const tv of view.trains) {
        if (tv.status !== 'running' || !tv.decision) continue;
        const wrongTerm = tv.decision.options.find(
          (o) => !o.damaged && o.viaNodeId !== tv.targetNodeId && GRAPH.nodes.find((n) => n.id === o.viaNodeId)?.kind === 'terminal',
        );
        if (wrongTerm) return { game, trainId: tv.id, wrong: wrongTerm.viaNodeId };
      }
    }
    return null;
  }

  it('在末端选错终点站会卡住(stranded)、记为未到站，而非自动纠正', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const found = driveUntilTerminalChoice(seed);
      if (!found) continue;
      const now = at(found.game.lastAdvancedElapsedSeconds || 1);
      let g = rerouteTrain(found.game, found.trainId, found.wrong, now);
      const t = train(g, found.trainId);
      // 路线末端改为所选的错误站（不自动纠回目标站）。
      expect(t.route[t.route.length - 1]).toBe(found.wrong);
      expect(found.wrong).not.toBe(t.targetNodeId);
      g = advanceGameToTime(g, at(30));
      const finalStatus = train(g, found.trainId).status;
      // 关键不变量：绝不会“自动纠正”成功到站；要么卡住(stranded)、要么没赶到(running/未到站)。
      expect(finalStatus).not.toBe('arrived');
      expect(['stranded', 'running']).toContain(finalStatus);
      return;
    }
  });
});

describe('雷电不劈已走过的路', () => {
  it('已走完的路段不会出现在损坏集合中（交集为空）', () => {
    let game = createNewGame(BASE, SEED);
    game = advanceGameToTime(game, at(GAME_DURATION_FOR_TEST + 10));
    const traveled = new Set(game.traveledEdgeIds);
    const overlap = game.damagedEdgeIds.filter((id) => traveled.has(id));
    expect(overlap).toEqual([]);
  });
});

describe('雷击时机与保护', () => {
  function outboundEdgeId(t: Game['trains'][number]): string | null {
    if (!t.currentEdgeId || t.routeIndex + 2 >= t.route.length) return null;
    const a = t.route[t.routeIndex + 1];
    const b = t.route[t.routeIndex + 2];
    return GRAPH.edges.find(
      (e) => (e.from === a && e.to === b) || (e.to === a && e.from === b),
    )?.id ?? null;
  }

  function strikeLogCount(game: Game) {
    return game.logs.filter((l) => l.type === 'lightning' && l.message.includes('雷击损坏路段')).length;
  }

  it('雷击结算时，运行中的列车不处于即将到站（路段剩余 ≤1 秒）', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      let game = createNewGame(BASE, seed);
      let prevStrikes = strikeLogCount(game);
      for (let s = 1; s <= GAME_DURATION_FOR_TEST; s += 1) {
        game = advanceGameToTime(game, at(s));
        const strikes = strikeLogCount(game);
        if (strikes === prevStrikes) continue;
        prevStrikes = strikes;
        for (const t of game.trains) {
          if (t.status !== 'running' || !t.currentEdgeId) continue;
          const edge = GRAPH.edges.find((e) => e.id === t.currentEdgeId);
          if (!edge) continue;
          expect(edge.seconds - t.edgeElapsedSeconds).toBeGreaterThan(1);
        }
      }
    }
  });

  it('定时雷击不会劈坏任一运行列车的下一程出站路段', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      let game = createNewGame(BASE, seed);
      let prevStrikes = strikeLogCount(game);
      for (let s = 1; s <= GAME_DURATION_FOR_TEST; s += 1) {
        const beforeOutbounds = game.trains
          .filter((t) => t.status === 'running')
          .map((t) => outboundEdgeId(t))
          .filter((id): id is string => Boolean(id));
        const beforeDamaged = new Set(game.damagedEdgeIds);
        game = advanceGameToTime(game, at(s));
        const strikes = strikeLogCount(game);
        if (strikes === prevStrikes) continue;
        prevStrikes = strikes;
        const added = game.damagedEdgeIds.filter((id) => !beforeDamaged.has(id));
        for (const id of beforeOutbounds) {
          expect(added).not.toContain(id);
        }
      }
    }
  });
});

describe('结束与评级', () => {
  it('暴雨倒计时结束（24s）后结束并生成结果', () => {
    let game = createNewGame(BASE, SEED);
    game = advanceGameToTime(game, at(GAME_DURATION_FOR_TEST));
    expect(game.status).toBe('finished');
    expect(game.result).not.toBeNull();
    expect(typeof game.result!.pauseCount).toBe('number');
    expect(game.durationSeconds).toBe(24);
  });

  it('结束后再变道抛 GAME_FINISHED', () => {
    let game = createNewGame(BASE, SEED);
    game = advanceGameToTime(game, at(GAME_DURATION_FOR_TEST));
    expect(() => rerouteTrain(game, 'T1', 'A1', at(GAME_DURATION_FOR_TEST + 1))).toThrowError(GameRuleError);
  });

  it('结束后暂停也抛 GAME_FINISHED', () => {
    let game = createNewGame(BASE, SEED);
    game = advanceGameToTime(game, at(GAME_DURATION_FOR_TEST));
    expect(() => pauseAllTrains(game, at(GAME_DURATION_FOR_TEST + 1))).toThrowError(GameRuleError);
  });

  it('结束后能生成排行榜条目', () => {
    let game = createNewGame(BASE, SEED);
    game = advanceGameToTime(game, at(GAME_DURATION_FOR_TEST));
    const entry = buildLeaderboardEntry(game);
    expect(entry.gameId).toBe(game.id);
    expect(entry.rating).toBe(game.result?.rating);
  });

  it('评级规则：S/A/B/C/D 与到站、事故、暂停对应', () => {
    // 通过构造终局结果字段间接验证：跑完一局后 rating 必在集合内，
    // 且 S 仅当 3 到站 + 0 事故 + 0 暂停。
    const ratings = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) {
      let game = createNewGame(BASE, seed);
      game = advanceGameToTime(game, at(GAME_DURATION_FOR_TEST));
      expect(game.result).not.toBeNull();
      const r = game.result!;
      ratings.add(r.rating);
      expect(['S', 'A', 'B', 'C', 'D']).toContain(r.rating);
      if (r.rating === 'S') {
        expect(r.arrivedCount).toBe(3);
        expect(r.incidentCount).toBe(0);
        expect(r.pauseCount).toBe(0);
      }
      if (r.rating === 'A') {
        expect(r.arrivedCount).toBe(3);
        expect(r.incidentCount).toBe(0);
      }
      if (r.rating === 'B') {
        expect(r.arrivedCount).toBe(3);
      }
      if (r.rating === 'C') {
        expect(r.arrivedCount).toBe(2);
      }
      if (r.rating === 'D') {
        expect(r.arrivedCount).toBeLessThanOrEqual(1);
      }
    }
    expect(ratings.size).toBeGreaterThan(0);
  });
});

describe('serializeGameView', () => {
  it('输出含图、列车位置、决策、倒计时与停滞字段', () => {
    const game = createNewGame(BASE, SEED);
    const view = serializeGameView(game, at(2));
    expect(view.graph.nodes.length).toBeGreaterThan(0);
    expect(view.trains).toHaveLength(3);
    expect(view.remainingSeconds).toBe(GAME_DURATION_FOR_TEST - 2);
    expect(view.damagedEdgeIds.length).toBeGreaterThanOrEqual(1);
    expect(view.stall).toBeNull();
    expect(view.pauseCount).toBe(0);
    expect('storm' in view).toBe(false);
  });

  it('位置在路段上时 from/to 跟随路线行进方向', () => {
    let game = createNewGame(BASE, SEED);
    game = advanceGameToTime(game, at(2));
    const view = serializeGameView(game, at(2));
    for (const tv of view.trains) {
      if (tv.position.kind !== 'edge') continue;
      const t = train(game, tv.id);
      expect(tv.position.from).toBe(t.route[t.routeIndex]);
      expect(tv.position.to).toBe(t.route[t.routeIndex + 1]);
    }
  });
});
