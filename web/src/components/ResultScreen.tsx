import type { GameResult } from '../types';

type ResultScreenProps = {
  result: GameResult;
  onRestart: () => void;
  onViewLeaderboard: () => void;
};

export default function ResultScreen({ result, onRestart, onViewLeaderboard }: ResultScreenProps) {
  return (
    <section className="screen card result-screen">
      <p className="eyebrow">本局已结束</p>
      <h1>评级 {result.rating}</h1>
      <div className="result-grid">
        <div>
          <strong>{result.arrivedCount}</strong>
          <span>安全到站</span>
        </div>
        <div>
          <strong>{result.incidentCount}</strong>
          <span>事故</span>
        </div>
        <div>
          <strong>{result.unfinishedCount}</strong>
          <span>未到站</span>
        </div>
        <div>
          <strong>{result.completionTimeSeconds ?? '--'}</strong>
          <span>完成用时</span>
        </div>
      </div>
      <div className="start-actions">
        <button className="primary-button" onClick={onRestart}>
          再来一局
        </button>
        <button className="secondary-button" onClick={onViewLeaderboard}>
          查看最佳成绩榜
        </button>
      </div>
    </section>
  );
}
