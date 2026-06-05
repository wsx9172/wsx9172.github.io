// 游戏配置
const GRID_SIZE = 20;
let CANVAS_SIZE = 600;
let CELL_SIZE = CANVAS_SIZE / GRID_SIZE;

// ========== 音效系统 ==========
const soundManager = {
    enabled: true,
    ctx: null,
    bgNodes: null,

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            this.enabled = false;
        }
    },

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.init();
            this.resume();
        } else {
            this.stopBackground();
        }
        return this.enabled;
    },

    _tone(freq, startTime, duration, type, vol) {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(Math.min(vol, 0.3), startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
    },

    // 吃到水果：短促上扬
    eatSound() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        this._tone(523, t, 0.08, 'sine', 0.12);
        this._tone(659, t + 0.05, 0.08, 'sine', 0.12);
        this._tone(784, t + 0.10, 0.10, 'sine', 0.12);
    },

    // 升级：上行琶音
    levelUpSound() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => {
            this._tone(f, t + i * 0.08, 0.12, 'triangle', 0.13);
        });
    },

    // 通关（10级钻石）：庆祝旋律
    victorySound() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
            this._tone(f, t + i * 0.10, 0.15, 'triangle', 0.12);
        });
    },

    // 失败：下行悲鸣
    gameOverSound() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        this._tone(392, t, 0.25, 'sawtooth', 0.06);
        this._tone(330, t + 0.22, 0.25, 'sawtooth', 0.06);
        this._tone(262, t + 0.44, 0.35, 'sawtooth', 0.06);
    },

    // ===== 全局背景音乐：五声音阶旋律循环 =====
    _bgTimer: null,
    _bgNoteIndex: 0,
    _bgTempo: 220, // ms/音符，随等级加快

    // 五声音阶旋律序列（C5→A5 范围，上行下行交替）
    _bgMelody: [
        523, 587, 659, 784, 880,       // C5 D5 E5 G5 A5 上行
        1047, 880, 784, 659, 587,      // C6 A5 G5 E5 D5 下行
        523, 659, 784, 880, 1047,      // C5 E5 G5 A5 C6 跳进
        880, 784, 659, 523, 587,       // A5 G5 E5 C5 D5 收尾
    ],

    startBackground() {
        if (!this.enabled || !this.ctx || this._bgTimer) return;
        this.resume();
        this._bgNoteIndex = 0;
        this._bgTempo = 220;
        this._bgPlayTick();
    },

    _bgPlayTick() {
        if (!this.enabled || !this.ctx) {
            this._bgTimer = null;
            return;
        }
        this.resume();

        const note = this._bgMelody[this._bgNoteIndex];
        const dur = this._bgTempo / 1000;
        const t = this.ctx.currentTime;

        // 主旋律：三角波，轻柔
        this._tone(note, t, dur * 0.75, 'triangle', 0.05);

        // 每 4 拍加低音根音
        if (this._bgNoteIndex % 4 === 0) {
            this._tone(note / 4, t, dur * 1.3, 'sine', 0.025);
        }

        this._bgNoteIndex = (this._bgNoteIndex + 1) % this._bgMelody.length;
        this._bgTimer = setTimeout(() => this._bgPlayTick(), this._bgTempo);
    },

    // 随等级加快 BGM 节奏
    updateBgTempo(level) {
        this._bgTempo = Math.max(75, 220 - (level - 1) * 16);
    },

    stopBackground() {
        if (this._bgTimer) {
            clearTimeout(this._bgTimer);
            this._bgTimer = null;
        }
        if (this.bgNodes) {
            Object.values(this.bgNodes).forEach(n => {
                try { n.stop(); } catch (e) {}
                try { n.disconnect(); } catch (e) {}
            });
            this.bgNodes = null;
        }
    },

    // 游戏进行中的轻击节奏（每步一响）
    stepTick: 0,
    stepSound() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        this.stepTick = (this.stepTick + 1) % 4;
        // 每 4 步一个轻微低频脉冲
        if (this.stepTick === 0) {
            const t = this.ctx.currentTime;
            this._tone(110, t, 0.06, 'sine', 0.03);
        }
    }
};

