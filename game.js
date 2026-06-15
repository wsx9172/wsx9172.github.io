// 游戏配置
const MIN_GRID = 20;       // 最小格子数
const MOBILE_CELL = 30;    // 移动端固定格子像素

// 运行时变量（桌面端动态调整，resizeCanvas 中更新）
let gridCols = MIN_GRID;
let gridRows = MIN_GRID;
let cellSize = MOBILE_CELL;

// 长按加速倍率
const SPEED_BOOST_MULTIPLIER = 1.5;

// 难度配置
const DIFFICULTY = {
    easy:   { label: '简单', initialSpeed: 220, speedDecrement: 3,  minSpeed: 100 },
    normal: { label: '普通', initialSpeed: 180, speedDecrement: 5,  minSpeed: 80 },
    hard:   { label: '困难', initialSpeed: 140, speedDecrement: 7,  minSpeed: 50 }
};

// ========== 音效系统 ==========
const soundManager = {
    enabled: true,
    ctx: null,

    init() {
        // 如果 ctx 已关闭则重建
        if (this.ctx && this.ctx.state === 'closed') {
            this.ctx = null;
        }
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

    // UI 点击反馈：短促清脆
    clickSound() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        this._tone(880, t, 0.04, 'sine', 0.06);
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
    _bgTempo: 220,        // ms/音符，随等级加快
    _boostMultiplier: 1,  // 加速倍率，长按时为 SPEED_BOOST_MULTIPLIER

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
        this._bgTimer = setTimeout(() => this._bgPlayTick(), this._bgTempo / this._boostMultiplier);
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
    }

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
    difficulty: 'normal',
    gameSpeed: DIFFICULTY.normal.initialSpeed,
    speedBoosted: false
};

// 暂停/未运行时锁定的运动方向，用于反向检查参照
// 暂停期间用户可自由旋转蛇头，只禁止与锁定方向相反的方向
let pausedDirection = { x: 1, y: 0 };

// 统一设置加速状态（同步 BGM 节奏）
function setSpeedBoost(on) {
    gameState.speedBoosted = on;
    soundManager._boostMultiplier = on ? SPEED_BOOST_MULTIPLIER : 1;
}

// 粒子系统
const particles = [];

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.life = 1;
        this.decay = 0.10;
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
        const speed = Math.random() * 4 + 1.5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1;
        this.decay = 0.04;
        this.size = Math.random() * 4 + 2;
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
const restartBtn = document.getElementById('restartBtn');
const homeBtn = document.getElementById('homeBtn');
const shareBtn = document.getElementById('shareBtn');
const diffEasy = document.getElementById('diffEasy');
const diffNormal = document.getElementById('diffNormal');
const diffHard = document.getElementById('diffHard');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreDisplay = document.getElementById('finalScore');
const finalHighScoreDisplay = document.getElementById('finalHighScore');
const pauseHint = document.getElementById('pauseHint');
const startHint = document.getElementById('startHint');
const soundToggleBtn = document.getElementById('soundToggleBtn');

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
    draw(); // 确保首次绘制
    // 等布局完成后再算一次（flex 布局可能在首次调用时未就绪）
    requestAnimationFrame(() => {
        resizeCanvas();
        draw();
    });
}

// 添加事件监听
function addEventListeners() {
    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleCanvasTap);
    canvas.addEventListener('click', handleCanvasTap);
    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', togglePause);
    restartBtn.addEventListener('click', restartGame);
    homeBtn.addEventListener('click', goHome);
    shareBtn.addEventListener('click', shareGame);

    // 难度切换
    diffEasy.addEventListener('click', () => setDifficulty('easy'));
    diffNormal.addEventListener('click', () => setDifficulty('normal'));
    diffHard.addEventListener('click', () => setDifficulty('hard'));

    // 音效开关
    soundToggleBtn.addEventListener('click', () => {
        soundManager.init(); // 首次点击初始化 AudioContext
        // 关闭前先播放点击音效（此时音效仍开启，用户能听到关闭反馈）
        if (soundManager.enabled) {
            soundManager.clickSound();
        }
        const on = soundManager.toggle();
        // 开启后也播放点击音效（此时音效已开启，用户能听到开启反馈）
        if (on) {
            soundManager.clickSound();
        }
        soundToggleBtn.textContent = on ? '🔊' : '🔇';
        soundToggleBtn.classList.toggle('muted', !on);
        // 重新开启音效时，如果游戏正在运行，恢复背景音乐
        if (on && gameState.isGameRunning && !gameState.isPaused) {
            soundManager.startBackground();
            soundManager.updateBgTempo(gameState.level);
        }
    });
}

