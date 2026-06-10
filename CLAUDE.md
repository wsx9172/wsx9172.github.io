# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个纯静态的贪吃蛇游戏，托管于 GitHub Pages。无需构建工具，直接用浏览器打开 `index.html` 即可运行。

## 开发方式

```
# 本地预览 — 直接在浏览器中打开
start index.html

# 或用 Python 启动本地服务器（避免跨域问题）
python -m http.server 8080
```

## 架构

```
index.html   → 页面结构：三栏布局（左栏-状态/控制 | 中栏-Canvas+D-pad | 右栏-说明）+ 游戏结束弹窗
style.css    → 样式：flex 三栏布局、按钮、弹窗、暂停/倒计时提示、D-pad、移动端响应式、动画（~689 行）
game.js      → 全部游戏逻辑，单文件 ~1341 行
favicon.svg  → 网站图标（🐍🍎 emoji）
README.md    → 项目介绍（部分内容可能过时，功能特性列表已落后于实际实现）
```

### 三栏布局依赖链

`index.html` 中使用了 `.main-container`、`.sidebar`、`.left-sidebar`、`.right-sidebar`、`.game-area`、`.stats-panel`、`.stat-item`、`.stat-label` 等 CSS 类，**这些类的样式定义在 `style.css`** 中。如果对应的 CSS 规则被删除，整个页面布局会塌陷。

### game.js 核心架构（~1341 行）

game.js 按功能可分为以下模块：

#### 1. 游戏配置与状态（第 1-231 行）
- **常量**: `GRID_SIZE = 20`, `CANVAS_SIZE = 600`, `CELL_SIZE = 30`
- **gameState**: 蛇、食物、方向、`directionQueue`（最多缓存 2 个方向）、分数、最高分（localStorage）、等级、`isGameRunning`/`isPaused` 双标志位、`gameSpeed`

#### 2. 音效系统 `soundManager`（第 7-167 行）
- 基于 Web Audio API，全部音效通过振荡器合成，无外部音频文件
- **惰性初始化**: `init()` 在首次点击音效按钮或 `startGame()` 时被调用，创建 `AudioContext`
- **需用户手势**: Chrome 要求用户手势后才能创建/恢复 AudioContext，因此 `resume()` 在每次发声前调用
- 音效类型：
  - `eatSound()`: 三音上扬（C5→E5→G5，正弦波）
  - `levelUpSound()`: 四音琶音（三角波）
  - `victorySound()`: 七音庆祝旋律（等级 10 触发）
  - `gameOverSound()`: 三音下行悲鸣（锯齿波）
  - `stepSound()`: 每 4 步一个低频脉冲
- **背景音乐**: 20 音符五声音阶旋律循环，`_bgTempo` 随等级从 220ms 加快到最低 75ms（`updateBgTempo(level)`），每 4 拍加低音根音
- `toggle()` 切换开关，返回当前状态；`stopBackground()` 清除 `_bgTimer` 定时器
- 切换按钮 DOM: `soundToggleBtn`，文案 `🔊`/`🔇`

#### 3. 震动反馈系统 `hapticManager`（第 171-214 行）
- 使用 `navigator.vibrate()` API，仅移动端 HTTPS/localhost 有效
- **关键设计 — pending 模式**: Chrome 要求 `vibrate()` 必须在用户手势的同步调用链中触发。`setTimeout(gameLoop)` 回调不在用户手势中，因此 `eatFeedback()`/`levelUpFeedback()`/`victoryFeedback()`/`gameOverFeedback()` 只将震动模式存入 `_pending`，不直接调用 `vibrate()`
- **冲刷机制**: `dirFeedback()` 在方向键/D-pad 输入（用户手势）时调用，检查 `_pending` 是否有待触发的震动，有则合并执行
- `restartGame()` 和 `startGame()` 也会直接调用 `_vibrateNow()` 冲刷（因为这些函数在按钮 click 的用户手势链中）
- `toggle()` 打开时立即测试震动（40ms），关闭时发送 0 清除 pending
- 切换按钮 DOM: `vibeToggleBtn`，文案 `📳`/`🔕`
- **重要**: 不要在 `setTimeout`/`setInterval` 回调中直接调用 `navigator.vibrate()`，必须经过 pending 机制