// ========== 震动反馈系统 ==========
// Chrome 要求 navigator.vibrate() 必须在用户手势同步回调中调用，setTimeout 中调用会被拦截。
// 策略：游戏事件（吃水果/升级/失败）只设置 pending，由下一次方向输入（用户手势）触发。
const hapticManager = {
    enabled: true,
    _supported: typeof navigator.vibrate === 'function',
    _pending: null,

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            try { navigator.vibrate(0); } catch (e) {} // 停止正在进行的震动
        }
        return this.enabled;
    },

    // 必须在用户手势中调用（keydown / touchstart / click）
    _vibrateNow(pattern) {
        if (!this.enabled || !this._supported) return;
        try { navigator.vibrate(pattern); } catch (e) {}
    },

    // 方向变更 + 冲刷 pending 震动。由用户手势直接调用，可靠触发。
    dirFeedback() {
        if (!this.enabled || !this._supported) return;
        if (this._pending !== null) {
            const p = this._pending;
            this._pending = null;
            // 先触发 pending 震动，40ms 间隔后触发方向轻震
            try { navigator.vibrate(Array.isArray(p) ? p.concat([40, 20]) : [p, 40, 20]); } catch (e) {
                try { navigator.vibrate(20); } catch (e2) {}
            }
        } else {
            try { navigator.vibrate(20); } catch (e) {}
        }
    },

    // 以下方法在 setTimeout(gameLoop) 中调用，只存 pending，不直接震动
    eatFeedback()       { this._pending = 30; },
    levelUpFeedback()   { this._pending = [35, 45, 35]; },
    victoryFeedback()   { this._pending = [40, 50, 40, 50, 40, 50, 120]; },
    gameOverFeedback()  { this._pending = 200; }
};

// 游戏状态
const gameState = {
    snake: [
        { x: 10, y: 10 }
    ],
    food: { x: 15, y: 15 },
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    directionQueue: [],  // 键盘输入缓冲
    score: 0,
    highScore: localStorage.getItem('snakeHighScore') || 0,
    level: 1,
    isGameRunning: false,
    isPaused: false,
    gameSpeed: 120
};

