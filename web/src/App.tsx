import { useEffect, useMemo, useState } from 'react';
import { createGame, dispatchTrain, getGame, getLeaderboard } from './api';
import { POLL_INTERVAL_MS } from './constants';
import GameScreen from './components/GameScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import ResultScreen from './components/ResultScreen';
import StartScreen from './components/StartScreen';
import type { GameView, LeaderboardEntry, TrainId } from './types';

type Screen = 'start' | 'playing' | 'result' | 'leaderboard';

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dispatchingTrainId, setDispatchingTrainId] = useState<TrainId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshLeaderboard() {
    try {
      const response = await getLeaderboard();
      setLeaderboard(response.items);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    refreshLeaderboard();
  }, []);

  useEffect(() => {
    if (screen !== 'playing' || !gameId) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await getGame(gameId);
        setGame(response.game);
        if (response.game.status === 'finished') {
          setScreen('result');
          refreshLeaderboard();
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '刷新状态失败');
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [gameId, screen]);

  const result = useMemo(() => game?.result ?? null, [game]);

  async function handleStart() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await createGame();
      setGame(response.game);
      setGameId(response.game.id);
      setScreen('playing');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '创建游戏失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleDispatch(trainId: TrainId) {
    if (!gameId) {
      return;
    }

    setDispatchingTrainId(trainId);
    setErrorMessage(null);
    try {
      const response = await dispatchTrain(gameId, trainId);
      setGame(response.game);
      if (response.game.status === 'finished') {
        setScreen('result');
        refreshLeaderboard();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '调度失败');
    } finally {
      setDispatchingTrainId(null);
    }
  }

  function handleViewLeaderboard() {
    refreshLeaderboard();
    setScreen('leaderboard');
  }

  function handleBackFromLeaderboard() {
    setScreen(game?.status === 'finished' ? 'result' : 'start');
  }

  return (
    <main className="app-shell">
      {screen === 'start' ? (
        <StartScreen leaderboard={leaderboard} onStart={handleStart} onViewLeaderboard={handleViewLeaderboard} loading={loading} />
      ) : null}
      {screen === 'playing' && game ? (
        <GameScreen game={game} dispatchingTrainId={dispatchingTrainId} onDispatch={handleDispatch} errorMessage={errorMessage} />
      ) : null}
      {screen === 'result' && result ? (
        <ResultScreen result={result} onRestart={handleStart} onViewLeaderboard={handleViewLeaderboard} />
      ) : null}
      {screen === 'leaderboard' ? <LeaderboardScreen entries={leaderboard} onBack={handleBackFromLeaderboard} /> : null}
    </main>
  );
}
