# 《末班信号站》API 设计文档

## 一、设计目标

本项目采用 **前后端分离 + 真实 HTTP API 通信** 的方式实现。

API 设计遵循以下原则：
- 接口数量尽量少，满足 MVP 闭环
- 后端作为唯一状态权威，前端不自行推导关键结果
- 所有游戏规则判断、事故判定、结束结算、评级计算均由后端完成
- 接口返回清晰、可解释、可验证
- 提供基础参数校验和错误反馈

---

## 二、MVP 接口总览

MVP 只保留 4 个核心接口：

1. `POST /api/games`  
   创建新游戏

2. `GET /api/games/:gameId`  
   获取当前游戏状态，并按当前时间推进游戏状态

3. `POST /api/games/:gameId/dispatch`  
   执行一次“放行列车”调度操作

4. `GET /api/leaderboard`  
   获取历史最佳成绩榜

---

## 三、核心设计原则

### 1. 后端是唯一规则权威
前端只负责展示和触发操作，不负责：
- 判断列车是否一定可以发车
- 判断事故
- 判断到站
- 判断游戏结束
- 计算评级

这些均由后端统一处理。

### 2. GET 接口不仅是读取，还负责时间推进
由于本游戏是 **60 秒倒计时**，即使玩家不操作，状态也会因时间流逝而变化。  
因此 `GET /api/games/:gameId` 的职责不是简单“读取存档”，而是：
- 读取当前游戏
- 依据当前时间推进状态
- 处理列车到站 / 事故 / 结束结算
- 返回最新可展示状态

### 3. POST dispatch 接口负责最终裁决
前端可以根据 GET 的结果显示“按钮可点/不可点”，但真正执行发车前，后端必须再次校验。  
因此 dispatch 接口是唯一真正会改变列车发车状态的操作接口。

---

## 四、游戏核心规则与接口关系

### 1. 当前能否发车的判定逻辑
当玩家尝试放行某辆车时，后端必须检查：

1. 游戏是否仍在进行中
2. 列车状态是否为 `waiting`
3. 列车是否确实在站内，而非区间中
4. 是否存在下一站
5. 下一站当前是否允许接收
6. 下一站是否未被其他列车占用

### 2. MVP 中的关键判断
本项目的核心瓶颈是 **中央信号站**，所以最关键的规则是：
- 若目标站为中央信号站，则该站当前必须为 `green`
- 若目标站被占用，也不能发车

### 3. 事故判定
事故不是随机触发，而是确定性规则：

**列车发车后，在预计到达目标站前，目标站已经变为不可接收，则列车记为事故。**

该判定发生在后端推进时间时执行。

---

## 五、时间推进设计

后端建议实现统一推进函数：

```ts
advanceGameToNow(game, now)
```

该函数职责：
- 计算 `elapsedSeconds`
- 计算 `remainingSeconds`
- 根据固定时序表计算当前信号状态
- 检查所有在途列车是否到站或事故
- 判断游戏是否结束
- 若结束则生成结果和评级

### 1. GET 接口调用方式
```ts
load game
advanceGameToNow(game, now)
save game
return serialized game
```

### 2. dispatch 接口调用方式
```ts
load game
advanceGameToNow(game, now)
validate dispatch
apply dispatch
advanceGameToNow(game, now)
save game
return serialized game
```

这样可保证所有状态变化都经过同一套规则引擎。

---

## 六、固定信号时序

中央信号站使用固定时序表，确保可复现：

- 0s ~ 8s：`green`
- 8s ~ 14s：`red`
- 14s ~ 24s：`green`
- 24s ~ 30s：`red`
- 30s ~ 42s：`green`
- 42s ~ 48s：`red`
- 48s ~ 60s：`green`

前端通过 `GET /api/games/:gameId` 获取：
- 当前信号状态
- 距离下一次切换的剩余秒数

---

## 七、数据模型

### 1. Game

```ts
type Game = {
  id: string
  playerName: string
  status: 'playing' | 'finished'
  startedAt: string
  finishedAt: string | null
  durationSeconds: 60
  signalSchedule: SignalWindow[]
  trains: Train[]
  logs: GameLog[]
  result: GameResult | null
}
```

