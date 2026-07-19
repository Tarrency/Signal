import type { LeaderboardEntry } from '../types';

type StartScreenProps = {
  leaderboard: LeaderboardEntry[];
  onStart: () => void;
  loading: boolean;
};

export default function StartScreen({ leaderboard, onStart, loading }: StartScreenProps) {
  return (
    <section className="screen card start-screen">
      <div>
        <p className="eyebrow">雨夜末班调度模拟</p>
        <h1>末班信号站</h1>
        <p className="lede">
          你只有 60 秒。把 3 列末班车穿过中央信号站，尽可能安全送到终点。
        </p>
        <ul className="rules-list">
          <li>中央信号站只在绿灯时允许进站。</li>
          <li>西园站和南桥站进中央需 5 秒，中央出发到终点需 4 秒。</li>
          <li>发车后若赶不上绿灯窗口，列车会在区间内发生事故。</li>
        </ul>
      </div>
      <div className="start-actions">
        <button className="primary-button" onClick={onStart} disabled={loading}>
          {loading ? '正在建立调度台...' : '开始调度'}
        </button>
      </div>
      <div className="hint-box">
        <strong>当前最佳记录</strong>
        {leaderboard.length === 0 ? <p>还没有历史成绩，准备创造第一条记录。</p> : <p>最佳评级：{leaderboard[0].rating}，安全到站 {leaderboard[0].arrivedCount} 列。</p>}
      </div>
    </section>
  );
}
