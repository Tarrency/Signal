import { useState } from 'react';
import { TRAIN_COLORS } from '../constants';
import {
  edgeGeometry,
  edgePathD,
  nodePoint,
  pointOnEdge,
  quadTangent,
  H,
  W,
} from '../geometry';
import type { GameView, MapEdge, MapNode, TrainId, TrainView } from '../types';

type HoverPreview = { trainId: TrainId; route: string[] } | null;

type MapViewProps = {
  game: GameView;
  onReroute: (trainId: TrainId, viaNodeId: string, isCurrent: boolean) => void;
};

// 把一条路线（节点序列）渲染成一条连贯的曲线 path（逐段拼接）。
function routePathD(route: string[], nodeById: Map<string, MapNode>, edgeByKey: Map<string, MapEdge>): string {
  const parts: string[] = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const edge = edgeByKey.get(a < b ? `${a}|${b}` : `${b}|${a}`);
    if (!edge) continue;
    const geo = edgeGeometry(edge, nodeById);
    if (!geo) continue;
    // 依据行进方向决定起点。
    const startPt = edge.from === a ? geo.a : geo.b;
    const endPt = edge.from === a ? geo.b : geo.a;
    parts.push(`M ${startPt.x} ${startPt.y} Q ${geo.c.x} ${geo.c.y} ${endPt.x} ${endPt.y}`);
  }
  return parts.join(' ');
}

/** 只取当前位置起的剩余路线，避免已走完路段残留错误颜色。 */
function remainingRoute(train: TrainView): string[] {
  const { route, position } = train;
  if (route.length === 0) return route;
  if (position.kind === 'node') {
    const idx = route.indexOf(position.nodeId);
    return idx >= 0 ? route.slice(idx) : route;
  }
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    if ((a === position.from && b === position.to) || (a === position.to && b === position.from)) {
      return route.slice(i);
    }
  }
  if (train.nextNodeId) {
    const idx = route.indexOf(train.nextNodeId);
    if (idx > 0) return route.slice(idx - 1);
    if (idx === 0) return route;
  }
  return route;
}