// 键盘事件处理 - 带输入缓冲
function handleKeyPress(event) {
    const key = event.key;
    let direction = null;
    
    // 运行中的输入检查较严（同轴不连续输入），暂停/未运行时由 applyDirection 统一校验
    const isActivelyRunning = gameState.isGameRunning && !gameState.isPaused && !countdownTimer;

    switch (key) {
        case 'ArrowUp':
            if (!isActivelyRunning || (gameState.direction.y === 0 && (gameState.directionQueue.length === 0 || gameState.directionQueue[gameState.directionQueue.length - 1].y === 0))) {
                direction = { x: 0, y: -1 };
            }
            event.preventDefault();
            break;
        case 'ArrowDown':
            if (!isActivelyRunning || (gameState.direction.y === 0 && (gameState.directionQueue.length === 0 || gameState.directionQueue[gameState.directionQueue.length - 1].y === 0))) {
                direction = { x: 0, y: 1 };
            }
            event.preventDefault();
            break;
        case 'ArrowLeft':
            if (!isActivelyRunning || (gameState.direction.x === 0 && (gameState.directionQueue.length === 0 || gameState.directionQueue[gameState.directionQueue.length - 1].x === 0))) {
                direction = { x: -1, y: 0 };
            }
            event.preventDefault();
            break;
        case 'ArrowRight':
            if (!isActivelyRunning || (gameState.direction.x === 0 && (gameState.directionQueue.length === 0 || gameState.directionQueue[gameState.directionQueue.length - 1].x === 0))) {
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
            } else if (gameState.isGameRunning && !countdownTimer) {
                // 游戏运行中且没有倒计时时，可以暂停/继续
                togglePause();
            }
            event.preventDefault();
            break;
    }

    if (direction) {
        applyDirection(direction);
    }

    // 方向键长按加速（键盘 repeat 事件）
    if (event.repeat && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        setSpeedBoost(true);
    }
}

// 键盘松开：取消加速
function handleKeyUp(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        setSpeedBoost(false);
    }
}

// 应用方向变更（未开始/暂停/倒计时时直接生效改眼睛，运行时进队列）
function applyDirection(direction) {
    if (!gameState.isGameRunning || gameState.isPaused || countdownTimer) {
        // 未开始、暂停或倒计时中：直接更新蛇头朝向
        // 只禁止与锁定方向相反的方向（暂停期间可自由旋转蛇头）
        if (direction.x === -pausedDirection.x && direction.y === -pausedDirection.y) return;
        if (direction.x === 0 && direction.y === 0) return;
        // 不允许朝向身体（避免游戏一开始就碰撞自己）
        const head = gameState.snake[0];
        const nextX = head.x + direction.x;
        const nextY = head.y + direction.y;
        if (gameState.snake.some(seg => seg.x === nextX && seg.y === nextY)) return;
        gameState.direction = direction;
        gameState.nextDirection = direction;
        gameState.directionQueue = [];
        draw();
    } else {
        // 运行中：检查反向和朝向身体的保护
        const lastDir = gameState.directionQueue.length > 0
            ? gameState.directionQueue[gameState.directionQueue.length - 1]
            : gameState.direction;
        
        // 不允许反向
        if (direction.x === -lastDir.x && direction.y === -lastDir.y) return;
        if (direction.x === 0 && direction.y === 0) return;
        
        // 检查是否会撞到自己（基于最后一个待处理方向计算下一个位置）
        const head = gameState.snake[0];
        const nextX = head.x + direction.x;
        const nextY = head.y + direction.y;
        if (gameState.snake.some(seg => seg.x === nextX && seg.y === nextY)) return;
        
        // 通过所有检查后，加入队列
        if (gameState.directionQueue.length < 2) {
            gameState.directionQueue.push(direction);
        }
        gameState.nextDirection = direction;
    }
}

