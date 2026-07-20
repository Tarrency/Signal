import type { GameView, TrainId } from '../types';
import MapView from './MapView';

type GameScreenProps = {
  game: GameView;
  onReroute: (trainId: TrainId, viaNodeId: string, isCurrent: boolean) => void;
  onPause: () => void;
  onViewResult: () => void;
  errorMessage: string | null;
  toast: string | null;
};

export default function GameScreen({ game, onReroute, onPause, onViewResult, errorMessage, toast }: GameScreenProps) {
  const finished = game.status === 'finished';
  const danger = !finished && game.remainingSeconds <= 10;
  const stalled = game.stall !== null;
  const repairing = game.stall?.kind === 'repair';
  // 结束态雨幕：固定若干雨丝，随机水平位置/时长/延迟。
  const raindrops = Array.from({ length: 28 });

  return (
    <section className="screen game-screen minimal">
      <div
        className={`hero card compact-hero ${finished ? 'finished-hero' : ''} ${danger ? 'danger-hero' : ''}`}
      >
        {finished ? (
          <div className="rain-overlay" aria-hidden="true">
            {raindrops.map((_, i) => (
              <span
                key={i}
                className="raindrop"
                style={{
                  left: `${(i * 3.6 + ((i * 37) % 5)) % 100}%`,
                  animationDuration: `${0.6 + ((i * 13) % 7) * 0.1}s`,
                  animationDelay: `${((i * 29) % 15) * 0.1}s`,
                }}
              />
            ))}
          </div>
        ) : null}
        <div className="hero-main">
          <p className="eyebrow">暴雨调度进行中</p>
          <h1>
            {finished ? <span className="finish-pause-icon">⏸ </span> : null}
            暴雨倒计时 {finished ? 0 : game.remainingSeconds}s
          </h1>
          <p>
            已到站 {game.summary.arrivedCount} · 事故 {game.summary.incidentCount} · 暂停 {game.pauseCount} ·{' '}
            {finished ? '未到站' : '在途'} {game.summary.unfinishedCount}
          </p>
        </div>

        {finished ? (
          <button className="primary-button hero-result-button" onClick={onViewResult}>
            查看结果 →
          </button>
        ) : (
          <div className={`timer-ring ${danger ? 'danger' : ''}`}>
            <span>{game.remainingSeconds}</span>
          </div>
        )}
      </div>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      <div className="card map-card full-map">
        {toast ? <div className="reroute-toast">✓ {toast}</div> : null}

        {/* 停滞横幅：暂停 / 事故检修 */}
        {stalled ? (
          <div className={`stall-banner ${repairing ? 'repair' : 'pause'}`}>
            {repairing
              ? `⚠ ${game.stall!.reason ?? '事故检修中'} · 全体检修 ${game.stall!.secondsLeft}s（倒计时继续）`
              : `⏸ 全体暂停 · 列车停滞 ${game.stall!.secondsLeft}s（倒计时继续）`}
          </div>
        ) : null}

        {/* 地图内暂停按钮 */}
        <button
          className="map-pause-button"
          onClick={onPause}
          disabled={finished || stalled}
          title="所有列车停滞 3 秒（倒计时继续）"
        >
          ⏸ 全体暂停
        </button>

        <MapView game={game} onReroute={onReroute} />
      </div>
    </section>
  );
}