#### 4. 粒子系统（第 234-293 行）
- **Particle**: 吃食物时生成 8 个，带重力效果（`vy += 0.2`），颜色匹配当前水果颜色（通过覆写实例的 `draw` 方法注入水果 RGB 值）
- **LevelUpParticle**: 升级时生成 30 个，颜色匹配蛇等级色，带空气阻力（`vx *= 0.98; vy *= 0.98`），绘制时有 shadowBlur 发光
- 两个类都通过 `.replace('1)', ...)` 替换 alpha 值来设置透明度 —— **颜色格式必须为 `rgba(r, g, b, 1)`**
- 在 `draw()` 中遍历 `particles[]`，更新 → 绘制 → 移除 `life <= 0` 的粒子

#### 5. 输入系统（第 362-520 行）
- **键盘**: `keydown` → `handleKeyPress()`，方向键通过 `directionQueue`（最多 2 个）缓冲，空格键：弹窗显示时→重新开始，未开始→开始游戏，运行中→暂停/继续
- **触屏滑动**: `touchstart`/`touchmove` 在 Canvas 上（`{ passive: false }`），最小滑动距离 30px
- **移动端点击 Canvas**: `handleCanvasTap()` → 开始或继续游戏（桌面端忽略，通过 `window.innerWidth > 768` 判断）
- **D-pad 虚拟方向键**: `setupDpadControls()` 绑定 5 个按钮（↑↓←→+中心）的 `touchstart` 和 `mousedown`
- **统一方向入口 `applyDirection(direction)`**: 三场景逻辑不同：
  - 未开始/暂停/倒计时中：直接更新 `gameState.direction`，含反向保护 + 自碰保护
  - 运行中：检查反向和自碰后加入 `directionQueue`，并调用 `hapticManager.dirFeedback()` 冲刷 pending 震动

#### 6. 游戏流程控制（第 522-697 行）
- **startGame()**: 防重入检查 → 冲刷 pending 震动 → 隐藏 startHint → 禁用按钮 → `showCountdown(3秒)` → 回调中启动 `gameLoop()` + 背景音乐，隐藏鼠标光标
- **togglePause()**: 暂停时显示"已暂停"、显示鼠标、停止 BGM；恢复时显示 3 秒倒计时 → 恢复循环+BGM
- **resetGame()**: 完全重置状态（蛇、方向、分数、等级、速度=180ms、粒子），停止 BGM，显示 startHint 和鼠标
- **restartGame()**: 冲刷 pending 震动 → resetGame() + startGame()
- **showCountdown(callback)**: 递归 `setTimeout` 实现 3→2→1 倒计时显示（`.pause-hint.countdown` CSS 类），回调中有双重状态检查防止竞态
- **clearCountdownTimer()**: 清除倒计时定时器

#### 7. 游戏循环 `gameLoop()`（第 696-796 行）
- **非 requestAnimationFrame**，通过 `setTimeout(gameLoop, gameSpeed)` 递归
- 流程：消费 directionQueue → 更新方向 → 计算新蛇头 → 边界碰撞检测 → 自身碰撞检测 → unshift 头 → 吃食物判定 → 升级判定 → draw() → stepSound() → 递归
- 升级判定：`totalFoodEaten = snake.length - 1`，每 10 个食物升一级
- 速度公式：`Math.max(80, 180 - (level - 1) * 5)`（初始 180ms，每级减 5ms，最快 80ms）
- 等级 10 时额外触发 `victorySound()` 和 `victoryFeedback()`

#### 8. 渲染层 `draw()`（第 1106-1158 行）
- Canvas 2D，600×600 内部分辨率（移动端 CSS 缩放显示尺寸）
- 绘制顺序：暗色背景(`#0a0a0a`) → 网格线 → 蛇 → 食物 → 粒子 → 升级动画
- **蛇头 `drawSnakeHead()`**（第 1161-1277 行）: 圆角矩形 + 外发光效果 + 眼睛（根据 `gameState.direction` 定位在头的四个方向）+ 瞳孔 + 高光点 + 方向指示三角箭头
- **蛇身 `drawSnakeSegment()`**（第 1280-1311 行）: 圆角矩形 + 线性渐变（RGB 从头部亮到尾部暗/透明），解析 `baseColor` 的 RGB 值构建渐变
- **食物 `drawFood()`**（第 1314-1338 行）: 径向渐变光晕（颜色匹配水果）+ emoji 文字渲染（`"Segoe UI Emoji"` 字体）