// 粒子系统
const particles = [];

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 12;
        this.vy = (Math.random() - 0.5) * 12;
        this.life = 1;
        this.decay = 0.04;
        this.size = Math.random() * 4 + 2;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2; // 重力效果
        this.life -= this.decay;
    }
    
    draw(ctx) {
        ctx.fillStyle = `rgba(255, 150, 100, ${this.life * 0.8})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 升级动画粒子
class LevelUpParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 3;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1;
        this.decay = 0.015;
        this.size = Math.random() * 6 + 3;
        this.color = color;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.98; // 阻力
        this.vy *= 0.98;
        this.life -= this.decay;
    }
    
    draw(ctx) {
        ctx.fillStyle = this.color.replace('1)', `${this.life})`);
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color.replace('1)', '0.5)');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// 获取 DOM 元素
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const highScoreDisplay = document.getElementById('highScore');
const levelDisplay = document.getElementById('level');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const restartBtn = document.getElementById('restartBtn');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreDisplay = document.getElementById('finalScore');
const finalHighScoreDisplay = document.getElementById('finalHighScore');
const pauseHint = document.getElementById('pauseHint');
const startHint = document.getElementById('startHint');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const vibeToggleBtn = document.getElementById('vibeToggleBtn');

let countdownTimer = null;

// 触屏状态
let touchStartX = 0;
let touchStartY = 0;

// 初始化
function init() {
    highScoreDisplay.textContent = gameState.highScore;
    pauseHint.textContent = '';
    updateDisplay();
    addEventListeners();
    setupDpadControls();
    generateFood();
    updateHintText();
    resizeCanvas();
    draw(); // 确保首次绘制（resizeCanvas 尺寸未变时会跳过 draw）
}

// 添加事件监听
function addEventListeners() {
    document.addEventListener('keydown', handleKeyPress);
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('touchstart', handleTouchStart, false);
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', togglePause);
    resetBtn.addEventListener('click', resetGame);
    restartBtn.addEventListener('click', restartGame);

    // 音效开关
    soundToggleBtn.addEventListener('click', () => {
        soundManager.init(); // 首次点击初始化 AudioContext
        const on = soundManager.toggle();
        soundToggleBtn.textContent = on ? '🔊' : '🔇';
        soundToggleBtn.classList.toggle('muted', !on);
    });

    vibeToggleBtn.addEventListener('click', () => {
        const on = hapticManager.toggle();
        vibeToggleBtn.textContent = on ? '📳' : '🔕';
        vibeToggleBtn.classList.toggle('muted', !on);
    });
}

// 键盘事件处理 - 带输入缓冲
function handleKeyPress(event) {
    const key = event.key;
    let direction = null;
    
    switch (key) {
        case 'ArrowUp':
            if (gameState.direction.y === 0 && (gameState.directionQueue.length === 0 || gameState.directionQueue[gameState.directionQueue.length - 1].y === 0)) {
                direction = { x: 0, y: -1 };
            }
            event.preventDefault();
            break;
        case 'ArrowDown':
            if (gameState.direction.y === 0 && (gameState.directionQueue.length === 0 || gameState.directionQueue[gameState.directionQueue.length - 1].y === 0)) {
                direction = { x: 0, y: 1 };
            }
            event.preventDefault();
            break;
        case 'ArrowLeft':
            if (gameState.direction.x === 0 && (gameState.directionQueue.length === 0 || gameState.directionQueue[gameState.directionQueue.length - 1].x === 0)) {
                direction = { x: -1, y: 0 };
            }
            event.preventDefault();
            break;
        case 'ArrowRight':
            if (gameState.direction.x === 0 && (gameState.directionQueue.length === 0 || gameState.directionQueue[gameState.directionQueue.length - 1].x === 0)) {
                direction = { x: 1, y: 0 };
            }
            event.preventDefault();
            break;
        case ' ':
            if (gameOverModal.classList.contains('show')) {
                restartGame();
            } else if (!gameState.isGameRunning && !countdownTimer) {
                // 游戏未开始且没有倒计时时，按空格开始游戏
                startGame();
            } else if (gameState.isGameRunning) {
                togglePause();
            }
            event.preventDefault();
            break;
    }

    if (direction) {
        applyDirection(direction);
    }
}

// 应用方向变更（未开始/暂停时直接生效改眼睛，运行时进队列）
function applyDirection(direction) {
    if (!gameState.isGameRunning || gameState.isPaused) {
        // 未开始或暂停：直接更新蛇头朝向，不允许反向
        if (direction.x === -gameState.direction.x && direction.y === -gameState.direction.y) return;
        if (direction.x === 0 && direction.y === 0) return;
        gameState.direction = direction;
        gameState.nextDirection = direction;
        gameState.directionQueue = [];
        draw();
    } else {
        // 运行中：正常入队
        if (gameState.directionQueue.length < 2) {
            gameState.directionQueue.push(direction);
        }
        gameState.nextDirection = direction;
        hapticManager.dirFeedback();
    }
}

// 触屏事件处理
function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}

function handleTouchMove(e) {
    e.preventDefault();
    
    const touchEndX = e.touches[0].clientX;
    const touchEndY = e.touches[0].clientY;
    
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    
    // 只有滑动距离足够时才响应
    const minSwipeDistance = 30;
    
    if (Math.abs(deltaX) > minSwipeDistance || Math.abs(deltaY) > minSwipeDistance) {
        let direction = null;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 水平滑动
            if (deltaX > 0 && gameState.direction.x === 0) {
                direction = { x: 1, y: 0 };
            } else if (deltaX < 0 && gameState.direction.x === 0) {
                direction = { x: -1, y: 0 };
            }
        } else {
            // 垂直滑动
            if (deltaY > 0 && gameState.direction.y === 0) {
                direction = { x: 0, y: 1 };
            } else if (deltaY < 0 && gameState.direction.y === 0) {
                direction = { x: 0, y: -1 };
            }
        }
        
        if (direction) {
            applyDirection(direction);
            touchStartX = touchEndX;
            touchStartY = touchEndY;
        }
    }
}

// 开始游戏
function startGame() {
    if (gameState.isGameRunning || countdownTimer) {
        return;
    }

    soundManager.init();

    // 冲刷可能存在的 game over pending 震动（用户手势中触发）
    if (hapticManager._pending !== null) {
        hapticManager._vibrateNow(hapticManager._pending);
        hapticManager._pending = null;
    }

    // 隐藏开始提示
    if (startHint) {
        startHint.style.display = 'none';
    }

    gameState.isGameRunning = false;
    gameState.isPaused = false;
    startBtn.disabled = true;
    pauseBtn.disabled = true;

    showCountdown(() => {
        gameState.isGameRunning = true;
        gameState.isPaused = false;
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        updateDpadCenterIcon();

        // 隐藏鼠标
        canvas.style.cursor = 'none';

        soundManager.startBackground();

        gameLoop();
    });
}

function clearCountdownTimer() {
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }
}

// 显示倒计时
function showCountdown(callback) {
    clearCountdownTimer();
    let remainingSeconds = 3;

    function countdownTick() {
        pauseHint.textContent = remainingSeconds;
        pauseHint.classList.add('visible', 'countdown');

        remainingSeconds -= 1;
        if (remainingSeconds >= 0) {
            countdownTimer = setTimeout(countdownTick, 1000);
            return;
        }

        clearCountdownTimer();
        pauseHint.classList.remove('visible', 'countdown');
        pauseHint.textContent = '';

        if (callback) {
            callback();
        }
    }

    countdownTimer = setTimeout(countdownTick, 1000);
}

// 暂停/继续
function togglePause() {
    if (gameState.isGameRunning) {
        gameState.isPaused = !gameState.isPaused;
        pauseBtn.textContent = gameState.isPaused ? '▶ 继续' : '⏸ 暂停';
        updateDpadCenterIcon();
        
        if (gameState.isPaused) {
            pauseHint.textContent = '已暂停';
            pauseHint.classList.add('visible');

            // 暂停时显示鼠标
            canvas.style.cursor = 'default';

            // 暂停背景音乐
            soundManager.stopBackground();
        } else {
            // 从暂停恢复时显示倒计时
            pauseBtn.disabled = true;
            showCountdown(() => {
                pauseBtn.disabled = false;

                // 恢复游戏后隐藏鼠标
                canvas.style.cursor = 'none';
                updateDpadCenterIcon();

                // 恢复背景音乐
                soundManager.startBackground();
                soundManager.updateBgTempo(gameState.level);

                gameLoop();
            });
        }
    }
}

// 重置游戏
function resetGame() {
    clearCountdownTimer();
    gameState.snake = [{ x: 10, y: 10 }];
    gameState.direction = { x: 1, y: 0 };
    gameState.nextDirection = { x: 1, y: 0 };
    gameState.directionQueue = [];
    gameState.score = 0;
    gameState.level = 1;
    gameState.gameSpeed = 120;
    gameState.isGameRunning = false;
    gameState.isPaused = false;
    particles.length = 0;  // 清空粒子
    updateDpadCenterIcon();
    soundManager.stopBackground();

    startBtn.textContent = '▶ 开始';
    startBtn.disabled = false;
    pauseBtn.textContent = '⏸ 暂停';
    pauseBtn.disabled = true;
    pauseHint.textContent = '';
    pauseHint.classList.remove('visible');
    
    // 显示开始提示
    if (startHint) {
        updateHintText();
        startHint.style.display = 'block';
    }

    // 重置时显示鼠标
    canvas.style.cursor = 'default';

    generateFood();
    updateDisplay();
    draw();
    gameOverModal.classList.remove('show');
}

// 重新开始
function restartGame() {
    // 在用户手势中立即触发游戏结束震动
    if (hapticManager._pending !== null) {
        hapticManager._vibrateNow(hapticManager._pending);
        hapticManager._pending = null;
    }
    resetGame();
    startGame();
}

// 游戏循环
function gameLoop() {
    if (gameState.isPaused || !gameState.isGameRunning) {
        return;
    }

    // 从队列中获取下一个方向
    if (gameState.directionQueue.length > 0) {
        gameState.nextDirection = gameState.directionQueue.shift();
    }
    
    // 更新蛇的方向
    gameState.direction = gameState.nextDirection;

    // 计算新的蛇头位置
    const head = gameState.snake[0];
    const newHead = {
        x: head.x + gameState.direction.x,
        y: head.y + gameState.direction.y
    };

    // 检查碰撞（边界）
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || 
        newHead.y < 0 || newHead.y >= GRID_SIZE) {
        endGame();
        return;
    }

    // 检查碰撞（自身）
    if (gameState.snake.some(segment => 
        segment.x === newHead.x && segment.y === newHead.y)) {
        endGame();
        return;
    }

    // 添加新头
    gameState.snake.unshift(newHead);

    // 检查是否吃到食物
    if (newHead.x === gameState.food.x && newHead.y === gameState.food.y) {
        // 获取当前水果信息
        const fruit = getFruit(gameState.level);
        
        // 生成粒子效果（使用水果颜色）
        const foodScreenX = gameState.food.x * CELL_SIZE + CELL_SIZE / 2;
        const foodScreenY = gameState.food.y * CELL_SIZE + CELL_SIZE / 2;
        for (let i = 0; i < 8; i++) {
            const particle = new Particle(foodScreenX, foodScreenY);
            // 修改粒子颜色为水果颜色
            const rgbMatch = fruit.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (rgbMatch) {
                const r = parseInt(rgbMatch[1]);
                const g = parseInt(rgbMatch[2]);
                const b = parseInt(rgbMatch[3]);
                particle.draw = function(ctx) {
                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${this.life * 0.8})`;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                    ctx.fill();
                };
            }
            particles.push(particle);
        }
        
        gameState.score += gameState.level;
        soundManager.eatSound();
        hapticManager.eatFeedback();

        // 检查是否升级
        const foodEaten = Math.floor(gameState.score / gameState.level);
        const newLevel = Math.floor(foodEaten / 10) + 1;
        if (newLevel > gameState.level) {
            gameState.level = newLevel;
            gameState.gameSpeed = Math.max(50, 120 - (gameState.level - 1) * 10);

            soundManager.levelUpSound();
            hapticManager.levelUpFeedback();
            soundManager.updateBgTempo(gameState.level);
            if (gameState.level === 10) {
                soundManager.victorySound();
                hapticManager.victoryFeedback();
            }

            // 触发升级动画
            triggerLevelUpAnimation();
        }

        generateFood();
        updateDisplay();
    } else {
        // 移除尾部
        gameState.snake.pop();
    }

    // 绘制游戏
    draw();

    // 递归调用下一次循环
    soundManager.stepSound();
    setTimeout(gameLoop, gameState.gameSpeed);
}

