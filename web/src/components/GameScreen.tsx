import type { GameView, TrainId } from '../types';
import LogPanel from './LogPanel';
import MapView from './MapView';
import SignalPanel from './SignalPanel';
import TrainPanel from './TrainPanel';

type GameScreenProps = {
  game: GameView;
  dispatchingTrainId: TrainId | null;
  onDispatch: (trainId: TrainId) => void;
  errorMessage: string | null;
};

export default function GameScreen({ game, dispatchingTrainId, onDispatch, errorMessage }: GameScreenProps) {
  return (
    <section className="screen game-screen">
      <div className="hero card">
        <div>
          <p className="eyebrow">末班车实时调度中</p>
          <h1>倒计时 {game.remainingSeconds}s</h1>
          <p>
            已安全到站 {game.summary.arrivedCount} 列 · 事故 {game.summary.incidentCount} 列 · 未完成 {game.summary.unfinishedCount} 列
          </p>
        </div>
        <div className="timer-ring">
          <span>{game.remainingSeconds}</span>
        </div>
      </div>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      <div className="game-grid">
        <div className="left-column">
          <MapView game={game} />
          <TrainPanel trains={game.trains} dispatchingTrainId={dispatchingTrainId} onDispatch={onDispatch} />
        </div>
        <div className="right-column">
          <SignalPanel game={game} />
          <LogPanel game={game} />
        </div>
      </div>
    </section>
  );
}
