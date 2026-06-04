// 游戏配置
const GRID_SIZE = 20;
const CANVAS_SIZE = 400;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;

// 游戏状态
const gameState = {
    snake: [
        { x: 10, y: 10 }
    ],
    food: { x: 15, y: 15 },
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    score: 0,
    highScore: localStorage.getItem('snakeHighScore') || 0,
    level: 1,
    isGameRunning: false,
    isPaused: false,
    gameSpeed: 100
};

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

// 初始化
function init() {
    highScoreDisplay.textContent = gameState.highScore;
    updateDisplay();
    addEventListeners();
    generateFood();
    draw();
}

// 添加事件监听
function addEventListeners() {
    document.addEventListener('keydown', handleKeyPress);
    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', togglePause);
    resetBtn.addEventListener('click', resetGame);
    restartBtn.addEventListener('click', restartGame);
}

// 键盘事件处理
function handleKeyPress(event) {
    const key = event.key;
    
    switch (key) {
        case 'ArrowUp':
            if (gameState.direction.y === 0) {
                gameState.nextDirection = { x: 0, y: -1 };
            }
            event.preventDefault();
            break;
        case 'ArrowDown':
            if (gameState.direction.y === 0) {
                gameState.nextDirection = { x: 0, y: 1 };
            }
            event.preventDefault();
            break;
        case 'ArrowLeft':
            if (gameState.direction.x === 0) {
                gameState.nextDirection = { x: -1, y: 0 };
            }
            event.preventDefault();
            break;
        case 'ArrowRight':
            if (gameState.direction.x === 0) {
                gameState.nextDirection = { x: 1, y: 0 };
            }
            event.preventDefault();
            break;
        case ' ':
            if (gameState.isGameRunning) {
                togglePause();
            }
            event.preventDefault();
            break;
    }
}

// 开始游戏
function startGame() {
    if (!gameState.isGameRunning) {
        gameState.isGameRunning = true;
        gameState.isPaused = false;
        startBtn.textContent = '游戏中...';
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        gameLoop();
    }
}

// 暂停/继续
function togglePause() {
    if (gameState.isGameRunning) {
        gameState.isPaused = !gameState.isPaused;
        pauseBtn.textContent = gameState.isPaused ? '继续' : '暂停';
        if (!gameState.isPaused) {
            gameLoop();
        }
    }
}

// 重置游戏
function resetGame() {
    gameState.snake = [{ x: 10, y: 10 }];
    gameState.direction = { x: 1, y: 0 };
    gameState.nextDirection = { x: 1, y: 0 };
    gameState.score = 0;
    gameState.level = 1;
    gameState.gameSpeed = 100;
    gameState.isGameRunning = false;
    gameState.isPaused = false;
    
    startBtn.textContent = '开始游戏';
    startBtn.disabled = false;
    pauseBtn.textContent = '暂停';
    pauseBtn.disabled = true;
    
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
    gameState.isGameRunning = false;
    gameState.isPaused = false;
    
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
    startBtn.textContent = '开始游戏';
    startBtn.disabled = false;
    pauseBtn.textContent = '暂停';
    pauseBtn.disabled = true;
}

// 更新显示
function updateDisplay() {
    scoreDisplay.textContent = gameState.score;
    levelDisplay.textContent = gameState.level;
}

// 绘制游戏
function draw() {
    // 清空画布
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 绘制蛇
    gameState.snake.forEach((segment, index) => {
        if (index === 0) {
            // 蛇头
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(
                segment.x * CELL_SIZE,
                segment.y * CELL_SIZE,
                CELL_SIZE,
                CELL_SIZE
            );
            
            // 蛇头的眼睛
            ctx.fillStyle = '#000';
            const eyeSize = CELL_SIZE / 4;
            let eyeX = segment.x * CELL_SIZE + CELL_SIZE / 4;
            let eyeY = segment.y * CELL_SIZE + CELL_SIZE / 4;
            
            if (gameState.direction.x > 0) {
                eyeX = segment.x * CELL_SIZE + CELL_SIZE * 0.6;
            } else if (gameState.direction.x < 0) {
                eyeX = segment.x * CELL_SIZE + CELL_SIZE * 0.2;
            } else if (gameState.direction.y < 0) {
                eyeY = segment.y * CELL_SIZE + CELL_SIZE * 0.2;
            } else if (gameState.direction.y > 0) {
                eyeY = segment.y * CELL_SIZE + CELL_SIZE * 0.6;
            }
            
            ctx.fillRect(eyeX, eyeY, eyeSize, eyeSize);
        } else {
            // 蛇身
            ctx.fillStyle = '#00cc00';
            ctx.fillRect(
                segment.x * CELL_SIZE,
                segment.y * CELL_SIZE,
                CELL_SIZE - 1,
                CELL_SIZE - 1
            );
        }
    });

    // 绘制食物
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(
        gameState.food.x * CELL_SIZE + CELL_SIZE / 2,
        gameState.food.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2 - 1,
        0,
        Math.PI * 2
    );
    ctx.fill();

    // 绘制网格（可选）
    ctx.strokeStyle = '#1a1a1a';
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
}

// 初始化游戏
init();
