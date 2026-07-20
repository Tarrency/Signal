import type { MapEdge, MapNode } from './types';

// SVG 画布尺寸（viewBox）。节点归一化坐标 0~1 映射到此。
export const W = 1100;
export const H = 620;
export const PAD = 46;

export type Pt = { x: number; y: number };

export function nodePoint(node: MapNode): Pt {
  return {
    x: PAD + node.x * (W - PAD * 2),
    y: PAD + node.y * (H - PAD * 2),
  };
}

// 路段的二次贝塞尔控制点：从两端中点沿法线方向偏移 curve（归一化）。
// 方向由 from→to 固定，保证服务端 edge.from/to 与前端一致。
export function controlPoint(a: Pt, b: Pt, curve: number): Pt {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // 法线（-dy, dx）归一化后按 curve * 画布尺度偏移。
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = curve * (W); // curve 用画布宽度缩放
  return { x: mx + nx * offset, y: my + ny * offset };
}

// 二次贝塞尔在参数 t∈[0,1] 处的点。
export function quadPoint(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
  };
}

// 二次贝塞尔在 t 处的切线方向（未归一化）。
export function quadTangent(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: 2 * mt * (c.x - a.x) + 2 * t * (b.x - c.x),
    y: 2 * mt * (c.y - a.y) + 2 * t * (b.y - c.y),
  };
}

// 生成 SVG path 的 d 属性（从 a 经控制点到 b）。
export function edgePathD(a: Pt, c: Pt, b: Pt): string {
  return `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
}

// 便捷：给定两个节点 id 与 edge，返回其端点/控制点（按 edge.from→edge.to 方向）。
export function edgeGeometry(edge: MapEdge, nodeById: Map<string, MapNode>) {
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  if (!from || !to) return null;
  const a = nodePoint(from);
  const b = nodePoint(to);
  const c = controlPoint(a, b, edge.curve);
  return { a, b, c };
}

// 列车沿某条边行进 progress（0~1），沿 fromId→toId 方向（可能与 edge.from/to 相反）。
export function pointOnEdge(
  edge: MapEdge,
  fromId: string,
  toId: string,
  progress: number,
  nodeById: Map<string, MapNode>,
): Pt {
  const geo = edgeGeometry(edge, nodeById);
  if (!geo) return { x: PAD, y: PAD };
  // 若行进方向与 edge 定义方向相反，则 t = 1 - progress。
  const t = edge.from === fromId && edge.to === toId ? progress : 1 - progress;
  return quadPoint(geo.a, geo.c, geo.b, t);
}