字段说明：
- `id`：游戏唯一标识
- `playerName`：玩家名称
- `status`：游戏状态
- `startedAt`：开始时间
- `finishedAt`：结束时间
- `durationSeconds`：固定 60 秒
- `signalSchedule`：中央信号站信号切换时序
- `trains`：列车状态列表
- `logs`：调度日志
- `result`：结束结果；未结束时为 `null`

---

### 2. SignalWindow

```ts
type SignalWindow = {
  from: number
  to: number
  state: 'green' | 'red'
}
```

字段说明：
- `from`：起始秒（包含）
- `to`：结束秒（不包含）
- `state`：当前窗口状态

---

### 3. Train

```ts
type Train = {
  id: 'T1' | 'T2' | 'T3'
  route: 'blue' | 'orange'
  status: 'waiting' | 'in_transit' | 'arrived' | 'incident'
  currentStationId: string | null
  targetStationId: string | null
  departureAt: string | null
  arrivalDueAt: string | null
  travelSeconds: number | null
}
```

字段说明：
- `id`：列车编号
- `route`：线路类型
- `status`：列车状态
- `currentStationId`：当前所在站；区间中时可为 `null`
- `targetStationId`：当前目标站
- `departureAt`：发车时间
- `arrivalDueAt`：预计到达时间
- `travelSeconds`：本段运行时长

---

### 4. GameLog

```ts
type GameLog = {
  id: string
  timestamp: string
  type:
    | 'dispatch'
    | 'arrival'
    | 'signal_change'
    | 'incident'
    | 'finish'
    | 'system'
  message: string
}
```

字段说明：
- `id`：日志唯一标识
- `timestamp`：事件发生时间
- `type`：日志类型
- `message`：人类可读说明

---

### 5. GameResult

```ts
type GameResult = {
  arrivedCount: number
  incidentCount: number
  unfinishedCount: number
  completionTimeSeconds: number | null
  rating: 'S' | 'A' | 'B' | 'C' | 'D'
}
```

字段说明：
- `arrivedCount`：安全到站数
- `incidentCount`：事故数
- `unfinishedCount`：未到站数
- `completionTimeSeconds`：若 3 列车全部安全到站，则记录完成用时；否则为 `null`
- `rating`：评级

---

### 6. LeaderboardEntry

```ts
type LeaderboardEntry = {
  gameId: string
  playerName: string
  arrivedCount: number
  incidentCount: number
  unfinishedCount: number
  completionTimeSeconds: number | null
  rating: 'S' | 'A' | 'B' | 'C' | 'D'
  finishedAt: string
}
```

字段说明：
- `gameId`：来源游戏 id
- `playerName`：玩家名
- `arrivedCount`：安全到站数
- `incidentCount`：事故数
- `unfinishedCount`：未到站数
- `completionTimeSeconds`：完成用时
- `rating`：评级
- `finishedAt`：结算时间

---

## 八、返回给前端的展示模型

为了让前端尽量简单，建议服务端在 `GET /api/games/:gameId` 中返回“可直接渲染”的字段，而不是要求前端自己推导。

### GameView

```ts
type GameView = {
  id: string
  playerName: string
  status: 'playing' | 'finished'
  elapsedSeconds: number
  remainingSeconds: number
  signal: {
    stationId: 'central'
    state: 'green' | 'red'
    secondsUntilSwitch: number
  }
  trains: TrainView[]
  summary: {
    arrivedCount: number
    incidentCount: number
    unfinishedCount: number
  }
  result: GameResult | null
  logs: GameLog[]
}
```

---

### TrainView

```ts
type TrainView = {
  id: 'T1' | 'T2' | 'T3'
  route: 'blue' | 'orange'
  status: 'waiting' | 'in_transit' | 'arrived' | 'incident'
  currentStationId: string | null
  nextStationId: string | null
  canDispatch: boolean
  blockedReason: string | null
  travelSeconds: number | null
  secondsToArrival: number | null
}
```

字段说明：
- `canDispatch`：前端用于决定按钮是否可点
- `blockedReason`：若不可发车，展示具体原因
- `secondsToArrival`：若在区间中，前端可显示剩余行驶时间

---

