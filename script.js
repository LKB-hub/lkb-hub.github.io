// 创建烟花效果
function createFireworks() {
    const fireworksContainer = document.getElementById('fireworks');
    
    // 创建单个烟花效果
    function createFirework() {
        const firework = document.createElement('div');
        firework.className = 'firework';
        
        // 随机位置
        const posX = Math.random() * window.innerWidth;
        const posY = Math.random() * window.innerHeight;
        
        // 随机颜色
        const colors = ['#ff0000', '#ffff00', '#00ffff', '#ff00ff', '#00ff00'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        firework.style.left = `${posX}px`;
        firework.style.top = `${posY}px`;
        firework.style.backgroundColor = color;
        
        // 随机动画持续时间
        const duration = 1 + Math.random() * 2;
        firework.style.animation = `firework ${duration}s ease-out forwards`;
        
        fireworksContainer.appendChild(firework);
        
        // 移除烟花元素以避免DOM过度增长
        setTimeout(() => {
            if (firework.parentNode) {
                firework.parentNode.removeChild(firework);
            }
        }, duration * 1000);
    }
    
    // 定期创建烟花
    setInterval(() => {
        createFirework();
    }, 300);
}

// 马的动画效果
function animateHorse() {
    const horseParts = document.querySelectorAll('.horse div');
    
    horseParts.forEach((part, index) => {
        part.style.animation = `horseMove ${2 + index * 0.5}s ease-in-out infinite`;
        part.style.animationDelay = `${index * 0.2}s`;
    });
    
    // 添加马移动的关键帧
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes horseMove {
            0%, 100% { transform: translateY(0) rotate(0); }
            50% { transform: translateY(-5px) rotate(2deg); }
        }
    `;
    document.head.appendChild(style);
}

// 红包飘动效果
function animateRedEnvelope() {
    const redEnvelope = document.querySelector('.red-envelope');
    redEnvelope.style.animation = 'bounce 1.5s infinite';
}

// 游戏切换功能
function showGame(gameType) {
    const container = document.getElementById('game-container');
    
    // 清空当前游戏内容
    container.innerHTML = '';
    
    if (gameType === 'race') {
        // 创建赛马游戏
        container.innerHTML = `
            <div class="race-game">
                <h3>赛马游戏</h3>
                <p>点击"开始比赛"按钮，看看哪匹马先到达终点！</p>
                <div class="race-track">
                    <div class="race-line start-line"></div>
                    <div class="race-line finish-line"></div>
                    <div class="racer racer1">🐎</div>
                    <div class="racer racer2">🐴</div>
                </div>
                <div class="race-controls">
                    <button class="race-btn" onclick="startRace()">开始比赛</button>
                    <button class="race-btn" onclick="resetRace()">重置</button>
                </div>
            </div>
        `;
    } else if (gameType === 'puzzle') {
        // 创建拼图游戏
        container.innerHTML = `
            <div class="puzzle-game">
                <h3>马年拼图</h3>
                <p>点击任意一块拼图，与空白块交换位置，完成拼图！</p>
                <div class="puzzle-board" id="puzzle-board">
                    <!-- 拼图将在JavaScript中生成 -->
                </div>
                <div class="puzzle-controls">
                    <button class="puzzle-btn" onclick="shufflePuzzle()">重新洗牌</button>
                    <button class="puzzle-btn" onclick="solvePuzzle()">显示答案</button>
                </div>
            </div>
        `;
        
        // 初始化拼图
        initializePuzzle();
    }
}

// 赛马游戏相关函数
let raceInterval;
let raceInProgress = false;

function startRace() {
    if (raceInProgress) return;
    
    raceInProgress = true;
    const racer1 = document.querySelector('.racer1');
    const racer2 = document.querySelector('.racer2');
    
    // 重置位置
    racer1.style.left = '25px';
    racer2.style.left = '25px';
    
    // 开始赛跑
    raceInterval = setInterval(() => {
        const pos1 = parseInt(racer1.style.left) || 25;
        const pos2 = parseInt(racer2.style.left) || 25;
        
        // 随机前进
        const newPos1 = pos1 + Math.random() * 10;
        const newPos2 = pos2 + Math.random() * 10;
        
        racer1.style.left = `${newPos1}px`;
        racer2.style.left = `${newPos2}px`;
        
        // 检查是否到达终点
        const finishLine = window.innerWidth * 0.8 - 200; // 终点线位置
        
        if (newPos1 >= finishLine) {
            clearInterval(raceInterval);
            raceInProgress = false;
            setTimeout(() => {
                alert('马1获胜！恭喜发财，马到成功！');
            }, 100);
        } else if (newPos2 >= finishLine) {
            clearInterval(raceInterval);
            raceInProgress = false;
            setTimeout(() => {
                alert('马2获胜！恭喜发财，马到成功！');
            }, 100);
        }
    }, 100);
}

function resetRace() {
    clearInterval(raceInterval);
    raceInProgress = false;
    
    const racer1 = document.querySelector('.racer1');
    const racer2 = document.querySelector('.racer2');
    
    if (racer1) racer1.style.left = '25px';
    if (racer2) racer2.style.left = '25px';
}

// 拼图游戏相关函数
let puzzlePieces = [];
let emptyIndex = 8; // 空白位置的索引
const puzzleSolution = ['🐎', '🐴', '🐴', '🐴', '🐴', '🐴', '🐴', '🐴', ''];

function initializePuzzle() {
    const board = document.getElementById('puzzle-board');
    board.innerHTML = '';
    
    // 初始化拼图数组
    puzzlePieces = [...puzzleSolution];
    shufflePuzzle();
    
    // 创建拼图块
    for (let i = 0; i < 9; i++) {
        const piece = document.createElement('div');
        piece.className = 'puzzle-piece';
        piece.textContent = puzzlePieces[i];
        piece.dataset.index = i;
        
        piece.addEventListener('click', () => movePuzzlePiece(i));
        board.appendChild(piece);
    }
}

function shufflePuzzle() {
    // 随机打乱拼图
    for (let i = 0; i < 1000; i++) {
        const neighbors = getNeighbors(emptyIndex);
        const randomNeighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
        swapPieces(emptyIndex, randomNeighbor);
        emptyIndex = randomNeighbor;
    }
    
    updatePuzzleDisplay();
}

function getNeighbors(index) {
    const neighbors = [];
    const row = Math.floor(index / 3);
    const col = index % 3;
    
    // 上
    if (row > 0) neighbors.push(index - 3);
    // 下
    if (row < 2) neighbors.push(index + 3);
    // 左
    if (col > 0) neighbors.push(index - 1);
    // 右
    if (col < 2) neighbors.push(index + 1);
    
    return neighbors;
}

function movePuzzlePiece(index) {
    if (index === emptyIndex) return; // 不能移动空块
    
    const neighbors = getNeighbors(emptyIndex);
    if (!neighbors.includes(index)) return; // 只能移动与空块相邻的块
    
    // 交换位置
    swapPieces(index, emptyIndex);
    emptyIndex = index;
    updatePuzzleDisplay();
    
    // 检查是否完成拼图
    if (checkPuzzleComplete()) {
        setTimeout(() => {
            alert('恭喜完成拼图！马年大吉！');
        }, 100);
    }
}

function swapPieces(i, j) {
    const temp = puzzlePieces[i];
    puzzlePieces[i] = puzzlePieces[j];
    puzzlePieces[j] = temp;
}

function updatePuzzleDisplay() {
    const pieces = document.querySelectorAll('.puzzle-piece');
    pieces.forEach((piece, index) => {
        piece.textContent = puzzlePieces[index];
        piece.style.backgroundColor = puzzlePieces[index] === '' ? '#8B4513' : '#D2B48C';
    });
}

function checkPuzzleComplete() {
    for (let i = 0; i < 8; i++) {
        if (puzzlePieces[i] !== puzzleSolution[i]) {
            return false;
        }
    }
    return puzzlePieces[8] === '';
}

function solvePuzzle() {
    puzzlePieces = [...puzzleSolution];
    emptyIndex = 8;
    updatePuzzleDisplay();
}

// 页面加载完成后初始化动画
document.addEventListener('DOMContentLoaded', function() {
    createFireworks();
    animateHorse();
    animateRedEnvelope();
    
    // 添加一些交互效果
    const wishes = document.querySelectorAll('.wishes li');
    wishes.forEach((wish, index) => {
        // 重新应用动画延迟
        wish.style.animationDelay = `${0.2 * (index + 1)}s`;
    });
    
    // 鼠标移动时的交互效果
    document.addEventListener('mousemove', (e) => {
        const lanterns = document.querySelectorAll('.lantern');
        lanterns.forEach(lantern => {
            const rect = lantern.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const deltaX = e.clientX - centerX;
            const deltaY = e.clientY - centerY;
            
            // 计算距离
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // 计算影响系数
            const influence = Math.min(100 / distance, 0.5);
            
            // 应用轻微的移动效果
            if (distance < 300) {
                lantern.style.transform = `translate(${deltaX * influence * 0.01}px, ${deltaY * influence * 0.01}px) rotate(${deltaX * influence * 0.02}deg)`;
            } else {
                lantern.style.transform = '';
            }
        });
    });
    
    // 鼠标移开时重置位置
    document.addEventListener('mouseleave', () => {
        const lanterns = document.querySelectorAll('.lantern');
        lanterns.forEach(lantern => {
            lantern.style.transform = '';
        });
    });
});

// 添加雪花效果
function createSnowflakes() {
    const container = document.querySelector('.container');
    
    for (let i = 0; i < 50; i++) {
        const snowflake = document.createElement('div');
        snowflake.innerHTML = '❄';
        snowflake.style.position = 'absolute';
        snowflake.style.fontSize = `${Math.random() * 10 + 10}px`;
        snowflake.style.left = `${Math.random() * 100}vw`;
        snowflake.style.top = `${-20}px`;
        snowflake.style.opacity = `${Math.random() * 0.5 + 0.3}`;
        snowflake.style.animation = `fall ${Math.random() * 5 + 5}s linear infinite`;
        snowflake.style.zIndex = '1';
        
        container.appendChild(snowflake);
    }
    
    // 添加雪花下落的CSS动画
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes fall {
            to {
                transform: translateY(100vh) rotate(360deg);
            }
        }
    `;
    document.head.appendChild(style);
}

// 页面加载完成后添加雪花效果
document.addEventListener('DOMContentLoaded', function() {
    createSnowflakes();
});