#### 9. 水果与颜色系统（第 820-851 行）
- **`getFruit(level)`**: 10 级 — 🍎苹果(1)→🍊橙子(2)→🍋柠檬(3)→🍇葡萄(4)→🍓草莓(5)→🍑桃子(6)→🍒樱桃(7)→🥝猕猴桃(8)→🍍菠萝(9)→💎钻石(10+)
- **`getSnakeColor(level)`**: 6 级 — 绿→青→黄→橙→红→紫
- **颜色格式约束**: 所有颜色字符串必须为 `rgba(r, g, b, 1)` 格式，因为 `drawSnakeHead`、`drawSnakeSegment`、`LevelUpParticle.draw` 均使用 `.replace('1)', ...)` 替换 alpha 通道值

#### 10. 自适应与响应式（第 854-893 行）
- **`resizeCanvas()`**: 移动端根据窗口大小动态计算 CSS 显示尺寸（保持 GRID_SIZE 整除），桌面端固定 600px
- **`updateHintText()`**: 移动端显示"点击屏幕开始游戏"，桌面端显示"按空格键开始游戏"
- **CSS 媒体查询断点**: `768px` — `@media (max-width: 768px)` 移动端样式，`@media (min-width: 769px)` 桌面端隐藏 D-pad

#### 11. 升级动画（第 959-1052 行）
- **`levelUpAnimationState`**: 使用 `Date.now()` 计时，持续 1000ms
- Canvas 绘制金色实心箭头 + "Level N" 文字，带 scale 缩放 + fadeIn/fadeOut 透明度动画

#### 12. 初始化入口（第 1341 行）
- `init()` 在文件末尾调用 — **此调用绝不能删除，否则游戏完全无响应**

### 关键 DOM 元素 ID（game.js 中引用）

| ID | 用途 |
|-----|------|
| `gameCanvas` | 游戏画布 |
| `score` / `highScore` / `level` | 实时状态显示 |
| `startBtn` / `pauseBtn` / `resetBtn` | 左栏控制按钮 |
| `restartBtn` | 游戏结束弹窗中"重新开始"按钮 |
| `gameOverModal` | 游戏结束弹窗容器 |
| `finalScore` / `finalHighScore` / `finalLevel` / `finalFruit` | 弹窗中数据显示 |
| `pauseHint` | Canvas 上暂停/倒计时覆盖提示 |
| `startHint` | Canvas 上"按空格/点击屏幕开始"提示 |
| `soundToggleBtn` / `vibeToggleBtn` | 音效/震动切换按钮 |
| `dpadUp` / `dpadDown` / `dpadLeft` / `dpadRight` / `dpadCenter` | D-pad 虚拟方向键按钮 |

### 关键 CSS 类

| 类名 | 用途 | 大致行号 |
|------|------|----------|
| `.main-container` | flex 三栏容器 | ~21 |
| `.sidebar` / `.left-sidebar` / `.right-sidebar` | 左右侧边栏 | ~31 |
| `.game-area` / `.game-stage` | Canvas 容器 | ~204 |
| `.pause-hint` / `.pause-hint.visible` / `.pause-hint.countdown` | 暂停/倒计时覆盖层 | ~220 |
| `.start-hint` | "按空格开始"提示（含闪烁动画） | ~414 |
| `.modal` / `.modal.show` / `.modal-content` | 游戏结束弹窗 | ~275 |
| `.btn-control` / `.btn-restart` | 按钮样式 | ~108 |
| `.btn-icon` / `.btn-icon.muted` | 音效/震动切换按钮 | ~142 |
| `.toggles-row` | 切换按钮行 | ~135 |
| `.dpad-container` / `.dpad` | D-pad 容器（CSS Grid 3×3） | ~434 |
| `.dpad-btn` / `.dpad-up` / `.dpad-down` / `.dpad-left` / `.dpad-right` / `.dpad-center` | D-pad 按钮 | ~453 |
| `.icon-play` | CSS 绘制播放三角图标 | ~496 |
| `.icon-pause` | CSS 绘制暂停双竖线图标 | ~506 |
| `.final-fruit` | 弹窗水果 emoji（含弹跳动画） | ~363 |
| `.result-info` / `.result-item` | 弹窗分数信息 | ~335 |

