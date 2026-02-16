// 倒计时功能
function updateCountdown() {
    // 设置目标日期为2026年春节 (2026年2月17日)
    const targetDate = new Date('2026-02-17T00:00:00').getTime();
    
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;
    
    const now = new Date().getTime();
    const distance = targetDate - now;
    
    // 计算天、时、分、秒
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    
    // 更新显示
    document.getElementById('days').innerText = days.toString().padStart(2, '0');
    document.getElementById('hours').innerText = hours.toString().padStart(2, '0');
    document.getElementById('minutes').innerText = minutes.toString().padStart(2, '0');
    document.getElementById('seconds').innerText = seconds.toString().padStart(2, '0');
    
    // 如果倒计时结束
    if (distance < 0) {
        clearInterval(countdownInterval);
        document.getElementById('days').innerText = '00';
        document.getElementById('hours').innerText = '00';
        document.getElementById('minutes').innerText = '00';
        document.getElementById('seconds').innerText = '00';
    }
}

// 祝福语轮播功能
function initBlessingsCarousel() {
    const blessings = [
        "祝您马年快乐，身体健康！",
        "祝您工作顺利，事业有成！",
        "祝您家庭和睦，幸福美满！",
        "祝您财源广进，万事如意！",
        "祝您马到成功，心想事成！",
        "祝您平安喜乐，笑口常开！",
        "祝您龙马精神，活力满满！",
        "祝您爱情甜蜜，友情长存！"
    ];
    
    let currentBlessingIndex = 0;
    const blessingDisplay = document.getElementById('blessing-display');
    const prevBtn = document.getElementById('prev-blessing');
    const nextBtn = document.getElementById('next-blessing');
    
    function showBlessing(index) {
        // 添加淡出效果
        blessingDisplay.style.opacity = '0';
        
        setTimeout(() => {
            blessingDisplay.textContent = blessings[index];
            // 添加淡入效果
            blessingDisplay.style.opacity = '1';
        }, 250);
    }
    
    function nextBlessing() {
        currentBlessingIndex = (currentBlessingIndex + 1) % blessings.length;
        showBlessing(currentBlessingIndex);
    }
    
    function prevBlessing() {
        currentBlessingIndex = (currentBlessingIndex - 1 + blessings.length) % blessings.length;
        showBlessing(currentBlessingIndex);
    }
    
    // 自动轮播
    let autoSlide = setInterval(nextBlessing, 5000); // 每5秒切换一次
    
    // 重置自动轮播计时器
    function resetAutoSlide() {
        clearInterval(autoSlide);
        autoSlide = setInterval(nextBlessing, 5000);
    }
    
    // 绑定按钮事件
    nextBtn.addEventListener('click', () => {
        nextBlessing();
        resetAutoSlide();
    });
    
    prevBtn.addEventListener('click', () => {
        prevBlessing();
        resetAutoSlide();
    });
    
    // 初始化显示第一个祝福
    showBlessing(currentBlessingIndex);
}

// 音效控制功能
function initAudioControls() {
    const audioToggle = document.getElementById('audio-toggle');
    const audioIcon = document.getElementById('audio-icon');
    const bgAudio = document.getElementById('bg-audio');
    const fireworkSound = document.getElementById('firework-sound');
    const clickSound = document.getElementById('click-sound');
    
    let audioEnabled = false;
    
    // 设置背景音乐音量
    bgAudio.volume = 0.5;
    fireworkSound.volume = 0.3;
    clickSound.volume = 0.4;
    
    // 音效切换功能
    audioToggle.addEventListener('click', () => {
        audioEnabled = !audioEnabled;
        
        if (audioEnabled) {
            // 启用音效
            audioIcon.textContent = '🔊';
            // 尝试播放背景音乐（在用户交互后）
            bgAudio.play().catch(e => console.log("音频播放被阻止:", e));
        } else {
            // 禁用音效
            audioIcon.textContent = '🔇';
            bgAudio.pause();
        }
    });
    
    // 播放烟花音效
    function playFireworkSound() {
        if (audioEnabled) {
            // 克隆音轨以允许多个同时播放
            const newSound = fireworkSound.cloneNode(true);
            newSound.volume = fireworkSound.volume;
            newSound.play().catch(e => console.log("烟花音效播放失败:", e));
        }
    }
    
    // 播放点击音效
    function playClickSound() {
        if (audioEnabled) {
            // 克隆音轨以允许多个同时播放
            const newSound = clickSound.cloneNode(true);
            newSound.volume = clickSound.volume;
            newSound.play().catch(e => console.log("点击音效播放失败:", e));
        }
    }
    
    // 将播放函数添加到全局作用域以便其他函数可以调用
    window.playFireworkSound = playFireworkSound;
    window.playClickSound = playClickSound;
    
    // 为游戏按钮添加点击音效
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('game-btn') || 
            e.target.classList.contains('race-btn') || 
            e.target.classList.contains('puzzle-btn') ||
            e.target.classList.contains('blessing-btn')) {
            playClickSound();
        }
    });
}

