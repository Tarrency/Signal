export const API_BASE_URL = 'http://localhost:3001/api';
// 轮询间隔较短，配合前端插值让列车动画平滑。
export const POLL_INTERVAL_MS = 500;

export const TRAIN_LABELS: Record<string, string> = {
  T1: 'T1 甲车',
  T2: 'T2 乙车',
  T3: 'T3 丙车',
};

export const TRAIN_COLORS: Record<string, string> = {
  T1: '#4dabf7',
  T2: '#f7b84d',
  T3: '#9775fa',
};

export const STATUS_LABELS: Record<string, string> = {
  running: '运行中',
  stalled: '停滞中',
  arrived: '已到站',
  stranded: '误入他站',
};
