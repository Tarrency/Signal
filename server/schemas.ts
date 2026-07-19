import { z } from 'zod';

export const createGameSchema = z.object({}).passthrough();

export const gameIdParamSchema = z.object({
  gameId: z.string().min(1),
});

export const dispatchSchema = z.object({
  trainId: z.enum(['T1', 'T2', 'T3']),
});