export default function MapView({ game, onReroute }: MapViewProps) {
  const { graph } = game;
  const [hover, setHover] = useState<HoverPreview>(null);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const edgeByKey = new Map(
    graph.edges.map((e) => [e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`, e]),
  );
  const damaged = new Set(game.damagedEdgeIds);
  const activeByEdge = new Map(game.activeEdges.map((a) => [a.edgeId, a.trainIds]));
  // 正在行驶的路段：底图跳过，改由 active 层按占用车颜色绘制，避免被他车规划线盖住。
  const occupiedEdgeIds = new Set(game.activeEdges.map((a) => a.edgeId));

  function trainPoint(train: TrainView) {
    const pos = train.position;
    if (pos.kind === 'node') {
      const node = nodeById.get(pos.nodeId);
      return node ? nodePoint(node) : { x: 0, y: 0 };
    }
    const edge = graph.edges.find((e) => e.id === pos.edgeId);
    if (!edge) return { x: 0, y: 0 };
    return pointOnEdge(edge, pos.from, pos.to, pos.progress, nodeById);
  }

  const movingTrains = game.trains.filter((t) => t.status === 'running' || t.status === 'stalled');

  return (
    <div className="map-canvas-wrap">
      <svg className="map-canvas" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* 1) 基础路段（非损坏、非占用） */}
        {graph.edges.map((edge) => {
          if (damaged.has(edge.id) || occupiedEdgeIds.has(edge.id)) return null;
          const geo = edgeGeometry(edge, nodeById);
          if (!geo) return null;
          return <path key={edge.id} className="map-edge" d={edgePathD(geo.a, geo.c, geo.b)} />;
        })}

        {/* 2) 各车剩余规划路线底图（跳过正被占用的路段，避免串色） */}
        {movingTrains.map((train) => {
          const nodes = remainingRoute(train);
          const segments: string[] = [];
          for (let i = 0; i < nodes.length - 1; i += 1) {
            const a = nodes[i];
            const b = nodes[i + 1];
            const edge = edgeByKey.get(a < b ? `${a}|${b}` : `${b}|${a}`);
            if (!edge) continue;
            // 他车正在行驶的路段不画进本车规划底图
            if (occupiedEdgeIds.has(edge.id) && !activeByEdge.get(edge.id)?.includes(train.id)) {
              continue;
            }
            // 本车正在行驶的当前段由 active 层绘制
            if (occupiedEdgeIds.has(edge.id) && activeByEdge.get(edge.id)?.includes(train.id)) {
              continue;
            }
            const geo = edgeGeometry(edge, nodeById);
            if (!geo) continue;
            const startPt = edge.from === a ? geo.a : geo.b;
            const endPt = edge.from === a ? geo.b : geo.a;
            segments.push(`M ${startPt.x} ${startPt.y} Q ${geo.c.x} ${geo.c.y} ${endPt.x} ${endPt.y}`);
          }
          if (segments.length === 0) return null;
          return (
            <path
              key={`route-${train.id}`}
              className="route-underlay"
              d={segments.join(' ')}
              style={{ stroke: TRAIN_COLORS[train.id] }}
            />
          );
        })}

        {/* 3) hover 预览路线 */}
        {hover ? (
          <path
            className="route-preview"
            d={routePathD(hover.route, nodeById, edgeByKey)}
            style={{ stroke: TRAIN_COLORS[hover.trainId] }}
          />
        ) : null}

        {/* 4) 正在行驶的路段：按占用列车颜色置顶（多车同段用第一条，正常会被碰撞打断） */}
        {graph.edges.map((edge) => {
          const active = activeByEdge.get(edge.id);
          if (!active || active.length === 0 || damaged.has(edge.id)) return null;
          const geo = edgeGeometry(edge, nodeById);
          if (!geo) return null;
          return (
            <path
              key={`active-${edge.id}`}
              className="map-edge active"
              d={edgePathD(geo.a, geo.c, geo.b)}
              style={{ stroke: TRAIN_COLORS[active[0]] }}
            />
          );
        })}

        {/* 5) 损坏路段：红色置顶 */}
        {graph.edges.map((edge) => {
          if (!damaged.has(edge.id)) return null;
          const geo = edgeGeometry(edge, nodeById);
          if (!geo) return null;
          return (
            <path
              key={`damaged-${edge.id}`}
              className="map-edge damaged"
              d={edgePathD(geo.a, geo.c, geo.b)}
            />
          );
        })}

        {/* 6) 节点 */}
        {graph.nodes.map((node) => {
          const p = nodePoint(node);
          const r = node.kind === 'junction' ? 6 : 14;
          return (
            <g key={node.id} className={`map-node kind-${node.kind}`}>
              <circle cx={p.x} cy={p.y} r={r} />
              {node.kind === 'depot' ? (
                <text x={p.x - r - 8} y={p.y + 5} textAnchor="end">
                  {node.label}
                </text>
              ) : null}
              {node.kind === 'terminal' ? (
                <text x={p.x + r + 8} y={p.y + 5} textAnchor="start">
                  {node.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* 7) 变道方向箭头 */}
        {game.trains.map((train) => {
          if (!train.decision) return null;
          const junction = nodeById.get(train.decision.junctionNodeId);
          if (!junction) return null;
          const jp = nodePoint(junction);
          return train.decision.options.map((opt) => {
            const edge = graph.edges.find((e) => e.id === opt.edgeId);
            if (!edge) return null;
            const geo = edgeGeometry(edge, nodeById);
            if (!geo) return null;
            const atFrom = edge.from === train.decision!.junctionNodeId;
            const tan = quadTangent(geo.a, geo.c, geo.b, atFrom ? 0 : 1);
            let dx = atFrom ? tan.x : -tan.x;
            let dy = atFrom ? tan.y : -tan.y;
            const len = Math.hypot(dx, dy) || 1;
            dx /= len;
            dy /= len;
            const base = 22;
            const tip = 40;
            const ax = jp.x + dx * tip;
            const ay = jp.y + dy * tip;
            const bx = jp.x + dx * base;
            const by = jp.y + dy * base;
            const perpX = -dy;
            const perpY = dx;
            const wing = 7;
            const color = TRAIN_COLORS[train.id];
            const lit = train.decision!.lit;
            const cls = `reroute-arrow ${opt.damaged ? 'damaged' : ''} ${lit ? 'lit' : 'dim'} ${opt.isCurrent ? 'current' : ''}`;
            return (
              <g
                key={`${train.id}-${opt.viaNodeId}`}
                className={cls}
                style={{ ['--arrow-color' as string]: color }}
                onMouseEnter={() => !opt.damaged && setHover({ trainId: train.id, route: opt.resultingRoute })}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  if (opt.damaged) return;
                  setHover(null);
                  onReroute(train.id, opt.viaNodeId, opt.isCurrent);
                }}
              >
                <line x1={bx} y1={by} x2={ax} y2={ay} className="arrow-hit" />
                <line x1={bx} y1={by} x2={ax} y2={ay} className="arrow-shaft" />
                <polygon
                  className="arrow-head"
                  points={`${ax + dx * 6},${ay + dy * 6} ${ax + perpX * wing},${ay + perpY * wing} ${ax - perpX * wing},${ay - perpY * wing}`}
                />
              </g>
            );
          });
        })}

        {/* 8) 列车 marker */}
        {game.trains.map((train) => {
          const p = trainPoint(train);
          const color = TRAIN_COLORS[train.id];
          const isStranded = train.status === 'stranded';
          const isArrived = train.status === 'arrived';
          const isStalled = train.status === 'stalled';
          return (
            <g key={train.id} className={`map-train status-${train.status}`} transform={`translate(${p.x}, ${p.y})`}>
              <circle
                r={13}
                fill={isStranded ? '#ff4d4f' : isArrived ? '#37b24d' : color}
                stroke={isStalled ? '#ffd34d' : 'rgba(0,0,0,0.35)'}
                strokeWidth={isStalled ? 3 : 1.5}
              />
              <text textAnchor="middle" dy="4" className="train-label">
                {train.id}
              </text>
              {isStranded ? (
                <text textAnchor="middle" dy="-19" className="train-badge">✕</text>
              ) : null}
              {isStalled ? (
                <text textAnchor="middle" dy="-19" className="train-badge">⏸</text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="map-legend">
        <span><i className="legend-dot" style={{ background: '#3a4452' }} /> 路段</span>
        <span><i className="legend-dot" style={{ background: '#ff4d4f' }} /> 损坏（勿驶入）</span>
        {game.trains.map((t) => (
          <span key={t.id}><i className="legend-dot" style={{ background: TRAIN_COLORS[t.id] }} /> {t.id} 路线</span>
        ))}
        <span className="legend-hint">列车临近分岔口时箭头亮起，点击箭头变道</span>
      </div>
    </div>
  );
}
