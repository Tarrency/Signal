import type { GameResult, LeaderboardEntry, Rating } from '../types';

type ResultScreenProps = {
  result: GameResult;
  leaderboard: LeaderboardEntry[];
  onRestart: () => void;
  onHome: () => void;
};

// 按评级给一句带情绪的解说，呼应"暴雨末班调度"的主题。
const RATING_FLAVOR: Record<Rating, { emoji: string; title: string; line: string }> = {
  S: { emoji: '🌟', title: '完美调度！', line: '暴雨落下时，三列车全部安然回站，一次事故都没有。这座城市今晚欠你一杯热咖啡。' },
  A: { emoji: '🎉', title: '漂亮收尾！', line: '三车全部安全到站，零事故——末班车调度员的教科书操作。' },
  B: { emoji: '👍', title: '稳稳过关', line: '三列车都赶在暴雨前回站了，虽然路上有点波折，但结果最重要。' },
  C: { emoji: '🌧', title: '有惊无险', line: '救回了大部分列车。再顺一顺变道时机，下次能做得更好。' },
  D: { emoji: '☔', title: '暴雨无情', line: '这局有点狼狈——别灰心，看清红色路段、早点变道，翻盘就在下一局。' },
};

export default function ResultScreen({ result, leaderboard, onRestart, onHome }: ResultScreenProps) {
  const flavor = RATING_FLAVOR[result.rating];
  return (
    <section className="screen result-screen">
      {/* 顶部模块：评级与操作按钮并排，下方为指标 */}
      <div className="card result-hero">
        <p className="eyebrow">本局已结束 · 暴雨已到达</p>
        <div className="result-rating-row">
          <h1>
            {flavor.emoji} 评级 {result.rating}
          </h1>
          <div className="result-actions">
            <button className="secondary-button" onClick={onHome}>
              返回首页
            </button>
            <button className="primary-button" onClick={onRestart}>
              再来一局
            </button>
          </div>
        </div>
        <p className="result-flavor">
          <strong>{flavor.title}</strong> {flavor.line}
        </p>
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
            <strong>{result.pauseCount}</strong>
            <span>暂停</span>
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
      </div>

      {/* 历史最佳成绩榜：定高可滚动 */}
      <div className="card result-leaderboard">
        <p className="eyebrow">历史最佳成绩榜</p>
        {leaderboard.length === 0 ? (
          <p className="muted">还没有成绩记录。</p>
        ) : (
          <div className="leaderboard-table scrollable">
            <div className="leaderboard-row leaderboard-head">
              <span>排名</span>
              <span>到站</span>
              <span>事故</span>
              <span>用时</span>
              <span>评级</span>
            </div>
            <div className="leaderboard-body">
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
          </div>
        )}
      </div>
    </section>
  );
}