### 修改 game.js 的注意事项

1. **`init()` 调用必须在文件末尾**（第 1341 行），修改时不要误删。**这是最常见的导致游戏完全无响应的原因** — 函数定义了但从未调用。
2. **`drawFood()` 是文件最后一个函数定义**（第 1314 行），`init()` 的调用语句在其后。新增函数定义放在 `drawFood()` 之前。
3. **蛇的颜色通过 `rgba(r, g, b, 1)` 格式字符串传递**，`drawSnakeHead`/`drawSnakeSegment`/`LevelUpParticle.draw` 均用 `.replace('1)', ...)` 替换 alpha 值生成变体色 — **新增颜色必须保持此格式**。
4. **`levelUpAnimationState` 使用 `Date.now()`**，依赖系统时间，不依赖游戏循环帧率。
5. **震动 pending 机制不可绕过**: 在 `setTimeout(gameLoop)` 回调中不能直接调用 `navigator.vibrate()`（Chrome 会忽略），只能存到 `_pending`，在下一次用户手势（方向键/D-pad）时由 `dirFeedback()` 冲刷。
6. **AudioContext 惰性初始化**: `soundManager.init()` 在首次点击音效按钮时创建，`startGame()` 中也会调用。`resume()` 在每次发声前调用以处理 `suspended` 状态。
7. **方向输入三场景逻辑**: `applyDirection()` 未开始/暂停/倒计时中直接改方向（含反向+自碰保护）；运行中进队列（含反向+自碰保护+队列长度限制）。修改时注意三个场景的区别。
8. **倒计时防竞态**: `startGame()` 和 `togglePause()` 的回调中有双重状态检查（如 `if (gameState.isGameRunning || !startBtn.disabled) return`），防止用户在倒计时期间点击其他按钮导致状态错乱。修改时保持此防护。
9. **粒子颜色覆写**: 吃食物时生成的 Particle 实例会覆写 `draw` 方法以使用水果颜色。如果修改 Particle 类，注意此覆写模式。
10. **D-pad 方向合法性检查**: `setupDpadControls()` 中的 `onDpadDirection()` 额外检查了运行时的方向合法性（不允许同轴连续输入），与 `applyDirection()` 的检查互补。

### 已知陷阱

以下问题曾真实发生过（提交 `671b999`），是修改时的高危区域：

1. **`init()` 被误删** — 在文件末尾新增代码时，如果操作覆盖了最后几行，可能把 `init()` 调用一起删掉。游戏会静默失败：Canvas 不绘制、按钮不响应、键盘事件不触发。
2. **`style.css` 布局样式被截断** — CSS 文件顶部是全局布局样式（`*`、`body`、`.main-container`、`.sidebar` 等，约前 100 行），底部是组件样式。任何"从某行删除到开头"的操作都会同时删掉布局样式，导致三栏布局完全塌陷。修改 CSS 时务必确认顶部 ~100 行不被误删。
3. **`index.html` 重复闭合标签** — `</body></html>` 和 `<script>` 出现两次会导致 HTML 无效。在文件末尾追加内容时注意不要重复已有标签。
4. **触摸事件 `passive: false` 不可省略** — Canvas 的 `touchstart`/`touchmove` 和 D-pad 按钮的 `touchstart` 均设置了 `{ passive: false }` 以允许 `e.preventDefault()`（阻止页面滚动）。如果去掉此选项，移动端滑动会触发页面滚动而非游戏操作。
5. **CSS 媒体查询断点不一致** — 桌面端隐藏 D-pad 用 `@media (min-width: 769px)`，移动端样式用 `@media (max-width: 768px)`。两边的显示/隐藏逻辑必须同步修改，否则 D-pad 可能同时显示或同时隐藏。
