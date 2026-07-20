import { useEffect, useMemo, useState } from 'react';
import { createGame, getGame, getLeaderboard, sendPause, sendReroute } from './api';
import { POLL_INTERVAL_MS } from './constants';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';
import StartScreen from './components/StartScreen';
import type { GameView, LeaderboardEntry, TrainId } from './types';

type Screen = 'start' | 'playing' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
        // 暴雨到达后不再自动跳转结果页：保留列车在终点站的状态，
        // 由玩家在顶部模块手动点击「查看结果」。仅停止轮询、预取排行榜。
        if (response.game.status === 'finished') {
          window.clearInterval(timer);
          refreshLeaderboard();
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '刷新状态失败');
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [gameId, screen]);

  // toast 自动消失
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(t);
  }, [toast]);

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

  async function handleReroute(trainId: TrainId, viaNodeId: string, isCurrent: boolean) {
    if (!gameId) return;
    setErrorMessage(null);
    try {
      const response = await sendReroute(gameId, trainId, viaNodeId);
      setGame(response.game);
      // 若点的就是列车当前方向，则没有真正变道，提示保持原路线。
      setToast(isCurrent ? `${trainId} 保持原路线` : `${trainId} 已变更车道`);
      if (response.game.status === 'finished') {
        refreshLeaderboard();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '变道失败');
    }
  }

  async function handlePause() {
    if (!gameId) return;
    setErrorMessage(null);
    try {
      const response = await sendPause(gameId);
      setGame(response.game);
      if (response.game.status === 'finished') {
        refreshLeaderboard();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '暂停失败');
    }
  }

  function handleViewResult() {
    setScreen('result');
    refreshLeaderboard();
  }

  function handleHome() {
    setScreen('start');
    setGameId(null);
    setGame(null);
    setErrorMessage(null);
    setToast(null);
  }

  return (
    <main className="app-shell">
      {screen === 'start' ? (
        <StartScreen onStart={handleStart} loading={loading} />
      ) : null}
      {screen === 'playing' && game ? (
        <GameScreen
          game={game}
          onReroute={handleReroute}
          onPause={handlePause}
          onViewResult={handleViewResult}
          errorMessage={errorMessage}
          toast={toast}
        />
      ) : null}
      {screen === 'result' && result ? (
        <ResultScreen
          result={result}
          leaderboard={leaderboard}
          onRestart={handleStart}
          onHome={handleHome}
        />
      ) : null}
    </main>
  );
}
