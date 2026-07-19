import express from 'express';
import type { Request, Response } from 'express';
import {
  buildLeaderboardEntry,
  createNewGame,
  dispatchTrain,
  GameRuleError,
  serializeGameView,
  advanceGameToTime,
} from './gameEngine.js';
import { dispatchSchema, gameIdParamSchema } from './schemas.js';
import { appendLeaderboard, getGame, listLeaderboard, saveGame } from './storage.js';

const leaderboardRecorded = new Set<string>();

function sendError(response: Response, code: string, message: string, status = 400) {
  response.status(status).json({
    error: { code, message },
  });
}

function persistFinishedGame(game: ReturnType<typeof advanceGameToTime>) {
  saveGame(game);
  if (game.status === 'finished' && !leaderboardRecorded.has(game.id)) {
    appendLeaderboard(buildLeaderboardEntry(game));
    leaderboardRecorded.add(game.id);
  }
}

export function createRouter() {
  const router = express.Router();

  router.post('/games', (_request: Request, response: Response) => {
    const now = new Date();
    const game = createNewGame(now);
    saveGame(game);
    response.status(201).json({
      game: serializeGameView(game, now),
    });
  });

  router.get('/games/:gameId', (request: Request, response: Response) => {
    const params = gameIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendError(response, 'INVALID_PAYLOAD', 'gameId is required');
    }

    const game = getGame(params.data.gameId);
    if (!game) {
      return sendError(response, 'GAME_NOT_FOUND', `Game ${params.data.gameId} not found`, 404);
    }

    const now = new Date();
    const advancedGame = advanceGameToTime(game, now);
    persistFinishedGame(advancedGame);

    response.json({
      game: serializeGameView(advancedGame, now),
    });
  });

  router.post('/games/:gameId/dispatch', (request: Request, response: Response) => {
    const params = gameIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendError(response, 'INVALID_PAYLOAD', 'gameId is required');
    }

    const payload = dispatchSchema.safeParse(request.body);
    if (!payload.success) {
      return sendError(response, 'INVALID_PAYLOAD', 'trainId must be one of T1, T2, T3');
    }

    const game = getGame(params.data.gameId);
    if (!game) {
      return sendError(response, 'GAME_NOT_FOUND', `Game ${params.data.gameId} not found`, 404);
    }

    const now = new Date();

    try {
      const updatedGame = dispatchTrain(game, payload.data.trainId, now);
      persistFinishedGame(updatedGame);
      response.json({
        ok: true,
        game: serializeGameView(updatedGame, now),
      });
    } catch (error) {
      if (error instanceof GameRuleError) {
        const status = error.code === 'GAME_FINISHED' ? 409 : 400;
        return sendError(response, error.code, error.message, status);
      }
      return sendError(response, 'INVALID_PAYLOAD', 'Unexpected server error', 500);
    }
  });

  router.get('/leaderboard', (_request: Request, response: Response) => {
    response.json({
      items: listLeaderboard(),
    });
  });

  return router;
}
