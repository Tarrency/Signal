import type { GameView } from '../types';

export default function LogPanel({ game }: { game: GameView }) {
  return (
    <section className="card log-card">
      <h2>调度日志</h2>
      <div className="log-list">
        {game.logs.length === 0
          ? <p>暂无日志。</p>
          : game.logs.slice().reverse().map((log: GameView['logs'][number]) => <p key={log.id}>{log.message}</p>)}
      </div>
    </section>
  );
}
