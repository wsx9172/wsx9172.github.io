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
index.html   → 页面结构：三栏布局（左栏-状态/控制 | 中栏-Canvas | 右栏-说明）+ 游戏结束弹窗
style.css    → 样式：flex 三栏布局、按钮、弹窗、暂停提示、Canvas 边框
game.js      → 全部游戏逻辑，单文件 ~900 行
favicon.svg  → 网站图标
```

### 三栏布局依赖链

`index.html` 中使用了 `.main-container`、`.sidebar`、`.left-sidebar`、`.right-sidebar`、`.game-area`、`.stats-panel`、`.stat-item`、`.stat-label` 等 CSS 类，**这些类的样式定义在 `style.css` 中**。如果对应的 CSS 规则被删除，整个页面布局会塌陷。

### game.js 核心架构

- **初始化入口**: `init()` — 注册事件监听、生成食物、首次绘制。**必须在文件末尾调用 `init()`**，否则游戏完全无响应。
- **游戏循环**: `gameLoop()` → `draw()` → `setTimeout(gameLoop, speed)`，非 requestAnimationFrame。
- **渲染层**: Canvas 2D，`CELL_SIZE = CANVAS_SIZE / GRID_SIZE = 600 / 20 = 30px`。
- **粒子系统**: 吃食物时生成 `Particle`，升级时生成 `LevelUpParticle`，均在 `draw()` 中更新和绘制。
- **输入**: 键盘事件（方向键+空格）通过 `directionQueue`（最多缓存 2 个）缓冲方向；触屏滑动通过 `touchstart`/`touchmove` 处理。
- **状态机**: `isGameRunning` + `isPaused` 双标志位，配合 3 秒倒计时（`showCountdown`）。
- **水果系统**: `getFruit(level)` 根据等级返回不同 emoji 和颜色，`getSnakeColor(level)` 控制蛇身颜色。
- **持久化**: `localStorage` 存储最高分。

### 关键 CSS 类

| 类名 | 用途 |
|------|------|
| `.main-container` | flex 三栏容器 |
| `.sidebar` / `.left-sidebar` / `.right-sidebar` | 左右侧边栏 |
| `.game-area` / `.game-stage` | Canvas 容器 |
| `.pause-hint` / `.pause-hint.visible` | 暂停/倒计时覆盖层 |
| `.modal` / `.modal.show` / `.modal-content` | 游戏结束弹窗 |
| `.btn-control` / `.btn-restart` | 按钮样式 |

### 修改 game.js 的注意事项

- `init()` 调用必须在文件末尾，修改时不要误删。**这是最常见的导致游戏完全无响应的原因** — 函数定义了但从未调用。
- `drawFood()` 是文件最后一个函数定义，`init()` 的调用语句在其后。新增函数定义放在 `drawFood()` 之前。
- 蛇的颜色通过 `rgba(r, g, b, 1)` 格式字符串传递，`drawSnakeHead`/`drawSnakeSegment` 用 `.replace('1)', ...)` 替换 alpha 值生成变体色 — **新增颜色必须保持此格式**。
- `levelUpAnimationState` 使用 `Date.now()`，依赖系统时间。

### 已知陷阱

以下问题曾真实发生过（提交 `671b999`），是修改时的高危区域：

1. **`init()` 被误删** — 在文件末尾新增代码时，如果操作覆盖了最后几行，可能把 `init()` 调用一起删掉。游戏会静默失败：Canvas 不绘制、按钮不响应、键盘事件不触发。
2. **`style.css` 布局样式被截断** — CSS 文件顶部是全局布局样式（`*`、`body`、`.main-container`、`.sidebar` 等），底部是组件样式。任何"从某行删除到开头"的操作都会同时删掉布局样式，导致三栏布局完全塌陷。修改 CSS 时务必确认顶部 ~90 行不被误删。
3. **`index.html` 重复闭合标签** — `</body></html>` 和 `<script>` 出现两次会导致 HTML 无效。在文件末尾追加内容时注意不要重复已有标签。