// 生成食物
function generateFood() {
    // 蛇占满网格 → 玩家胜利
    if (gameState.snake.length >= GRID_SIZE * GRID_SIZE) {
        endGame();
        return;
    }

    let foodX, foodY;
    let isOnSnake;

    do {
        foodX = Math.floor(Math.random() * GRID_SIZE);
        foodY = Math.floor(Math.random() * GRID_SIZE);
        isOnSnake = gameState.snake.some(segment =>
            segment.x === foodX && segment.y === foodY);
    } while (isOnSnake);

    gameState.food = { x: foodX, y: foodY };
}

// 获取蛇的颜色（根据等级）
function getSnakeColor(level) {
    const colors = [
        'rgba(76, 255, 0, 1)',      // 1级 - 绿色
        'rgba(0, 255, 255, 1)',     // 2级 - 青色
        'rgba(255, 255, 0, 1)',     // 3级 - 黄色
        'rgba(255, 165, 0, 1)',     // 4级 - 橙色
        'rgba(255, 100, 100, 1)',   // 5级 - 红色
        'rgba(255, 0, 255, 1)',     // 6级+ - 紫色
    ];
    
    const index = Math.min(level - 1, colors.length - 1);
    return colors[index];
}

// 获取水果（根据等级）
function getFruit(level) {
    const fruits = [
        { emoji: '🍎', name: '苹果', value: 1, color: 'rgba(255, 100, 100, 1)' },      // 1级
        { emoji: '🍊', name: '橙子', value: 2, color: 'rgba(255, 165, 0, 1)' },       // 2级
        { emoji: '🍋', name: '柠檬', value: 3, color: 'rgba(255, 255, 0, 1)' },       // 3级
        { emoji: '🍇', name: '葡萄', value: 4, color: 'rgba(128, 0, 128, 1)' },       // 4级
        { emoji: '🍓', name: '草莓', value: 5, color: 'rgba(255, 20, 147, 1)' },      // 5级
        { emoji: '🍑', name: '桃子', value: 6, color: 'rgba(255, 182, 193, 1)' },     // 6级
        { emoji: '🍒', name: '樱桃', value: 7, color: 'rgba(220, 20, 60, 1)' },       // 7级
        { emoji: '🥝', name: '猕猴桃', value: 8, color: 'rgba(107, 142, 35, 1)' },    // 8级
        { emoji: '🍍', name: '菠萝', value: 9, color: 'rgba(255, 215, 0, 1)' },       // 9级
        { emoji: '💎', name: '钻石', value: 10, color: 'rgba(0, 191, 255, 1)' },      // 10级+
    ];
    
    const index = Math.min(level - 1, fruits.length - 1);
    return fruits[index];
}