// 分享功能
function initShareControls() {
    const shareBtn = document.getElementById('share-btn');
    const shareOptions = document.getElementById('share-options');
    const shareButtons = document.querySelectorAll('.share-option');
    
    // 切换分享选项显示/隐藏
    shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        shareOptions.classList.toggle('hidden');
    });
    
    // 点击页面其他地方隐藏分享选项
    document.addEventListener('click', (e) => {
        if (!shareBtn.contains(e.target) && !shareOptions.contains(e.target)) {
            shareOptions.classList.add('hidden');
        }
    });
    
    // 为每个分享选项添加点击事件
    shareButtons.forEach(button => {
        button.addEventListener('click', () => {
            const platform = button.getAttribute('data-platform');
            sharePage(platform);
            shareOptions.classList.add('hidden'); // 点击后隐藏选项
        });
    });
    
    // 分享页面到不同平台
    function sharePage(platform) {
        const pageTitle = '马年快乐 - 2026马年祝福';
        const pageUrl = window.location.href;
        const text = '祝您马年快乐，身体健康！来欣赏这个特别的马年祝福网页吧！';
        
        switch(platform) {
            case 'whatsapp':
                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + pageUrl)}`;
                window.open(whatsappUrl, '_blank');
                break;
                
            case 'twitter':
                const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`;
                window.open(twitterUrl, '_blank');
                break;
                
            case 'facebook':
                const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
                window.open(facebookUrl, '_blank');
                break;
                
            case 'copy':
                copyToClipboard(pageUrl);
                break;
                
            default:
                // 默认使用Web Share API
                if (navigator.share) {
                    navigator.share({
                        title: pageTitle,
                        text: text,
                        url: pageUrl
                    }).catch(console.error);
                } else {
                    copyToClipboard(pageUrl);
                }
        }
        
        // 播放点击音效
        if (typeof playClickSound === 'function') {
            playClickSound();
        }
    }
    
    // 复制链接到剪贴板
    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                // 显示复制成功的提示
                showCopyNotification();
            }).catch(err => {
                console.error('无法复制文本: ', err);
                fallbackCopyTextToClipboard(text);
            });
        } else {
            fallbackCopyTextToClipboard(text);
        }
    }
    
    // 降级方案：使用较老的方法复制到剪贴板
    function fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // 避免滚动到底部
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        textArea.style.pointerEvents = "none";
        textArea.style.zIndex = "-1000";
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showCopyNotification();
            } else {
                console.error('复制失败');
            }
        } catch (err) {
            console.error('无法复制: ', err);
        }
        
        document.body.removeChild(textArea);
    }
    
    // 显示复制成功的通知
    function showCopyNotification() {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.textContent = '链接已复制到剪贴板！';
        notification.style.position = 'fixed';
        notification.style.bottom = '80px';
        notification.style.right = '20px';
        notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '1001';
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        
        document.body.appendChild(notification);
        
        // 显示通知
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 10);
        
        // 3秒后移除通知
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

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
        
        // 播放烟花音效
        if (typeof playFireworkSound === 'function') {
            playFireworkSound();
        }
        
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
let playerBet = null;
let playerBetAmount = 0;
let playerMoney = 100; // 玩家初始金额

