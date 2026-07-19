import type { LeaderboardEntry } from '../types';

type LeaderboardScreenProps = {
  entries: LeaderboardEntry[];
  onBack: () => void;
};

export default function LeaderboardScreen({ entries, onBack }: LeaderboardScreenProps) {
  return (
    <section className="screen card leaderboard-screen">
      <div className="panel-header">
        <div>
          <p className="eyebrow">历史最佳成绩榜</p>
          <h1>最佳成绩榜</h1>
        </div>
        <button className="secondary-button" onClick={onBack}>
          返回
        </button>
      </div>
      {entries.length === 0 ? (
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
          {entries.map((entry, index) => (
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
    </section>
  );
}
