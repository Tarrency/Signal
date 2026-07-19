import type { GameResult, LeaderboardEntry } from '../types';

type ResultScreenProps = {
  result: GameResult;
  leaderboard: LeaderboardEntry[];
  onRestart: () => void;
};

export default function ResultScreen({ result, leaderboard, onRestart }: ResultScreenProps) {
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

      <div className="result-leaderboard">
        <p className="eyebrow">历史最佳成绩榜</p>
        {leaderboard.length === 0 ? (
          <p>还没有成绩记录。</p>
        ) : (
          <div className="leaderboard-table">
            <div className="leaderboard-row leaderboard-head">
              <span>排名</span>
              <span>到站</span>
              <span>事故</span>
              <span>用时</span>
              <span>评级</span>
            </div>
            {leaderboard.map((entry, index) => (
              <div key={`${entry.gameId}-${index}`} className="leaderboard-row">
                <span>#{index + 1}</span>
                <span>{entry.arrivedCount}</span>
                <span>{entry.incidentCount}</span>
                <span>{entry.completionTimeSeconds ?? '--'}</span>
                <span>{entry.rating}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="start-actions">
        <button className="primary-button" onClick={onRestart}>
          再来一局
        </button>
      </div>
    </section>
  );
}
