import { z } from 'zod';

export const createGameSchema = z.object({}).passthrough();

export const gameIdParamSchema = z.object({
  gameId: z.string().min(1),
});

// 调度动作：变道（在分岔口选择驶向某个相邻节点）
// junctionNodeId：客户端点击箭头时该箭头所属的分岔口，用于识别"列车已驶过"的过期点击。
export const rerouteSchema = z.object({
  trainId: z.enum(['T1', 'T2', 'T3']),
  viaNodeId: z.string().min(1),
  junctionNodeId: z.string().min(1).optional(),
});