// 自适应画布大小
function resizeCanvas() {
    const isMobile = window.innerWidth <= 768;
    let newSize;
    if (isMobile) {
        const padding = 32;
        const maxWidth = window.innerWidth - padding;
        newSize = Math.floor(maxWidth / GRID_SIZE) * GRID_SIZE;
        newSize = Math.max(300, newSize);
        const maxHeight = window.innerHeight - 400;
        newSize = Math.min(newSize, Math.floor(maxHeight / GRID_SIZE) * GRID_SIZE);
    } else {
        newSize = 600;
    }

    if (newSize === CANVAS_SIZE) return;

    CANVAS_SIZE = newSize;
    CELL_SIZE = CANVAS_SIZE / GRID_SIZE;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    updateHintText();
    draw();
}

// 根据设备更新提示文字
function updateHintText() {
    if (!startHint) return;
    const isMobile = window.innerWidth <= 768;
    startHint.textContent = isMobile ? '点击屏幕开始游戏' : '按空格键开始游戏';
}

// 更新 D-pad 中央按钮图标
function updateDpadCenterIcon() {
    const dpadCenter = document.getElementById('dpadCenter');
    if (!dpadCenter) return;
    if (gameState.isGameRunning && !gameState.isPaused) {
        dpadCenter.textContent = '⏸';
    } else {
        dpadCenter.textContent = '▶';
    }
}

