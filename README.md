# 《末班信号站》

一个 60 秒倒计时的轻策略全栈小游戏。玩家扮演末班车调度员，在固定信号窗口下安排 3 列列车通过中央信号站，尽可能安全到达终点。

## 技术栈

- 前端：React + TypeScript + Vite
- 后端：Express + TypeScript + Zod
- 通信：真实 HTTP API
- 存储：内存中的进行中对局 + `data/leaderboard.json` 历史最佳成绩榜

## 项目结构

```text
signal/
  game_design.md
  API_design.md
  README.md
  server/
    index.ts
    routes.ts
    gameEngine.ts
    storage.ts
    schemas.ts
    types.ts
  web/
    index.html
    vite.config.ts
    src/
      App.tsx
      api.ts
      constants.ts
      types.ts
      styles.css
      components/
  test/
    gameEngine.test.ts
  data/
    leaderboard.json
```

## 安装与启动

```bash
npm install
npm run dev
```

启动后：
- 前端：http://localhost:5173
- 后端：http://localhost:3001

## 测试

核心规则引擎（`server/gameEngine.ts`）有 Vitest 单元测试，位于 `test/gameEngine.test.ts`。引擎是纯函数 + 时间参数注入（`now: Date`）设计，无随机数、不依赖真实时钟，因此测试完全确定性。

```bash
npm test        # 单次运行
npm run test:watch  # 监听模式
```

覆盖信号时刻表边界、发车/红灯/占用/状态校验、到站与事故判定、60 秒结束、S/D 评级、视图裁剪与排行榜条目生成，共 19 个用例。

## 试玩说明

1. 打开页面后点击“开始调度”。
2. 游戏会进入 60 秒倒计时。
3. 观察中央信号站当前是绿灯还是红灯。
4. 当列车按钮可用时，点击“放行”。
5. 如果列车发车后没能赶在红灯前进入中央信号站，会在区间内发生事故。
6. 游戏结束后会显示：
   - 安全到站数
   - 事故数
   - 未到站数
   - 完成用时
   - 评级
7. 成绩会写入历史最佳成绩榜。

## 游戏规则摘要

- 蓝线：西园站 → 中央信号站 → 东港站
- 橙线：南桥站 → 中央信号站 → 北码头站
- T1/T3 从西园站出发，T2 从南桥站出发
- 进入中央信号站需要 5 秒
- 从中央信号站到终点需要 4 秒
- 中央信号站按固定时序切换绿灯/红灯
- 红灯期间不能进入中央信号站
- 若列车发车后目标站在到达前关闭，则判定为事故

## 评级规则

- S：3 到站、0 事故、完成时间 ≤ 40 秒
- A：3 到站、0 事故、完成时间 ≤ 60 秒
- B：2 到站、0 事故
- C：2 到站且 1 事故，或 1 到站
- D：0 到站，或 2 次及以上事故

## API 概览

- `POST /api/games`：创建新游戏
- `GET /api/games/:gameId`：获取当前游戏状态
- `POST /api/games/:gameId/dispatch`：放行某辆列车
- `GET /api/leaderboard`：读取历史最佳成绩榜

## 手动验证 API 示例

### 1. 创建新游戏

```bash
curl -X POST http://localhost:3001/api/games \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### 2. 放行 T1

将上一步返回的 `game.id` 替换到下面命令中：

```bash
curl -X POST http://localhost:3001/api/games/<gameId>/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"trainId":"T1"}'
```

### 3. 查询当前状态

```bash
curl http://localhost:3001/api/games/<gameId>
```

### 4. 查询排行榜

```bash
curl http://localhost:3001/api/leaderboard
```

## 已完成

- 完整游戏闭环
- 真实前后端 HTTP 通信
- 服务端权威状态推进与评级计算
- 固定信号时序
- 历史最佳成绩榜
- 可视化地图、日志、信号面板、结果页
- 核心规则引擎的自动化单元测试（Vitest，19 个用例）

## 未完成

- 更全面的自动化测试（路由层与前端组件）
- WebSocket 实时同步
- 更复杂的动画表现
- 多地图 / 多关卡
- 用户系统与个性化名字
