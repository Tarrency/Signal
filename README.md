# 《末班信号站 · 暴雨调度》

一款 **24 秒倒计时**的轻策略全栈小游戏。玩家扮演末班车调度员，在暴雨到达前把 3 列空车安全调回各自终点站（次日早班的发车起点）：在分岔口点箭头变道绕开红色损坏路段，必要时全体暂停错峰，尽量零事故通关。

## 技术栈

- 前端：React + TypeScript + Vite
- 后端：Express + TypeScript + Zod
- 通信：真实 HTTP API（前端约 500ms 轮询）
- 存储：内存中的进行中对局 + `data/leaderboard.json` 历史最佳成绩榜

## 项目结构

```text
signal/
  game_design.md
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
      main.tsx
      App.tsx
      api.ts
      constants.ts
      geometry.ts
      types.ts
      styles.css
      components/
        StartScreen.tsx
        GameScreen.tsx
        MapView.tsx
        ResultScreen.tsx
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

核心规则引擎（`server/gameEngine.ts`）有 Vitest 单元测试，位于 `test/gameEngine.test.ts`。引擎为纯逻辑 + 时间参数注入（`now: Date`），对局 seed 可复现。

```bash
npm test            # 单次运行
npm run test:watch  # 监听模式
```

当前约 31 个用例，覆盖：图与寻路、开局损坏约束、自动前进与事故检修、驶入损坏判定、全体暂停、变道箭头、末端选错站、雷击时机与保护、结束与评级、视图序列化。

## 试玩说明

1. 打开页面，阅读介绍后点击「开始调度」。
2. 进入 **24 秒**暴雨倒计时；3 列车已自动发车。
3. 地图上红色脉动路段为损坏路段，勿驶入。
4. 列车临近分岔口时，其颜色方向箭头会亮起：hover 预览路线，点击变道。
5. 手忙脚乱时可点「全体暂停」，全车停 3 秒（倒计时不停）。
6. 暴雨到达后顶部出现「查看结果」；结果页可「返回首页」或「再来一局」。
7. 成绩写入历史最佳成绩榜（`data/leaderboard.json`）。

## 游戏规则摘要

- **地图**：左→右格状曲线网（始发端 → 枢纽层 → 终点站），路段只向右；每分岔口最多右上 / 右下两个方向。
- **列车**：末班空车 T1 甲始→甲站、T2 乙始→乙站、T3 丙始→丙站；终点站亦为次日早班起点。开局沿最短路自动跑。
- **开局损坏**：约 3 段落在默认路线上（不含第一段），且保证仍有绕行可达终点。
- **雷击**：约第 6 / 14 / 22 秒再劈坏未占用、未走过的路段；临近到站时会推迟结算。
- **事故**：同路段相撞，或沿损坏路段实际移动 ≥1 秒 → 全体检修 6 秒并重 roll 损坏（顶替一次雷击）。列车不报废。
- **误入他站**：末端选错终点站会卡住（`stranded`），记未到站，不触发检修。
- **操作**：只操作地图——变道箭头 + 全体暂停。

## 评级规则

- **S**：3 到站、0 事故、0 暂停
- **A**：3 到站、0 事故
- **B**：3 到站（有事故/暂停）
- **C**：2 到站
- **D**：其余（≤1 到站）

排行榜排序：到站多 → 事故少 → 用时短 → 记录早。

## API 概览

- `POST /api/games`：创建新游戏
- `GET /api/games/:gameId`：获取（并推进）当前游戏状态
- `POST /api/games/:gameId/reroute`：变道 `{ trainId, viaNodeId }`
- `POST /api/games/:gameId/pause`：全体暂停 3 秒
- `GET /api/leaderboard`：读取历史最佳成绩榜

## 手动验证 API 示例

### 1. 创建新游戏

```bash
curl -X POST http://localhost:3001/api/games \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### 2. 变道（将返回的 game.id 替换进去）

```bash
curl -X POST http://localhost:3001/api/games/<gameId>/reroute \
  -H 'Content-Type: application/json' \
  -d '{"trainId":"T1","viaNodeId":"B2"}'
```

### 3. 全体暂停

```bash
curl -X POST http://localhost:3001/api/games/<gameId>/pause \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### 4. 查询当前状态

```bash
curl http://localhost:3001/api/games/<gameId>
```

### 5. 查询排行榜

```bash
curl http://localhost:3001/api/leaderboard
```

清空历史榜：把 `data/leaderboard.json` 写成 `[]` 后**重启后端**（服务端有内存缓存）。

## 已完成

- 暴雨调度完整闭环（变道 / 暂停 / 损坏 / 雷击 / 检修 / 评级）
- 真实前后端 HTTP 通信与服务端权威模拟
- SVG 曲线地图、路线底图着色、结束态雨幕与紧张倒计时
- 结果页（返回首页 / 再来一局）与历史最佳成绩榜
- 核心规则引擎自动化单元测试（Vitest）

## 未完成

- 更全面的自动化测试（路由层与前端组件）
- WebSocket 实时同步
- 多地图 / 多关卡
- 用户系统与个性化名字