// 移动端虚拟方向键
function setupDpadControls() {
    const dpadUp = document.getElementById('dpadUp');
    const dpadDown = document.getElementById('dpadDown');
    const dpadLeft = document.getElementById('dpadLeft');
    const dpadRight = document.getElementById('dpadRight');
    const dpadCenter = document.getElementById('dpadCenter');

    if (!dpadUp) return; // 无 D-pad（桌面端不渲染）则跳过

    function onDpadDirection(direction, e) {
        e.preventDefault();

        // 运行时检查方向合法性
        if (!gameState.isPaused) {
            const lastDir = gameState.directionQueue.length > 0
                ? gameState.directionQueue[gameState.directionQueue.length - 1]
                : gameState.direction;
            if (direction.x !== 0 && lastDir.x !== 0) return;
            if (direction.y !== 0 && lastDir.y !== 0) return;
        }

        applyDirection(direction);
    }

    function onDpadCenter(e) {
        e.preventDefault();
        if (!gameState.isGameRunning && !countdownTimer) {
            startGame();
        } else if (gameState.isGameRunning) {
            togglePause();
        }
    }

    dpadUp.addEventListener('touchstart', (e) => onDpadDirection({ x: 0, y: -1 }, e), { passive: false });
    dpadUp.addEventListener('mousedown', (e) => onDpadDirection({ x: 0, y: -1 }, e));
    dpadDown.addEventListener('touchstart', (e) => onDpadDirection({ x: 0, y: 1 }, e), { passive: false });
    dpadDown.addEventListener('mousedown', (e) => onDpadDirection({ x: 0, y: 1 }, e));
    dpadLeft.addEventListener('touchstart', (e) => onDpadDirection({ x: -1, y: 0 }, e), { passive: false });
    dpadLeft.addEventListener('mousedown', (e) => onDpadDirection({ x: -1, y: 0 }, e));
    dpadRight.addEventListener('touchstart', (e) => onDpadDirection({ x: 1, y: 0 }, e), { passive: false });
    dpadRight.addEventListener('mousedown', (e) => onDpadDirection({ x: 1, y: 0 }, e));
    dpadCenter.addEventListener('touchstart', (e) => onDpadCenter(e), { passive: false });
    dpadCenter.addEventListener('mousedown', (e) => onDpadCenter(e));
}

// 触发升级动画
function triggerLevelUpAnimation() {
    const color = getSnakeColor(gameState.level);
    
    // 在蛇头位置生成升级粒子
    const head = gameState.snake[0];
    const centerX = head.x * CELL_SIZE + CELL_SIZE / 2;
    const centerY = head.y * CELL_SIZE + CELL_SIZE / 2;
    
    for (let i = 0; i < 30; i++) {
        particles.push(new LevelUpParticle(centerX, centerY, color));
    }
    
    // 显示升级提示（使用Canvas绘制）
    showLevelUpMessage();
}

// 显示升级提示（在Canvas上绘制）
let levelUpAnimationState = {
    active: false,
    startTime: 0,
    duration: 1000, // 1秒
    level: 1
};

function showLevelUpMessage() {
    levelUpAnimationState.active = true;
    levelUpAnimationState.startTime = Date.now();
    levelUpAnimationState.level = gameState.level;
}

// 绘制升级动画
function drawLevelUpAnimation() {
    if (!levelUpAnimationState.active) return;
    
    const elapsed = Date.now() - levelUpAnimationState.startTime;
    const progress = Math.min(elapsed / levelUpAnimationState.duration, 1);
    
    if (progress >= 1) {
        levelUpAnimationState.active = false;
        return;
    }
    
    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE / 2 - 50;
    
    // 计算透明度（快速淡入淡出，最大 0.75）
    let opacity;
    if (progress < 0.12) {
        opacity = progress / 0.12;
    } else if (progress > 0.85) {
        opacity = (1 - progress) / 0.15;
    } else {
        opacity = 1;
    }
    opacity *= 0.75;

    // 计算缩放效果
    const scale = 1 + Math.sin(progress * Math.PI) * 0.15;
    
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    
    // 绘制向上箭头（实心填充）
    const arrowColor = 'rgba(255, 215, 0, 1)'; // 金色

    // 箭头多边形：宽箭头，有厚度
    const bodyHalfWidth = 14;  // 箭身半宽
    const headHalfWidth = 22;  // 箭头头部半宽
    const arrowTop = -22;      // 箭头尖端
    const arrowBottom = 22;    // 箭身底部

    // 发光效果
    ctx.shadowBlur = 20;
    ctx.shadowColor = arrowColor;

    // 绘制实心箭头
    ctx.fillStyle = arrowColor;
    ctx.beginPath();
    ctx.moveTo(0, arrowTop);                                    // 尖端
    ctx.lineTo(headHalfWidth, arrowTop + 12);                   // 右箭头翼
    ctx.lineTo(bodyHalfWidth, arrowTop + 12);                   // 右肩
    ctx.lineTo(bodyHalfWidth, arrowBottom);                     // 右下角
    ctx.lineTo(-bodyHalfWidth, arrowBottom);                    // 左下角
    ctx.lineTo(-bodyHalfWidth, arrowTop + 12);                  // 左肩
    ctx.lineTo(-headHalfWidth, arrowTop + 12);                  // 左箭头翼
    ctx.closePath();
    ctx.fill();

    // 高亮描边
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();

    // 绘制等级文字
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255, 215, 0, 1)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    ctx.fillText(`Level ${levelUpAnimationState.level}`, centerX, centerY + 50);
    ctx.restore();
}

