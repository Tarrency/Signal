import type { GameView } from '../types';

export default function SignalPanel({ game }: { game: GameView }) {
  return (
    <section className="card status-card">
      <h2>中央信号</h2>
      <div className={`signal-state ${game.signal.state}`}>
        {game.signal.state === 'green' ? '绿灯可进站' : '红灯封锁中'}
      </div>
      <p>距离下一次切换还有 {game.signal.secondsUntilSwitch} 秒</p>
    </section>
  );
}