// 触屏事件处理
function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}

function handleTouchMove(e) {
    _tapMoved = true;
    e.preventDefault();
    
    const touchEndX = e.touches[0].clientX;
    const touchEndY = e.touches[0].clientY;
    
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    
    // 只有滑动距离足够时才响应
    const minSwipeDistance = 30;
    
    if (Math.abs(deltaX) > minSwipeDistance || Math.abs(deltaY) > minSwipeDistance) {
        let direction = null;
        
        // 获取最后一个待处理的方向（考虑输入缓冲队列）
        const lastDir = gameState.directionQueue.length > 0
            ? gameState.directionQueue[gameState.directionQueue.length - 1]
            : gameState.direction;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 水平滑动
            if (deltaX > 0 && lastDir.x === 0) {
                direction = { x: 1, y: 0 };
            } else if (deltaX < 0 && lastDir.x === 0) {
                direction = { x: -1, y: 0 };
            }
        } else {
            // 垂直滑动
            if (deltaY > 0 && lastDir.y === 0) {
                direction = { x: 0, y: 1 };
            } else if (deltaY < 0 && lastDir.y === 0) {
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

// 移动端点击画布开始/继续游戏
let _tapMoved = false;
function handleCanvasTap(e) {
    // 只在移动端生效
    if (window.innerWidth > 768) return;

    // touchmove 触发的滑动不算点击
    if (e.type === 'touchend') {
        if (_tapMoved) { _tapMoved = false; return; }
    }
    // click 在 touchend 之后也触发，防止重复
    if (e.type === 'click' && e.pointerType !== 'mouse') return;

    if (!gameState.isGameRunning && !countdownTimer) {
        startGame();
    } else if (gameState.isGameRunning && gameState.isPaused) {
        togglePause();
    }
}

// 开始游戏
function startGame() {
    // 如果游戏已经在运行，或者有倒计时在进行，直接返回
    if (gameState.isGameRunning || countdownTimer) {
        return;
    }

    soundManager.clickSound();

    // 隐藏开始提示
    if (startHint) {
        startHint.style.display = 'none';
    }

    gameState.isGameRunning = false;
    gameState.isPaused = false;
    startBtn.disabled = true;
    pauseBtn.disabled = true;

    // 倒计时开始就隐藏鼠标
    canvas.style.cursor = 'none';

    showCountdown(() => {
        // 双重检查：确保在回调执行时游戏仍然处于未运行状态
        if (gameState.isGameRunning || !startBtn.disabled) {
            return;
        }

        gameState.isGameRunning = true;
        gameState.isPaused = false;
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        updateDpadCenterIcon();

        soundManager.startBackground();

        gameLoop();
    });

    // 异步初始化音频上下文，避免阻塞倒计时显示
    soundManager.init();
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
        if (remainingSeconds > 0) {
            // 显示倒计时数字
            pauseHint.textContent = remainingSeconds;
            pauseHint.classList.add('visible', 'countdown');
            
            remainingSeconds -= 1;
            countdownTimer = setTimeout(countdownTick, 1000);
        } else {
            // 倒计时结束，隐藏提示并执行回调
            clearCountdownTimer();
            pauseHint.classList.remove('visible', 'countdown');
            pauseHint.textContent = '';

            if (callback) {
                callback();
            }
        }
    }

    countdownTimer = setTimeout(countdownTick, 1000);
}

// 暂停/继续
function togglePause() {
    if (gameState.isGameRunning && !countdownTimer) {
        soundManager.clickSound();
        gameState.isPaused = !gameState.isPaused;
        pauseBtn.textContent = gameState.isPaused ? '▶  继续' : '⏸  暂停';
        updateDpadCenterIcon();
        
        if (gameState.isPaused) {
            // 锁定暂停时的运动方向，用于暂停期间反向检查
            pausedDirection = { x: gameState.direction.x, y: gameState.direction.y };

            const isMobile = window.innerWidth <= 768;
            pauseHint.textContent = isMobile ? '点击屏幕继续游戏' : '按空格键继续游戏';
            pauseHint.classList.add('visible');

            // 暂停时显示鼠标
            canvas.style.cursor = '';

            // 暂停背景音乐
            soundManager.stopBackground();
        } else {
            // 从暂停恢复时显示倒计时，立即隐藏鼠标
            pauseBtn.disabled = true;
            canvas.style.cursor = 'none';
            showCountdown(() => {
                // 双重检查：确保游戏仍然处于暂停恢复状态
                if (!gameState.isGameRunning || gameState.isPaused) {
                    pauseBtn.disabled = false;
                    return;
                }

                pauseBtn.disabled = false;

                updateDpadCenterIcon();

                // 恢复背景音乐
                soundManager.startBackground();
                soundManager.updateBgTempo(gameState.level);

                gameLoop();
            });
        }
    }
}

// 切换难度（仅在游戏未运行时生效）
function setDifficulty(difficulty) {
    if (gameState.isGameRunning && !gameState.isPaused) return; // 游戏运行中不允许切换
    gameState.difficulty = difficulty;
    gameState.gameSpeed = DIFFICULTY[difficulty].initialSpeed;

    // 更新按钮激活状态
    [diffEasy, diffNormal, diffHard].forEach(btn => btn.classList.remove('active'));
    const activeBtn = { easy: diffEasy, normal: diffNormal, hard: diffHard }[difficulty];
    if (activeBtn) activeBtn.classList.add('active');

    soundManager.clickSound();

    // 如果不在游戏中，立即更新显示
    if (!gameState.isGameRunning) {
        draw();
    }
}

// 重置游戏
function resetGame() {
    clearCountdownTimer();
    gameState.snake = [{ x: 10, y: 10 }];
    gameState.direction = { x: 1, y: 0 };
    gameState.nextDirection = { x: 1, y: 0 };
    gameState.directionQueue = [];
    pausedDirection = { x: 1, y: 0 };
    gameState.score = 0;
    gameState.level = 1;
    gameState.gameSpeed = DIFFICULTY[gameState.difficulty].initialSpeed;
    gameState.isGameRunning = false;
    gameState.isPaused = false;
    setSpeedBoost(false);
    particles.length = 0;  // 清空粒子
    updateDpadCenterIcon();
    soundManager.stopBackground();

    startBtn.textContent = '▶  开始游戏';
    startBtn.disabled = false;
    pauseBtn.textContent = '⏸  暂停';
    pauseBtn.disabled = true;
    pauseHint.textContent = '';
    pauseHint.classList.remove('visible');
    
    // 显示开始提示
    if (startHint) {
        updateHintText();
        startHint.style.display = 'block';
    }

    // 重置时显示鼠标
    canvas.style.cursor = '';

    generateFood();
    updateDisplay();
    draw();
    gameOverModal.classList.remove('show');
}

// 重新开始
function restartGame() {
    resetGame();
    startGame();
}

// 返回主页（只重置，不开始游戏）
function goHome() {
    resetGame();
}

// 分享
async function shareGame() {
    const text = `🐍 贪吃蛇 — 得分 ${gameState.score}，等级 ${gameState.level}`;
    const url = window.location.href;

    try {
        if (navigator.share) {
            await navigator.share({ title: '贪吃蛇', text, url });
        } else {
            await navigator.clipboard.writeText(`${text}\n${url}`);
            // 临时反馈
            const orig = shareBtn.innerHTML;
            shareBtn.innerHTML = '<span style="font-size:1.2em">✓</span>';
            setTimeout(() => { shareBtn.innerHTML = orig; }, 1200);
        }
    } catch (e) {
        // 用户取消分享或剪贴板失败，静默忽略
        if (e.name !== 'AbortError') {
            try {
                await navigator.clipboard.writeText(`${text}\n${url}`);
                const orig = shareBtn.innerHTML;
                shareBtn.innerHTML = '<span style="font-size:1.2em">✓</span>';
                setTimeout(() => { shareBtn.innerHTML = orig; }, 1200);
            } catch (_) { /* 忽略 */ }
        }
    }
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
    if (newHead.x < 0 || newHead.x >= gridCols ||
        newHead.y < 0 || newHead.y >= gridRows) {
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
        const foodScreenX = gameState.food.x * cellSize + cellSize / 2;
        const foodScreenY = gameState.food.y * cellSize + cellSize / 2;
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

        // 检查是否升级（每吃10个食物升一级）
        const totalFoodEaten = gameState.snake.length - 1; // 蛇的长度-1就是吃的食物总数
        const newLevel = Math.floor(totalFoodEaten / 10) + 1;
        if (newLevel > gameState.level) {
            gameState.level = newLevel;
            // 降低速度递增幅度：从每级减少10ms改为减少5ms，最低速度从50ms提高到80ms
            const diff = DIFFICULTY[gameState.difficulty];
            gameState.gameSpeed = Math.max(diff.minSpeed, diff.initialSpeed - (gameState.level - 1) * diff.speedDecrement);

            soundManager.levelUpSound();
            soundManager.updateBgTempo(gameState.level);
            if (gameState.level === 10) {
                soundManager.victorySound();
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

    // 递归调用下一次循环（长按加速时速度按倍率提升）
    const effectiveSpeed = gameState.speedBoosted
        ? Math.max(30, Math.floor(gameState.gameSpeed / soundManager._boostMultiplier))
        : gameState.gameSpeed;
    setTimeout(gameLoop, effectiveSpeed);
}

// 生成食物
function generateFood() {
    // 蛇占满网格 → 玩家胜利
    if (gameState.snake.length >= gridCols * gridRows) {
        endGame();
        return;
    }

    let foodX, foodY;
    let isOnSnake;

    do {
        foodX = Math.floor(Math.random() * gridCols);
        foodY = Math.floor(Math.random() * gridRows);
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

    if (isMobile) {
        // 移动端：固定 20×20 × 30px = 600×600，CSS 等比缩放
        gridCols = MIN_GRID;
        gridRows = MIN_GRID;
        cellSize = MOBILE_CELL;
        canvas.width  = gridCols * cellSize;
        canvas.height = gridRows * cellSize;
        const padding = 32;
        const maxWidth = window.innerWidth - padding;
        let displaySize = Math.floor(maxWidth / gridCols) * gridCols;
        displaySize = Math.max(300, displaySize);
        const maxHeight = window.innerHeight - 430;
        displaySize = Math.min(displaySize, Math.floor(maxHeight / gridRows) * gridRows);
        canvas.style.width  = displaySize + 'px';
        canvas.style.height = displaySize + 'px';
    } else {
        // 桌面端：按 game-area 尺寸动态算格子数，格子始终正方形
        const area = document.querySelector('.game-area');
        if (area && area.clientWidth > 0) {
            cellSize = Math.floor(Math.min(
                area.clientWidth  / MIN_GRID,
                area.clientHeight / MIN_GRID
            ));
            if (cellSize < 20) cellSize = 20; // 保底
            gridCols = Math.floor(area.clientWidth  / cellSize);
            gridRows = Math.floor(area.clientHeight / cellSize);
            canvas.width  = gridCols * cellSize;
            canvas.height = gridRows * cellSize;
            canvas.style.width  = canvas.width  + 'px';
            canvas.style.height = canvas.height + 'px';
        }
    }

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
        dpadCenter.innerHTML = '<span class="icon-pause"></span>';
    } else {
        dpadCenter.innerHTML = '<span class="icon-play"></span>';
    }
}

// 移动端虚拟方向键（含长按加速）
function setupDpadControls() {
    const buttons = {
        up:    document.getElementById('dpadUp'),
        down:  document.getElementById('dpadDown'),
        left:  document.getElementById('dpadLeft'),
        right: document.getElementById('dpadRight'),
        center: document.getElementById('dpadCenter')
    };

    if (!buttons.up) return; // 无 D-pad（桌面端不渲染）则跳过

    const dirMap = {
        up:    { x: 0, y: -1 },
        down:  { x: 0, y: 1 },
        left:  { x: -1, y: 0 },
        right: { x: 1, y: 0 }
    };

    let longPressTimer = null;
    const LONG_PRESS_MS = 200;

    function clearLongPress() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        setSpeedBoost(false);
    }

    function onDirectionDown(direction, e) {
        e.preventDefault();

        // 运行中（非暂停、非倒计时）才做严格同轴检查，暂停/未运行时由 applyDirection 统一校验
        if (gameState.isGameRunning && !gameState.isPaused && !countdownTimer) {
            const lastDir = gameState.directionQueue.length > 0
                ? gameState.directionQueue[gameState.directionQueue.length - 1]
                : gameState.direction;
            if (direction.x !== 0 && lastDir.x !== 0) return;
            if (direction.y !== 0 && lastDir.y !== 0) return;
        }

        applyDirection(direction);

        // 启动长按计时器（游戏运行中、非暂停、非倒计时时生效）
        if (gameState.isGameRunning && !gameState.isPaused && !countdownTimer) {
            clearLongPress();
            longPressTimer = setTimeout(() => {
                setSpeedBoost(true);
            }, LONG_PRESS_MS);
        }
    }

    function onDpadCenter(e) {
        e.preventDefault();
        if (!gameState.isGameRunning && !countdownTimer) {
            startGame();
        } else if (gameState.isGameRunning) {
            togglePause();
        }
    }

    // 方向按钮：按下启动计时 / 松开取消
    ['up', 'down', 'left', 'right'].forEach(name => {
        const btn = buttons[name];
        const dir = dirMap[name];
        btn.addEventListener('touchstart', (e) => onDirectionDown(dir, e), { passive: false });
        btn.addEventListener('mousedown', (e) => onDirectionDown(dir, e));
        btn.addEventListener('touchend', clearLongPress);
        btn.addEventListener('mouseup', clearLongPress);
        btn.addEventListener('mouseleave', clearLongPress);
        btn.addEventListener('touchcancel', clearLongPress);
    });

    // 中心按钮
    buttons.center.addEventListener('touchstart', (e) => onDpadCenter(e), { passive: false });
    buttons.center.addEventListener('mousedown', (e) => onDpadCenter(e));
}

// 触发升级动画
function triggerLevelUpAnimation() {
    const color = getSnakeColor(gameState.level);
    
    // 在蛇头位置生成升级粒子
    const head = gameState.snake[0];
    const centerX = head.x * cellSize + cellSize / 2;
    const centerY = head.y * cellSize + cellSize / 2;
    
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
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2 - 50;
    
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
    setSpeedBoost(false);
    pausedDirection = { x: gameState.direction.x, y: gameState.direction.y };
    pauseHint.textContent = '';
    pauseHint.classList.remove('visible');
    particles.length = 0;  // 清空粒子
    updateDpadCenterIcon();

    soundManager.stopBackground();
    soundManager.gameOverSound();

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
    startBtn.textContent = '▶  开始游戏';
    startBtn.disabled = false;
    pauseBtn.textContent = '⏸  暂停';
    pauseBtn.disabled = true;
    
    // 显示开始提示
    if (startHint) {
        updateHintText();
        startHint.style.display = 'block';
    }
    
    // 游戏结束时显示鼠标
    canvas.style.cursor = '';
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
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制蛇
    const snakeColor = getSnakeColor(gameState.level);
    const s = cellSize - 2;
    gameState.snake.forEach((segment, index) => {
        const x = segment.x * cellSize;
        const y = segment.y * cellSize;

        if (index === 0) {
            drawSnakeHead(x, y, s, s, snakeColor);
        } else {
            const opacity = 1 - (index / gameState.snake.length) * 0.5;
            drawSnakeSegment(x, y, s, s, opacity, index, snakeColor);
        }
    });

    // 绘制食物
    drawFood(gameState.food.x * cellSize, gameState.food.y * cellSize);
    
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

    // 绘制加速指示器
    if (gameState.speedBoosted && gameState.isGameRunning) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
        ctx.save();
        ctx.globalAlpha = 0.5 + pulse * 0.5;
        ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#ffdd57';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(255, 200, 50, 0.7)';
        ctx.fillText('⚡', canvas.width - 10, 10);
        ctx.restore();
    }
}

// 绘制蛇头
function drawSnakeHead(x, y, sizeW, sizeH, baseColor) {
    // 蛇头主体 - 圆角矩形
    const rw = sizeW / 2;
    const rh = sizeH / 2;
    ctx.fillStyle = baseColor.replace('1)', '0.95)');
    ctx.beginPath();
    ctx.moveTo(x + rw, y);
    ctx.lineTo(x + sizeW - rw, y);
    ctx.quadraticCurveTo(x + sizeW, y, x + sizeW, y + rh);
    ctx.lineTo(x + sizeW, y + sizeH - rh);
    ctx.quadraticCurveTo(x + sizeW, y + sizeH, x + sizeW - rw, y + sizeH);
    ctx.lineTo(x + rw, y + sizeH);
    ctx.quadraticCurveTo(x, y + sizeH, x, y + sizeH - rh);
    ctx.lineTo(x, y + rh);
    ctx.quadraticCurveTo(x, y, x + rw, y);
    ctx.fill();

    // 蛇头发光效果
    const glowColor = baseColor.replace('1)', '0.3)');
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.moveTo(x + rw, y - 1);
    ctx.lineTo(x + sizeW - rw, y - 1);
    ctx.quadraticCurveTo(x + sizeW + 1, y, x + sizeW + 1, y + rh);
    ctx.lineTo(x + sizeW + 1, y + sizeH - rh);
    ctx.quadraticCurveTo(x + sizeW + 1, y + sizeH + 1, x + sizeW - rw, y + sizeH + 1);
    ctx.lineTo(x + rw, y + sizeH + 1);
    ctx.quadraticCurveTo(x - 1, y + sizeH, x - 1, y + sizeH - rh);
    ctx.lineTo(x - 1, y + rh);
    ctx.quadraticCurveTo(x - 1, y - 1, x + rw, y - 1);
    ctx.fill();

    // 绘制眼睛（取较短边计算，保持圆形）
    const s = Math.min(sizeW, sizeH);
    const eyeR = s * 0.18;
    const eyeGap = s * 0.08;
    let eye1X = x + sizeW / 2 - eyeGap;
    let eye1Y = y + sizeH / 2 - eyeGap;
    let eye2X = x + sizeW / 2 + eyeGap;
    let eye2Y = y + sizeH / 2 - eyeGap;

    // 根据方向调整眼睛位置
    if (gameState.direction.x > 0) {
        eye1X = x + sizeW - eyeR * 2;
        eye1Y = y + sizeH / 2 - eyeR / 2;
        eye2X = x + sizeW - eyeR * 2;
        eye2Y = y + sizeH / 2 + eyeR / 2;
    } else if (gameState.direction.x < 0) {
        eye1X = x + eyeR / 2;
        eye1Y = y + sizeH / 2 - eyeR / 2;
        eye2X = x + eyeR / 2;
        eye2Y = y + sizeH / 2 + eyeR / 2;
    } else if (gameState.direction.y < 0) {
        eye1X = x + sizeW / 2 - eyeR / 2;
        eye1Y = y + eyeR / 2;
        eye2X = x + sizeW / 2 + eyeR / 2;
        eye2Y = y + eyeR / 2;
    } else if (gameState.direction.y > 0) {
        eye1X = x + sizeW / 2 - eyeR / 2;
        eye1Y = y + sizeH - eyeR * 2;
        eye2X = x + sizeW / 2 + eyeR / 2;
        eye2Y = y + sizeH - eyeR * 2;
    }

    // 绘制眼白
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eye1X, eye1Y, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eye2X, eye2Y, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // 增强方向指示效果
    ctx.save();
    const indicatorColor = baseColor.replace('1)', '0.25)');
    ctx.fillStyle = indicatorColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = baseColor.replace('1)', '0.8)');
    ctx.beginPath();
    if (gameState.direction.x > 0) {
        ctx.moveTo(x + sizeW * 0.78, y + sizeH * 0.35);
        ctx.lineTo(x + sizeW * 1.04, y + sizeH * 0.5);
        ctx.lineTo(x + sizeW * 0.78, y + sizeH * 0.65);
    } else if (gameState.direction.x < 0) {
        ctx.moveTo(x + sizeW * 0.22, y + sizeH * 0.35);
        ctx.lineTo(x - sizeW * 0.04, y + sizeH * 0.5);
        ctx.lineTo(x + sizeW * 0.22, y + sizeH * 0.65);
    } else if (gameState.direction.y < 0) {
        ctx.moveTo(x + sizeW * 0.35, y + sizeH * 0.22);
        ctx.lineTo(x + sizeW * 0.5, y - sizeH * 0.04);
        ctx.lineTo(x + sizeW * 0.65, y + sizeH * 0.22);
    } else {
        ctx.moveTo(x + sizeW * 0.35, y + sizeH * 0.78);
        ctx.lineTo(x + sizeW * 0.5, y + sizeH * 1.04);
        ctx.lineTo(x + sizeW * 0.65, y + sizeH * 0.78);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 绘制瞳孔
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(eye1X, eye1Y, eyeR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eye2X, eye2Y, eyeR * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // 绘制高光
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eye1X - eyeR * 0.3, eye1Y - eyeR * 0.3, eyeR * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eye2X - eyeR * 0.3, eye2Y - eyeR * 0.3, eyeR * 0.2, 0, Math.PI * 2);
    ctx.fill();
}

// 绘制蛇身体
function drawSnakeSegment(x, y, sizeW, sizeH, opacity, index, baseColor) {
    // 从基础颜色提取RGB值
    const rgbMatch = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);

        // 蛇身 - 圆角矩形，颜色渐变
        const gradient = ctx.createLinearGradient(x, y, x + sizeW, y + sizeH);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity * 0.9})`);
        gradient.addColorStop(1, `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, ${opacity * 0.8})`);

        ctx.fillStyle = gradient;
    } else {
        // 备用方案
        ctx.fillStyle = `rgba(76, 255, 0, ${opacity * 0.9})`;
    }

    const rw = sizeW / 4;
    const rh = sizeH / 4;
    ctx.beginPath();
    ctx.moveTo(x + rw, y);
    ctx.lineTo(x + sizeW - rw, y);
    ctx.quadraticCurveTo(x + sizeW, y, x + sizeW, y + rh);
    ctx.lineTo(x + sizeW, y + sizeH - rh);
    ctx.quadraticCurveTo(x + sizeW, y + sizeH, x + sizeW - rw, y + sizeH);
    ctx.lineTo(x + rw, y + sizeH);
    ctx.quadraticCurveTo(x, y + sizeH, x, y + sizeH - rh);
    ctx.lineTo(x, y + rh);
    ctx.quadraticCurveTo(x, y, x + rw, y);
    ctx.fill();
}

// 绘制食物
function drawFood(x, y) {
    const fs = cellSize - 2;
    const centerX = x + fs / 2;
    const centerY = y + fs / 2;
    const radius = fs / 2;

    // 获取当前等级的水果
    const fruit = getFruit(gameState.level);

    // 画水果外圈光晕（使用水果对应颜色）
    const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    glowGradient.addColorStop(0, fruit.color.replace('1)', '0.35)'));
    glowGradient.addColorStop(1, fruit.color.replace('1)', '0)'));
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // 用水果 emoji 作为食物图形
    ctx.save();
    ctx.font = `${Math.max(16, fs * 0.9)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fruit.emoji, centerX, centerY + 1);
    ctx.restore();
}

// 初始化游戏
init();