// 游戏结束
function endGame() {
    clearCountdownTimer();
    gameState.isGameRunning = false;
    gameState.isPaused = false;
    pauseHint.textContent = '';
    pauseHint.classList.remove('visible');
    particles.length = 0;  // 清空粒子
    updateDpadCenterIcon();

    soundManager.stopBackground();
    soundManager.gameOverSound();
    hapticManager.gameOverFeedback();

    // 更新最高分
    if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        localStorage.setItem('snakeHighScore', gameState.highScore);
        highScoreDisplay.textContent = gameState.highScore;
    }

    // 显示游戏结束模态
    finalScoreDisplay.textContent = gameState.score;
    finalHighScoreDisplay.textContent = gameState.highScore;
    document.getElementById('finalLevel').textContent = gameState.level;
    const fruit = getFruit(gameState.level);
    document.getElementById('finalFruit').textContent = fruit.emoji;
    gameOverModal.classList.add('show');

    // 重置按钮状态
    startBtn.textContent = '▶ 开始';
    startBtn.disabled = false;
    pauseBtn.textContent = '⏸ 暂停';
    pauseBtn.disabled = true;
    
    // 显示开始提示
    if (startHint) {
        updateHintText();
        startHint.style.display = 'block';
    }
    
    // 游戏结束时显示鼠标
    canvas.style.cursor = 'default';
}

// 更新显示
function updateDisplay() {
    scoreDisplay.textContent = gameState.score;
    levelDisplay.textContent = gameState.level;
}

// 绘制游戏
function draw() {
    // 清空画布并填充背景
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 绘制网格背景
    ctx.strokeStyle = 'rgba(102, 126, 234, 0.1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i * CELL_SIZE);
        ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
        ctx.stroke();
    }

    // 绘制蛇
    const snakeColor = getSnakeColor(gameState.level);
    gameState.snake.forEach((segment, index) => {
        const x = segment.x * CELL_SIZE;
        const y = segment.y * CELL_SIZE;
        const size = CELL_SIZE - 2;

        if (index === 0) {
            // 绘制蛇头
            drawSnakeHead(x, y, size, snakeColor);
        } else {
            // 绘制蛇身，颜色渐变
            const opacity = 1 - (index / gameState.snake.length) * 0.5;
            drawSnakeSegment(x, y, size, opacity, index, snakeColor);
        }
    });

    // 绘制食物
    drawFood(gameState.food.x * CELL_SIZE, gameState.food.y * CELL_SIZE);
    
    // 绘制粒子并更新它们的生命周期
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw(ctx);
        
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
    
    // 绘制升级动画
    drawLevelUpAnimation();
}