## 九、接口详细设计

# 1. 创建新游戏

## `POST /api/games`

### 作用
创建一局新游戏，并返回初始局面。

### 请求体
```json
{}
```

### 参数校验
- 请求体可为空
- 后端固定使用默认玩家名：`末班车调度员`

### 成功响应
```json
{
  "game": {
    "id": "g_001",
    "playerName": "末班车调度员",
    "status": "playing",
    "elapsedSeconds": 0,
    "remainingSeconds": 60,
    "signal": {
      "stationId": "central",
      "state": "green",
      "secondsUntilSwitch": 8
    },
    "trains": [
      {
        "id": "T1",
        "route": "blue",
        "status": "waiting",
        "currentStationId": "west_park",
        "nextStationId": "central",
        "canDispatch": true,
        "blockedReason": null,
        "travelSeconds": 5,
        "secondsToArrival": null
      }
    ],
    "summary": {
      "arrivedCount": 0,
      "incidentCount": 0,
      "unfinishedCount": 3
    },
    "result": null,
    "logs": []
  }
}
```

### 失败响应
创建游戏接口在当前 MVP 中无必填请求体，通常不会因为空请求而失败。若服务异常，返回统一错误结构。

---

# 2. 获取游戏状态

## `GET /api/games/:gameId`

### 作用
- 获取当前游戏状态
- 按当前时间推进游戏
- 处理到站、事故、结束结算
- 返回最新可展示局面

### 路径参数
- `gameId`：游戏 id

### 成功响应
```json
{
  "game": {
    "id": "g_001",
    "playerName": "末班车调度员",
    "status": "playing",
    "elapsedSeconds": 12,
    "remainingSeconds": 48,
    "signal": {
      "stationId": "central",
      "state": "green",
      "secondsUntilSwitch": 2
    },
    "trains": [
      {
        "id": "T1",
        "route": "blue",
        "status": "waiting",
        "currentStationId": "west_park",
        "nextStationId": "central",
        "canDispatch": true,
        "blockedReason": null,
        "travelSeconds": 5,
        "secondsToArrival": null
      },
      {
        "id": "T2",
        "route": "orange",
        "status": "waiting",
        "currentStationId": "south_bridge",
        "nextStationId": "central",
        "canDispatch": false,
        "blockedReason": "中央信号站当前被占用",
        "travelSeconds": 5,
        "secondsToArrival": null
      }
    ],
    "summary": {
      "arrivedCount": 0,
      "incidentCount": 0,
      "unfinishedCount": 3
    },
    "result": null,
    "logs": []
  }
}
```

### 失败响应
```json
{
  "error": {
    "code": "GAME_NOT_FOUND",
    "message": "Game g_001 not found"
  }
}
```

---

# 3. 提交调度动作

## `POST /api/games/:gameId/dispatch`

### 作用
执行一次“放行列车”动作。

### 请求体
```json
{
  "trainId": "T1"
}
```

### 参数校验
- `trainId` 必填
- 必须为 `T1 | T2 | T3`

### 执行流程
1. 读取游戏
2. 推进到当前时间
3. 校验列车当前是否可以发车
4. 若可发车，则将其状态改为 `in_transit`
5. 写入 `departureAt`
6. 计算 `arrivalDueAt`
7. 写入一条 dispatch 日志
8. 再次检查游戏是否结束
9. 保存并返回最新局面

### 成功响应
```json
{
  "ok": true,
  "game": {
    "id": "g_001",
    "playerName": "末班车调度员",
    "status": "playing",
    "elapsedSeconds": 6,
    "remainingSeconds": 54,
    "signal": {
      "stationId": "central",
      "state": "green",
      "secondsUntilSwitch": 2
    },
    "trains": [
      {
        "id": "T1",
        "route": "blue",
        "status": "in_transit",
        "currentStationId": null,
        "nextStationId": "central",
        "canDispatch": false,
        "blockedReason": "列车正在区间运行中",
        "travelSeconds": 5,
        "secondsToArrival": 5
      }
    ],
    "summary": {
      "arrivedCount": 0,
      "incidentCount": 0,
      "unfinishedCount": 3
    },
    "result": null,
    "logs": [
      {
        "id": "log_1",
        "timestamp": "2026-07-19T10:00:06.000Z",
        "type": "dispatch",
        "message": "T1 从西园站发车，前往中央信号站，预计 5 秒后到达"
      }
    ]
  }
}
```

