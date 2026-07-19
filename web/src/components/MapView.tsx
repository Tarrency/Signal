import { STATION_LABELS } from '../constants';
import type { GameView, StationId, TrainView } from '../types';

type SlotKey = 'west_park' | 'track_to_central_blue' | 'central' | 'track_to_terminal_blue' | 'east_harbor' | 'south_bridge' | 'track_to_central_orange' | 'track_to_terminal_orange' | 'north_dock';

function getTrainSlot(train: TrainView): SlotKey {
  if (train.route === 'blue') {
    if (train.status === 'in_transit') {
      return train.nextStationId === 'central' ? 'track_to_central_blue' : 'track_to_terminal_blue';
    }
    if (train.currentStationId === 'central') {
      return 'central';
    }
    if (train.currentStationId === 'east_harbor' || train.status === 'arrived') {
      return 'east_harbor';
    }
    return 'west_park';
  }

  if (train.status === 'in_transit') {
    return train.nextStationId === 'central' ? 'track_to_central_orange' : 'track_to_terminal_orange';
  }
  if (train.currentStationId === 'central') {
    return 'central';
  }
  if (train.currentStationId === 'north_dock' || train.status === 'arrived') {
    return 'north_dock';
  }
  return 'south_bridge';
}

function renderTrain(train: TrainView) {
  return (
    <span key={train.id} className={`train-pill train-${train.status}`}>
      {train.id}
      {train.status === 'in_transit' && train.secondsToArrival !== null ? ` · ${train.secondsToArrival}s` : ''}
    </span>
  );
}

function getSlotTrains(trains: TrainView[], slot: SlotKey) {
  return trains.filter((train) => getTrainSlot(train) === slot);
}

function renderSlot(trains: TrainView[], slot: SlotKey, label?: string) {
  return (
    <div className={`map-slot ${label ? 'track-slot' : 'station-slot'}`}>
      {label ? <span className="track-label">{label}</span> : null}
      <div className="slot-trains">{getSlotTrains(trains, slot).map(renderTrain)}</div>
    </div>
  );
}

export default function MapView({ game }: { game: GameView }) {
  const blueTrains = game.trains.filter((train: TrainView) => train.route === 'blue');
  const orangeTrains = game.trains.filter((train: TrainView) => train.route === 'orange');
  const centralTrains = getSlotTrains(game.trains, 'central');

  return (
    <section className="card map-card">
      <div className="panel-header">
        <h2>站点地图</h2>
        <span>{game.playerName}</span>
      </div>
      <div className="map-grid upgraded-map shared-map">
        <div className="line-title blue-title">蓝线</div>
        <div className="line-row shared-line-row">
          <div className="station">{STATION_LABELS.west_park}</div>
          {renderSlot(blueTrains, 'west_park')}
          <div className="track" />
          {renderSlot(blueTrains, 'track_to_central_blue', '5 秒')}
          <div className="central-gap" />
          {renderSlot(blueTrains, 'track_to_terminal_blue', '4 秒')}
          <div className="track" />
          <div className="station">{STATION_LABELS.east_harbor}</div>
          {renderSlot(blueTrains, 'east_harbor')}
        </div>

        <div className="line-title orange-title">橙线</div>
        <div className="line-row shared-line-row">
          <div className="station">{STATION_LABELS.south_bridge}</div>
          {renderSlot(orangeTrains, 'south_bridge')}
          <div className="track orange-track" />
          {renderSlot(orangeTrains, 'track_to_central_orange', '5 秒')}
          <div className="central-gap" />
          {renderSlot(orangeTrains, 'track_to_terminal_orange', '4 秒')}
          <div className="track orange-track" />
          <div className="station">{STATION_LABELS.north_dock}</div>
          {renderSlot(orangeTrains, 'north_dock')}
        </div>

        <div className="central-hub">
          <div className="station central-station">{STATION_LABELS.central}</div>
          <div className="map-slot station-slot central-slot">
            <div className="slot-trains">{centralTrains.map(renderTrain)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