// 绘制蛇头
function drawSnakeHead(x, y, size, baseColor) {
    // 蛇头主体 - 圆角矩形
    const radius = size / 2;
    ctx.fillStyle = baseColor.replace('1)', '0.95)');
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + size - radius, y);
    ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
    ctx.lineTo(x + size, y + size - radius);
    ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
    ctx.lineTo(x + radius, y + size);
    ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();

    // 蛇头发光效果
    const glowColor = baseColor.replace('1)', '0.3)');
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.moveTo(x + radius, y - 1);
    ctx.lineTo(x + size - radius, y - 1);
    ctx.quadraticCurveTo(x + size + 1, y, x + size + 1, y + radius);
    ctx.lineTo(x + size + 1, y + size - radius);
    ctx.quadraticCurveTo(x + size + 1, y + size + 1, x + size - radius, y + size + 1);
    ctx.lineTo(x + radius, y + size + 1);
    ctx.quadraticCurveTo(x - 1, y + size, x - 1, y + size - radius);
    ctx.lineTo(x - 1, y + radius);
    ctx.quadraticCurveTo(x - 1, y - 1, x + radius, y - 1);
    ctx.fill();

    // 绘制眼睛
    const eyeSize = size * 0.18;
    const eyeGap = size * 0.08;
    let eye1X = x + size / 2 - eyeGap;
    let eye1Y = y + size / 2 - eyeGap;
    let eye2X = x + size / 2 + eyeGap;
    let eye2Y = y + size / 2 - eyeGap;

    // 根据方向调整眼睛位置
    if (gameState.direction.x > 0) {
        eye1X = x + size - eyeSize * 2;
        eye1Y = y + size / 2 - eyeSize / 2;
        eye2X = x + size - eyeSize * 2;
        eye2Y = y + size / 2 + eyeSize / 2;
    } else if (gameState.direction.x < 0) {
        eye1X = x + eyeSize / 2;
        eye1Y = y + size / 2 - eyeSize / 2;
        eye2X = x + eyeSize / 2;
        eye2Y = y + size / 2 + eyeSize / 2;
    } else if (gameState.direction.y < 0) {
        eye1X = x + size / 2 - eyeSize / 2;
        eye1Y = y + eyeSize / 2;
        eye2X = x + size / 2 + eyeSize / 2;
        eye2Y = y + size / 2;
    } else if (gameState.direction.y > 0) {
        eye1X = x + size / 2 - eyeSize / 2;
        eye1Y = y + size - eyeSize * 2;
        eye2X = x + size / 2 + eyeSize / 2;
        eye2Y = y + size - eyeSize * 2;
    }

    // 绘制眼白
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eye1X, eye1Y, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eye2X, eye2Y, eyeSize, 0, Math.PI * 2);
    ctx.fill();

    // 增强方向指示效果
    ctx.save();
    const indicatorColor = baseColor.replace('1)', '0.25)');
    ctx.fillStyle = indicatorColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = baseColor.replace('1)', '0.8)');
    ctx.beginPath();
    if (gameState.direction.x > 0) {
        ctx.moveTo(x + size * 0.78, y + size * 0.35);
        ctx.lineTo(x + size * 1.04, y + size * 0.5);
        ctx.lineTo(x + size * 0.78, y + size * 0.65);
    } else if (gameState.direction.x < 0) {
        ctx.moveTo(x + size * 0.22, y + size * 0.35);
        ctx.lineTo(x - size * 0.04, y + size * 0.5);
        ctx.lineTo(x + size * 0.22, y + size * 0.65);
    } else if (gameState.direction.y < 0) {
        ctx.moveTo(x + size * 0.35, y + size * 0.22);
        ctx.lineTo(x + size * 0.5, y - size * 0.04);
        ctx.lineTo(x + size * 0.65, y + size * 0.22);
    } else {
        ctx.moveTo(x + size * 0.35, y + size * 0.78);
        ctx.lineTo(x + size * 0.5, y + size * 1.04);
        ctx.lineTo(x + size * 0.65, y + size * 0.78);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 绘制瞳孔
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(eye1X, eye1Y, eyeSize * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eye2X, eye2Y, eyeSize * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // 绘制高光
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eye1X - eyeSize * 0.3, eye1Y - eyeSize * 0.3, eyeSize * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eye2X - eyeSize * 0.3, eye2Y - eyeSize * 0.3, eyeSize * 0.2, 0, Math.PI * 2);
    ctx.fill();
}

// 绘制蛇身体
function drawSnakeSegment(x, y, size, opacity, index, baseColor) {
    // 从基础颜色提取RGB值
    const rgbMatch = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        
        // 蛇身 - 圆角矩形，颜色渐变
        const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity * 0.9})`);
        gradient.addColorStop(1, `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, ${opacity * 0.8})`);
        
        ctx.fillStyle = gradient;
    } else {
        // 备用方案
        ctx.fillStyle = `rgba(76, 255, 0, ${opacity * 0.9})`;
    }
    
    const radius = size / 4;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + size - radius, y);
    ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
    ctx.lineTo(x + size, y + size - radius);
    ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
    ctx.lineTo(x + radius, y + size);
    ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();
}

// 绘制食物
function drawFood(x, y) {
    const size = CELL_SIZE - 2;
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    
    // 获取当前等级的水果
    const fruit = getFruit(gameState.level);

    // 画水果外圈光晕（使用水果对应颜色）
    const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size);
    glowGradient.addColorStop(0, fruit.color.replace('1)', '0.35)'));
    glowGradient.addColorStop(1, fruit.color.replace('1)', '0)'));
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
    ctx.fill();

    // 用水果 emoji 作为食物图形
    ctx.save();
    ctx.font = `${Math.max(16, size * 0.9)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fruit.emoji, centerX, centerY + 1);
    ctx.restore();
}

// 初始化游戏
init();