### 失败响应示例

#### 信号阻塞
```json
{
  "error": {
    "code": "SIGNAL_BLOCKED",
    "message": "中央信号站当前为红灯，T1 无法发车"
  }
}
```

#### 站点占用
```json
{
  "error": {
    "code": "STATION_OCCUPIED",
    "message": "中央信号站当前被占用，T2 无法发车"
  }
}
```

#### 列车状态错误
```json
{
  "error": {
    "code": "INVALID_TRAIN_STATE",
    "message": "T1 当前不处于可发车状态"
  }
}
```

#### 游戏已结束
```json
{
  "error": {
    "code": "GAME_FINISHED",
    "message": "当前游戏已结束，不能继续调度"
  }
}
```

---

# 4. 获取排行榜

## `GET /api/leaderboard`

### 作用
读取历史最佳成绩榜。

### 排序规则
1. `arrivedCount` 降序
2. `incidentCount` 升序
3. `completionTimeSeconds` 升序（`null` 视为最差）
4. `finishedAt` 升序或降序均可，但实现时需固定

### 成功响应
```json
{
  "items": [
    {
      "gameId": "g_001",
      "playerName": "末班车调度员",
      "arrivedCount": 3,
      "incidentCount": 0,
      "unfinishedCount": 0,
      "completionTimeSeconds": 37,
      "rating": "S",
      "finishedAt": "2026-07-19T10:12:00.000Z"
    },
    {
      "gameId": "g_002",
      "playerName": "Bob",
      "arrivedCount": 2,
      "incidentCount": 0,
      "unfinishedCount": 1,
      "completionTimeSeconds": null,
      "rating": "B",
      "finishedAt": "2026-07-19T10:15:00.000Z"
    }
  ]
}
```

---

## 十、评级计算规则

评级统一由后端在游戏结束时计算。

### 输入字段
- `arrivedCount`
- `incidentCount`
- `unfinishedCount`
- `completionTimeSeconds`

### 规则
- **S**：3 到站，0 事故，且 `completionTimeSeconds <= 40`
- **A**：3 到站，0 事故，且 `completionTimeSeconds <= 60`
- **B**：2 到站，0 事故
- **C**：2 到站且 1 事故，或 1 到站
- **D**：0 到站，或 2 次及以上事故

### 说明
评级结果在 `GameResult.rating` 中返回，并写入排行榜。

---

## 十一、错误码建议

```ts
type ErrorCode =
  | 'INVALID_PAYLOAD'
  | 'GAME_NOT_FOUND'
  | 'GAME_FINISHED'
  | 'INVALID_TRAIN_ID'
  | 'INVALID_TRAIN_STATE'
  | 'SIGNAL_BLOCKED'
  | 'STATION_OCCUPIED'
```

建议统一错误格式：

```json
{
  "error": {
    "code": "SIGNAL_BLOCKED",
    "message": "中央信号站当前为红灯，T1 无法发车"
  }
}
```

---

## 十二、前端轮询建议

由于本项目不使用 WebSocket，前端通过轮询更新局面即可。

### 建议频率
- `500ms ~ 1000ms` 一次

### 原因
- 可及时刷新倒计时和列车位置
- 实现简单
- 对本地 MVP 压力很小

---

## 十三、MVP 范围控制

为了保证交付，接口层坚持以下边界：

### 保留
- 创建游戏
- 查询游戏状态
- 执行发车
- 读取排行榜

### 不做
- 暂停/继续游戏
- 删除历史记录
- 用户系统
- 房间系统
- 多人实时同步
- WebSocket 推送
- 自定义地图或关卡

---

## 十四、结论

本 API 设计的核心思想是：
- **用最少的接口完成完整游戏闭环**
- **所有规则判断统一收敛到后端**
- **前端只做展示与操作触发**
- **通过 GET 轮询 + dispatch 操作实现轻量实时感**

这套设计最符合本题的 MVP 原则，也便于后续快速进入编码实现。