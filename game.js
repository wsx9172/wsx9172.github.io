// 游戏配置
const GRID_SIZE = 20;
const CANVAS_SIZE = 600;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;

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
    gameSpeed: 100
};

// 粒子系统
const particles = [];

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 1;
        this.decay = 0.02;
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
    generateFood();
    draw();
}

// 添加事件监听
function addEventListeners() {
    document.addEventListener('keydown', handleKeyPress);
    canvas.addEventListener('touchstart', handleTouchStart, false);
    canvas.addEventListener('touchmove', handleTouchMove, false);
    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', togglePause);
    resetBtn.addEventListener('click', resetGame);
    restartBtn.addEventListener('click', restartGame);
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
    
    // 添加到方向队列（最多保留2个方向）
    if (direction && gameState.isGameRunning && !gameState.isPaused) {
        if (gameState.directionQueue.length < 2) {
            gameState.directionQueue.push(direction);
        }
        gameState.nextDirection = direction;
    }
}

// 触屏事件处理
function handleTouchStart(e) {
    if (!gameState.isGameRunning || gameState.isPaused) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}

function handleTouchMove(e) {
    if (!gameState.isGameRunning || gameState.isPaused) return;
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
            if (gameState.directionQueue.length < 2) {
                gameState.directionQueue.push(direction);
            }
            gameState.nextDirection = direction;
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
        pauseHint.classList.add('visible');
        
        remainingSeconds -= 1;
        if (remainingSeconds >= 0) {
            countdownTimer = setTimeout(countdownTick, 1000);
            return;
        }

        clearCountdownTimer();
        pauseHint.classList.remove('visible');
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
        
        if (gameState.isPaused) {
            pauseHint.textContent = '⏸';
            pauseHint.classList.add('visible');
        } else {
            // 从暂停恢复时显示倒计时
            pauseBtn.disabled = true;
            showCountdown(() => {
                pauseBtn.disabled = false;
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
    gameState.gameSpeed = 100;
    gameState.isGameRunning = false;
    gameState.isPaused = false;
    particles.length = 0;  // 清空粒子
    
    startBtn.textContent = '▶ 开始';
    startBtn.disabled = false;
    pauseBtn.textContent = '⏸ 暂停';
    pauseBtn.disabled = true;
    pauseHint.textContent = '';
    pauseHint.classList.remove('visible');
    
    // 显示开始提示
    if (startHint) {
        startHint.style.display = 'block';
    }
    
    generateFood();
    updateDisplay();
    draw();
    gameOverModal.classList.remove('show');
}

// 重新开始
function restartGame() {
    resetGame();
    gameOverModal.classList.remove('show');
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
        // 生成粒子效果
        const foodScreenX = gameState.food.x * CELL_SIZE + CELL_SIZE / 2;
        const foodScreenY = gameState.food.y * CELL_SIZE + CELL_SIZE / 2;
        for (let i = 0; i < 8; i++) {
            particles.push(new Particle(foodScreenX, foodScreenY));
        }
        
        gameState.score += gameState.level;
        
        // 检查是否升级
        const foodEaten = Math.floor(gameState.score / gameState.level);
        const newLevel = Math.floor(foodEaten / 10) + 1;
        if (newLevel > gameState.level) {
            gameState.level = newLevel;
            gameState.gameSpeed = Math.max(50, 100 - (gameState.level - 1) * 10);
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
    setTimeout(gameLoop, gameState.gameSpeed);
}

// 生成食物
function generateFood() {
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

// 游戏结束
function endGame() {
    clearCountdownTimer();
    gameState.isGameRunning = false;
    gameState.isPaused = false;
    pauseHint.textContent = '';
    pauseHint.classList.remove('visible');
    particles.length = 0;  // 清空粒子
    
    // 更新最高分
    if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        localStorage.setItem('snakeHighScore', gameState.highScore);
        highScoreDisplay.textContent = gameState.highScore;
    }

    // 显示游戏结束模态
    finalScoreDisplay.textContent = gameState.score;
    finalHighScoreDisplay.textContent = gameState.highScore;
    gameOverModal.classList.add('show');

    // 重置按钮状态
    startBtn.textContent = '▶ 开始';
    startBtn.disabled = false;
    pauseBtn.textContent = '⏸ 暂停';
    pauseBtn.disabled = true;
    
    // 显示开始提示
    if (startHint) {
        startHint.style.display = 'block';
    }
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
    gameState.snake.forEach((segment, index) => {
        const x = segment.x * CELL_SIZE;
        const y = segment.y * CELL_SIZE;
        const size = CELL_SIZE - 2;

        if (index === 0) {
            // 绘制蛇头
            drawSnakeHead(x, y, size);
        } else {
            // 绘制蛇身，颜色渐变
            const opacity = 1 - (index / gameState.snake.length) * 0.5;
            drawSnakeSegment(x, y, size, opacity, index);
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
}

// 绘制蛇头
function drawSnakeHead(x, y, size) {
    // 蛇头主体 - 圆角矩形
    const radius = size / 2;
    ctx.fillStyle = 'rgba(76, 255, 0, 0.95)';
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
    ctx.fillStyle = 'rgba(100, 255, 0, 0.3)';
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
        eye2Y = y + eyeSize / 2;
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
    ctx.fillStyle = 'rgba(120, 255, 120, 0.25)';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(120, 255, 120, 0.8)';
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
function drawSnakeSegment(x, y, size, opacity, index) {
    const hue = (index * 20) % 360;
    
    // 蛇身 - 圆角矩形，颜色略有不同
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, `hsla(130, 100%, 50%, ${opacity * 0.9})`);
    gradient.addColorStop(1, `hsla(110, 90%, 40%, ${opacity * 0.8})`);
    
    ctx.fillStyle = gradient;
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

    // 画苹果外圈光晕
    const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size);
    glowGradient.addColorStop(0, 'rgba(255, 100, 100, 0.35)');
    glowGradient.addColorStop(1, 'rgba(255, 100, 100, 0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
    ctx.fill();

    // 用苹果 emoji 作为食物图形
    ctx.save();
    ctx.font = `${Math.max(16, size * 0.9)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍎', centerX, centerY + 1);
    ctx.restore();
}

// 初始化游戏
init();
