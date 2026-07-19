import { ROUTE_LABELS, STATION_LABELS } from '../constants';
import type { StationId, TrainId, TrainView } from '../types';

type TrainPanelProps = {
  trains: TrainView[];
  dispatchingTrainId: TrainId | null;
  onDispatch: (trainId: TrainId) => void;
};

function getStatusLabel(train: TrainView) {
  if (train.status === 'waiting') {
    return '待发';
  }
  if (train.status === 'in_transit') {
    return `运行中 · 剩余 ${train.secondsToArrival ?? 0} 秒`;
  }
  if (train.status === 'arrived') {
    return '已安全到站';
  }
  return '事故';
}

function getTravelHint(train: TrainView) {
  const current = train.currentStationId;
  const next = train.nextStationId;

  if (!next) {
    return null;
  }

  const from = current ? STATION_LABELS[current] : '当前区间';
  const to = STATION_LABELS[next as StationId];
  const seconds = next === 'central' ? 5 : 4;

  return `${from} → ${to} 需要 ${seconds} 秒`;
}

export default function TrainPanel({ trains, dispatchingTrainId, onDispatch }: TrainPanelProps) {
  return (
    <section className="card train-card">
      <div className="panel-header">
        <h2>列车面板</h2>
        <span>选择合适窗口放行</span>
      </div>
      <div className="train-list">
        {trains.map((train) => (
          <article key={train.id} className="train-row">
            <div>
              <h3>
                {train.id} · {ROUTE_LABELS[train.route]}
              </h3>
              <p>{getStatusLabel(train)}</p>
              <p>
                当前位置：{train.currentStationId ? STATION_LABELS[train.currentStationId] : '区间中'}
                {train.nextStationId ? ` → 下一站 ${STATION_LABELS[train.nextStationId]}` : ''}
              </p>
              {getTravelHint(train) ? <p className="travel-hint">{getTravelHint(train)}</p> : null}
              {train.blockedReason ? <p className="blocked-reason">{train.blockedReason}</p> : null}
            </div>
            <button
              className="primary-button small"
              disabled={!train.canDispatch || dispatchingTrainId === train.id}
              onClick={() => onDispatch(train.id)}
            >
              {dispatchingTrainId === train.id ? '调度中...' : '放行'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