function startRace() {
    if (raceInProgress) return;
    
    // 如果玩家下了注但选择的马匹不存在，提示错误
    if (playerBet !== null && !document.querySelector(`.racer${playerBet}`)) {
        alert('请选择一匹马进行下注！');
        return;
    }
    
    raceInProgress = true;
    const racer1 = document.querySelector('.racer1');
    const racer2 = document.querySelector('.racer2');
    const racer3 = document.querySelector('.racer3');
    
    // 重置位置
    if (racer1) racer1.style.left = '25px';
    if (racer2) racer2.style.left = '25px';
    if (racer3) racer3.style.left = '25px';
    
    // 更新UI
    updateRaceUI();
    
    // 开始赛跑
    raceInterval = setInterval(() => {
        const pos1 = racer1 ? parseInt(racer1.style.left) || 25 : 0;
        const pos2 = racer2 ? parseInt(racer2.style.left) || 25 : 0;
        const pos3 = racer3 ? parseInt(racer3.style.left) || 25 : 0;
        
        // 随机前进（给不同马匹不同速度特性）
        const speed1 = 5 + Math.random() * 8; // 马1速度中等
        const speed2 = 4 + Math.random() * 10; // 马2速度随机
        const speed3 = 6 + Math.random() * 7; // 马3速度较稳定
        
        if (racer1) racer1.style.left = `${pos1 + speed1}px`;
        if (racer2) racer2.style.left = `${pos2 + speed2}px`;
        if (racer3) racer3.style.left = `${pos3 + speed3}px`;
        
        // 检查是否到达终点
        const finishLine = window.innerWidth * 0.8 - 200; // 终点线位置
        
        if (racer1 && pos1 + speed1 >= finishLine) {
            finishRace(1);
        } else if (racer2 && pos2 + speed2 >= finishLine) {
            finishRace(2);
        } else if (racer3 && pos3 + speed3 >= finishLine) {
            finishRace(3);
        }
    }, 100);
}

function finishRace(winningHorse) {
    clearInterval(raceInterval);
    raceInProgress = false;
    
    // 更新玩家资金
    if (playerBet !== null && playerBet === winningHorse) {
        playerMoney += playerBetAmount * 2; // 赢得双倍下注金额
        alert(`马${winningHorse}获胜！恭喜发财，马到成功！你赢了 ${playerBetAmount * 2} 元！`);
    } else if (playerBet !== null) {
        playerMoney -= playerBetAmount; // 输掉下注金额
        alert(`马${winningHorse}获胜！很遗憾，你输了 ${playerBetAmount} 元！`);
    } else {
        alert(`马${winningHorse}获胜！恭喜发财，马到成功！`);
    }
    
    // 重置下注信息
    playerBet = null;
    playerBetAmount = 0;
    
    // 更新UI
    updateRaceUI();
}

function resetRace() {
    clearInterval(raceInterval);
    raceInProgress = false;
    
    const racer1 = document.querySelector('.racer1');
    const racer2 = document.querySelector('.racer2');
    const racer3 = document.querySelector('.racer3');
    
    if (racer1) racer1.style.left = '25px';
    if (racer2) racer2.style.left = '25px';
    if (racer3) racer3.style.left = '25px';
    
    // 重置下注信息
    playerBet = null;
    playerBetAmount = 0;
    
    // 更新UI
    updateRaceUI();
}

function placeBet(horseNumber) {
    if (raceInProgress) {
        alert('比赛进行中，无法下注！');
        return;
    }
    
    const betAmount = parseInt(prompt(`选择马匹 ${horseNumber}，请输入下注金额 (当前余额: ${playerMoney} 元):`, '10'));
    
    if (isNaN(betAmount) || betAmount <= 0) {
        alert('请输入有效的下注金额！');
        return;
    }
    
    if (betAmount > playerMoney) {
        alert('下注金额不能超过当前余额！');
        return;
    }
    
    playerBet = horseNumber;
    playerBetAmount = betAmount;
    updateRaceUI();
    
    alert(`已为马${horseNumber}下注 ${betAmount} 元！`);
}

function updateRaceUI() {
    const betInfo = document.getElementById('bet-info');
    const moneyInfo = document.getElementById('money-info');
    
    if (betInfo) {
        betInfo.textContent = `下注: ${playerBet ? `马${playerBet}, 金额: ${playerBetAmount}元` : '未下注'}`;
    }
    
    if (moneyInfo) {
        moneyInfo.textContent = `余额: ${playerMoney}元`;
    }
    
    // 高亮显示已下注的马匹
    const allRacers = document.querySelectorAll('.racer');
    allRacers.forEach(racer => {
        racer.style.boxShadow = racer.classList.contains(`racer${playerBet}`) ? '0 0 15px gold' : 'none';
    });
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

// 知识问答游戏相关函数
const quizQuestions = [
    {
        question: "2026年是农历什么年？",
        options: ["马年", "羊年", "猴年", "鸡年"],
        answer: 0,
        explanation: "2026年是农历马年，生肖为马。"
    },
    {
        question: "马在中国文化中象征着什么？",
        options: ["财富", "速度和力量", "智慧", "长寿"],
        answer: 1,
        explanation: "马在中国文化中象征着速度、力量和自由。"
    },
    {
        question: "哪句成语与马有关，意为事情顺利、一举成功？",
        options: ["马到成功", "马不停蹄", "千军万马", "马马虎虎"],
        answer: 0,
        explanation: "马到成功意为战马一到就获得成功，比喻事情顺利，一开始就取得胜利。"
    },
    {
        question: "“马上”在中文中有什么特殊含义？",
        options: ["立刻、立即", "骑马", "马的速度", "马的品质"],
        answer: 0,
        explanation: "“马上”在中文中常用来表示立刻、立即的意思。"
    },
    {
        question: "十二生肖中马排第几位？",
        options: ["第5位", "第6位", "第7位", "第8位"],
        answer: 2,
        explanation: "十二生肖中马排在第7位。"
    }
];

let currentQuestionIndex = 0;
let score = 0;
let quizAnswers = [];

function showGame(gameType) {
    const container = document.getElementById('game-container');
    
    // 清空当前游戏内容
    container.innerHTML = '';
    
    if (gameType === 'race') {
        // 创建赛马游戏
        container.innerHTML = `
            <div class="race-game">
                <h3>赛马游戏</h3>
                <p>点击任意马匹进行下注，然后点击"开始比赛"按钮，看看您的选择是否获胜！</p>
                <div class="race-track">
                    <div class="race-line start-line"></div>
                    <div class="race-line finish-line"></div>
                    <div class="racer racer1" onclick="placeBet(1)">🐎</div>
                    <div class="racer racer2" onclick="placeBet(2)">🐴</div>
                    <div class="racer racer3" onclick="placeBet(3)">🐎</div>
                </div>
                <div class="race-info">
                    <div id="money-info">余额: 100元</div>
                    <div id="bet-info">下注: 未下注</div>
                </div>
                <div class="race-controls">
                    <button class="race-btn" onclick="startRace()">开始比赛</button>
                    <button class="race-btn" onclick="resetRace()">重置</button>
                </div>
            </div>
        `;
        
        // 更新UI以显示初始信息
        if (typeof updateRaceUI === 'function') {
            updateRaceUI();
        }
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
    } else if (gameType === 'quiz') {
        // 创建知识问答游戏
        currentQuestionIndex = 0;
        score = 0;
        quizAnswers = [];
        
        showQuizQuestion();
    }
}

function showQuizQuestion() {
    const container = document.getElementById('game-container');
    const questionData = quizQuestions[currentQuestionIndex];
    
    let optionsHtml = '';
    questionData.options.forEach((option, index) => {
        optionsHtml += `
            <button class="quiz-option" onclick="selectQuizAnswer(${index})">
                ${String.fromCharCode(65 + index)}. ${option}
            </button>
        `;
    });
    
    container.innerHTML = `
        <div class="quiz-game">
            <h3>马年知识问答</h3>
            <div class="quiz-progress">
                问题 <span id="current-question">${currentQuestionIndex + 1}</span> / ${quizQuestions.length}
            </div>
            <div class="quiz-question">
                <h4>${questionData.question}</h4>
            </div>
            <div class="quiz-options">
                ${optionsHtml}
            </div>
            <div class="quiz-controls">
                <button class="quiz-btn" id="prev-btn" onclick="prevQuestion()" ${currentQuestionIndex === 0 ? 'disabled' : ''}>上一题</button>
                <button class="quiz-btn" id="next-btn" onclick="nextQuestion()" ${quizAnswers[currentQuestionIndex] !== undefined ? '' : 'disabled'}>下一题</button>
            </div>
            <div class="quiz-result" id="quiz-result"></div>
        </div>
    `;
}

function selectQuizAnswer(selectedIndex) {
    quizAnswers[currentQuestionIndex] = selectedIndex;
    
    // 高亮选中的答案
    const options = document.querySelectorAll('.quiz-option');
    options.forEach((option, index) => {
        if (index === selectedIndex) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
    
    // 启用下一题按钮
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
        nextBtn.disabled = false;
    }
    
    // 如果是最后一题且已回答，显示结果
    if (currentQuestionIndex === quizQuestions.length - 1 && quizAnswers.every(ans => ans !== undefined)) {
        showQuizResults();
    }
}

function nextQuestion() {
    if (currentQuestionIndex < quizQuestions.length - 1) {
        currentQuestionIndex++;
        showQuizQuestion();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        showQuizQuestion();
    }
}

function showQuizResults() {
    // 计算得分
    score = 0;
    quizQuestions.forEach((question, index) => {
        if (quizAnswers[index] === question.answer) {
            score++;
        }
    });
    
    const container = document.getElementById('game-container');
    container.innerHTML = `
        <div class="quiz-results">
            <h3>马年知识问答结果</h3>
            <div class="results-score">
                <h2>您的得分: ${score} / ${quizQuestions.length}</h2>
                <p>${getScoreMessage(score, quizQuestions.length)}</p>
            </div>
            <div class="results-details">
                <h4>题目详情:</h4>
                <div class="question-results">
                    ${quizQuestions.map((q, i) => `
                        <div class="question-result ${quizAnswers[i] === q.answer ? 'correct' : 'incorrect'}">
                            <p><strong>问题 ${i + 1}:</strong> ${q.question}</p>
                            <p>您的答案: ${q.options[quizAnswers[i]] || '未回答'}</p>
                            <p>正确答案: ${q.options[q.answer]}</p>
                            <p class="explanation">解释: ${q.explanation}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="quiz-controls">
                <button class="quiz-btn" onclick="restartQuiz()">重新开始</button>
            </div>
        </div>
    `;
}

function getScoreMessage(score, total) {
    const percentage = (score / total) * 100;
    
    if (percentage === 100) {
        return "太棒了！您对马年文化了如指掌！";
    } else if (percentage >= 80) {
        return "不错！您对马年文化有很好的了解！";
    } else if (percentage >= 60) {
        return "还可以！多了解一些马年文化知识吧！";
    } else {
        return "加油！了解更多马年文化知识！";
    }
}

function restartQuiz() {
    currentQuestionIndex = 0;
    score = 0;
    quizAnswers = [];
    showQuizQuestion();
}

// 页面加载完成后初始化动画
document.addEventListener('DOMContentLoaded', function() {
    createFireworks();
    animateHorse();
    animateRedEnvelope();
    
    // 初始化倒计时
    updateCountdown(); // 立即更新一次
    const countdownInterval = setInterval(updateCountdown, 1000); // 每秒更新一次
    
    // 初始化祝福语轮播
    initBlessingsCarousel();
    
    // 初始化音效控制
    initAudioControls();
    
    // 初始化分享功能
    initShareControls();
    
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
