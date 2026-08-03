// Футбольный симулятор 11x11 - Основной JavaScript

// Глобальное состояние игры
const gameState = {
    coins: 1000,
    level: 1,
    matchesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    teamRating: 75,
    formation: '4-4-2',
    players: [],
    currentMatch: null,
    tournament: []
};

// Имена игроков (генерация)
const firstNames = ['Александр', 'Дмитрий', 'Сергей', 'Андрей', 'Максим', 'Иван', 'Артем', 'Владимир', 'Николай', 'Павел', 'Михаил', 'Егор', 'Алексей', 'Юрий', 'Константин'];
const lastNames = ['Иванов', 'Петров', 'Сидоров', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Михайлов', 'Новиков', 'Федоров', 'Козлов', 'Лебедев', 'Семенов', 'Егоров', 'Павлов'];

// Позиции игроков
const positions = {
    GK: { name: 'Вратарь', color: '#f39c12' },
    DEF: { name: 'Защитник', color: '#3498db' },
    MID: { name: 'Полузащитник', color: '#2ecc71' },
    FWD: { name: 'Нападающий', color: '#e74c3c' }
};

// Инициализация игры
document.addEventListener('DOMContentLoaded', () => {
    loadGame();
    initPlayers();
    updateUI();
    renderPitchVisual();
    renderPlayersList();
    renderTournamentTable();
});

// Генерация случайного игрока
function generatePlayer(position, minRating = 60, maxRating = 85) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const rating = Math.floor(Math.random() * (maxRating - minRating + 1)) + minRating;
    const age = Math.floor(Math.random() * 15) + 18;
    
    return {
        id: Date.now() + Math.random(),
        firstName,
        lastName,
        position,
        rating,
        age,
        stamina: 100,
        goals: 0,
        assists: 0
    };
}

// Инициализация команды
function initPlayers() {
    if (gameState.players.length === 0) {
        // Создаем стартовый состав 11 игроков
        const formation = getFormationPositions(gameState.formation);
        
        formation.forEach(pos => {
            gameState.players.push(generatePlayer(pos));
        });
        
        // Добавляем запасных
        for (let i = 0; i < 7; i++) {
            const randomPos = Object.keys(positions)[Math.floor(Math.random() * 4)];
            gameState.players.push(generatePlayer(randomPos, 65, 75));
        }
        
        saveGame();
    }
}

// Получение позиций по схеме
function getFormationPositions(formation) {
    const formations = {
        '4-4-2': ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD'],
        '4-3-3': ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'],
        '3-5-2': ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD'],
        '5-3-2': ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD']
    };
    return formations[formation] || formations['4-4-2'];
}

// Переключение экранов
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'team-management') {
        renderPitchVisual();
        renderPlayersList();
    } else if (screenId === 'tournament') {
        renderTournamentTable();
    }
}

// Обновление UI
function updateUI() {
    document.getElementById('user-level').textContent = `Уровень: ${gameState.level}`;
    document.getElementById('user-coins').textContent = `💰 ${gameState.coins}`;
    document.getElementById('team-rating').textContent = gameState.teamRating;
    document.getElementById('matches-played').textContent = gameState.matchesPlayed;
    document.getElementById('wins-count').textContent = gameState.wins;
}

// Отрисовка поля с игроками
function renderPitchVisual() {
    const pitch = document.getElementById('pitch-visual');
    pitch.innerHTML = '';
    
    const formation = getFormationPositions(gameState.formation);
    const playersByPosition = {};
    
    // Группируем игроков по позициям
    gameState.players.slice(0, 11).forEach((player, index) => {
        if (!playersByPosition[player.position]) {
            playersByPosition[player.position] = [];
        }
        playersByPosition[player.position].push({ ...player, index });
    });
    
    // Позиции на поле (в процентах)
    const positionCoords = {
        'GK': [{ x: 50, y: 90 }],
        'DEF': [
            { x: 20, y: 75 }, { x: 40, y: 75 },
            { x: 60, y: 75 }, { x: 80, y: 75 }
        ],
        'MID': [
            { x: 20, y: 50 }, { x: 40, y: 50 },
            { x: 60, y: 50 }, { x: 80, y: 50 }
        ],
        'FWD': [
            { x: 35, y: 25 }, { x: 65, y: 25 }
        ]
    };
    
    // Отрисовка игроков
    formation.forEach((pos, idx) => {
        const player = gameState.players[idx];
        if (!player) return;
        
        const coords = positionCoords[pos][playersByPosition[pos].indexOf({ ...player, index: idx }) % positionCoords[pos].length];
        
        const playerEl = document.createElement('div');
        playerEl.className = 'pitch-player';
        playerEl.style.cssText = `
            position: absolute;
            left: ${coords.x}%;
            top: ${coords.y}%;
            transform: translate(-50%, -50%);
            width: 40px;
            height: 40px;
            background: ${positions[pos].color};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 0.8rem;
            border: 2px solid white;
            cursor: pointer;
            z-index: 10;
        `;
        playerEl.textContent = player.rating;
        playerEl.title = `${player.firstName} ${player.lastName} (${player.rating})`;
        pitch.appendChild(playerEl);
    });
    
    // Разметка поля
    pitch.innerHTML += `
        <div style="position: absolute; top: 50%; left: 0; right: 0; height: 2px; background: rgba(255,255,255,0.5);"></div>
        <div style="position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; border: 2px solid rgba(255,255,255,0.5); border-radius: 50%; transform: translate(-50%, -50%);"></div>
        <div style="position: absolute; bottom: 0; left: 50%; width: 120px; height: 40px; border: 2px solid rgba(255,255,255,0.5); border-top: none; transform: translateX(-50%);"></div>
        <div style="position: absolute; top: 0; left: 50%; width: 120px; height: 40px; border: 2px solid rgba(255,255,255,0.5); border-bottom: none; transform: translateX(-50%);"></div>
    `;
}

// Отрисовка списка игроков
function renderPlayersList() {
    const list = document.getElementById('players-list');
    list.innerHTML = '';
    
    gameState.players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <div class="player-avatar">${player.position[0]}</div>
            <div class="player-info">
                <h4>${player.firstName} ${player.lastName}</h4>
                <p>${positions[player.position].name} | ${player.age} лет</p>
            </div>
            <div class="player-rating">⚡ ${player.rating}</div>
        `;
        list.appendChild(card);
    });
}

// Обновление схемы
function updateFormation() {
    gameState.formation = document.getElementById('formation').value;
    saveGame();
    renderPitchVisual();
}

// Начало матча
function startMatch(type) {
    const opponents = [
        { name: 'ФК «Молния»', rating: 80 },
        { name: 'ФК «Шторм»', rating: 72 },
        { name: 'ФК «Титан»', rating: 85 },
        { name: 'ФК «Орбита»', rating: 78 },
        { name: 'ФК «Комета»', rating: 82 }
    ];
    
    let opponent;
    if (type === 'quick') {
        opponent = opponents[Math.floor(Math.random() * opponents.length)];
    } else {
        const select = document.getElementById('opponent-select');
        const value = select.value;
        if (value === 'random') {
            opponent = opponents[Math.floor(Math.random() * opponents.length)];
        } else {
            opponent = opponents.find(o => o.name.includes(value.replace('team', ''))) || opponents[0];
        }
    }
    
    const duration = parseInt(document.getElementById('match-duration').value);
    const difficulty = document.getElementById('difficulty').value;
    
    gameState.currentMatch = {
        homeTeam: { name: 'Моя Команда', rating: gameState.teamRating, score: 0 },
        awayTeam: opponent,
        score: { home: 0, away: 0 },
        time: 0,
        period: 1,
        duration: duration * 60, // в секундах
        difficulty: difficulty,
        events: [],
        ballPosition: { x: 400, y: 250 },
        players: [],
        isPlaying: false
    };
    
    // Инициализация позиций игроков на поле
    initMatchPlayers();
    
    showScreen('match-screen');
    updateMatchUI();
    startMatchTimer();
}

// Инициализация игроков матча
function initMatchPlayers() {
    const match = gameState.currentMatch;
    match.players = [];
    
    // Домашняя команда (11 игроков)
    for (let i = 0; i < 11; i++) {
        match.players.push({
            team: 'home',
            x: 200 + (i % 5) * 120,
            y: 100 + Math.floor(i / 5) * 100,
            vx: 0,
            vy: 0,
            stamina: 100,
            hasBall: i === 8 // центральный нападающий начинает с мячом
        });
    }
    
    // Гостевая команда (11 игроков)
    for (let i = 0; i < 11; i++) {
        match.players.push({
            team: 'away',
            x: 600 - (i % 5) * 120,
            y: 100 + Math.floor(i / 5) * 100,
            vx: 0,
            vy: 0,
            stamina: 100,
            hasBall: false
        });
    }
}

// Запуск таймера матча
function startMatchTimer() {
    const match = gameState.currentMatch;
    match.isPlaying = true;
    match.lastUpdate = Date.now();
    
    requestAnimationFrame(matchLoop);
}

// Игровой цикл
function matchLoop() {
    if (!gameState.currentMatch || !gameState.currentMatch.isPlaying) return;
    
    const now = Date.now();
    const delta = (now - gameState.currentMatch.lastUpdate) / 1000;
    gameState.currentMatch.lastUpdate = now;
    
    // Обновление времени матча
    gameState.currentMatch.time += delta;
    
    // Проверка окончания тайма
    if (gameState.currentMatch.time >= gameState.currentMatch.duration) {
        if (gameState.currentMatch.period === 1) {
            // Перерыв
            gameState.currentMatch.period = 2;
            gameState.currentMatch.time = 0;
            addMatchEvent('Перерыв', '⏸️');
            setTimeout(() => {
                gameState.currentMatch.time = 0;
                gameState.currentMatch.lastUpdate = Date.now();
                requestAnimationFrame(matchLoop);
            }, 2000);
            return;
        } else {
            // Конец матча
            endMatch();
            return;
        }
    }
    
    // Обновление физики мяча и игроков
    updateMatchPhysics(delta);
    
    // ИИ противника
    updateAI(delta);
    
    // Отрисовка
    renderMatch();
    updateMatchUI();
    
    requestAnimationFrame(matchLoop);
}

// Обновление физики
function updateMatchPhysics(delta) {
    const match = gameState.currentMatch;
    const canvas = document.getElementById('match-canvas');
    const ctx = canvas.getContext('2d');
    
    // Движение игроков к мячу
    match.players.forEach(player => {
        const dx = match.ballPosition.x - player.x;
        const dy = match.ballPosition.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 20) {
            const speed = player.stamina / 100 * 2;
            player.vx = (dx / dist) * speed;
            player.vy = (dy / dist) * speed;
        } else {
            player.vx = 0;
            player.vy = 0;
        }
        
        player.x += player.vx;
        player.y += player.vy;
        
        // Ограничение поля
        player.x = Math.max(20, Math.min(canvas.width - 20, player.x));
        player.y = Math.max(20, Math.min(canvas.height - 20, player.y));
        
        // Усталость
        player.stamina = Math.max(0, player.stamina - delta * 0.5);
    });
}

// ИИ противника
function updateAI(delta) {
    const match = gameState.currentMatch;
    const difficultyMultiplier = {
        'easy': 0.5,
        'normal': 1.0,
        'hard': 1.5
    }[match.difficulty];
    
    // Простое движение к воротам
    match.players.filter(p => p.team === 'away').forEach(player => {
        const targetX = 50; // Ворота домашней команды
        const targetY = canvas.height / 2;
        
        const dx = targetX - player.x;
        const dy = targetY - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 50) {
            const speed = 1.5 * difficultyMultiplier;
            player.vx = (dx / dist) * speed;
            player.vy = (dy / dist) * speed;
        }
    });
}

// Отрисовка матча
function renderMatch() {
    const canvas = document.getElementById('match-canvas');
    const ctx = canvas.getContext('2d');
    const match = gameState.currentMatch;
    
    // Очистка
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Поле
    ctx.fillStyle = '#2d6a4f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Разметка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    
    // Центральная линия
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    
    // Центральный круг
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 60, 0, Math.PI * 2);
    ctx.stroke();
    
    // Ворота
    ctx.strokeRect(0, canvas.height / 2 - 60, 40, 120);
    ctx.strokeRect(canvas.width - 40, canvas.height / 2 - 60, 40, 120);
    
    // Игроки
    match.players.forEach(player => {
        ctx.fillStyle = player.team === 'home' ? '#3498db' : '#e74c3c';
        ctx.beginPath();
        ctx.arc(player.x, player.y, 12, 0, Math.PI * 2);
        ctx.fill();
        
        // Индикатор усталости
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(player.x - 10, player.y - 20, 20 * (player.stamina / 100), 4);
    });
    
    // Мяч
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(match.ballPosition.x, match.ballPosition.y, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Траектория мяча (след)
    if (match.ballTrail) {
        match.ballTrail.forEach((pos, i) => {
            ctx.globalAlpha = i / match.ballTrail.length;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }
}

// Обновление UI матча
function updateMatchUI() {
    const match = gameState.currentMatch;
    if (!match) return;
    
    const minutes = Math.floor(match.time / 60);
    const seconds = Math.floor(match.time % 60);
    
    document.getElementById('home-team-name').textContent = match.homeTeam.name;
    document.getElementById('away-team-name').textContent = match.awayTeam.name;
    document.getElementById('home-score').textContent = match.score.home;
    document.getElementById('away-score').textContent = match.score.away;
    document.getElementById('match-time').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('match-period').textContent = 
        `${match.period} тайм`;
}

// Действия игрока
function playerAction(action) {
    const match = gameState.currentMatch;
    if (!match || !match.isPlaying) return;
    
    const playerWithBall = match.players.find(p => p.hasBall);
    if (!playerWithBall) return;
    
    switch (action) {
        case 'pass':
            // Пас ближайшему игроку
            const teammates = match.players.filter(p => p.team === 'home' && !p.hasBall);
            if (teammates.length > 0) {
                const nearest = teammates.reduce((nearest, current) => {
                    const distCurrent = Math.sqrt(
                        Math.pow(current.x - playerWithBall.x, 2) + 
                        Math.pow(current.y - playerWithBall.y, 2)
                    );
                    const distNearest = Math.sqrt(
                        Math.pow(nearest.x - playerWithBall.x, 2) + 
                        Math.pow(nearest.y - playerWithBall.y, 2)
                    );
                    return distCurrent < distNearest ? current : nearest;
                });
                
                playerWithBall.hasBall = false;
                nearest.hasBall = true;
                match.ballPosition = { x: nearest.x, y: nearest.y };
                addMatchEvent(`Пас от ${playerWithBall.team}`, '👟');
            }
            break;
            
        case 'shot':
            // Удар по воротам
            const goalChance = Math.random() * 100;
            const successThreshold = 30 + (gameState.teamRating - match.awayTeam.rating) * 0.5;
            
            if (goalChance < successThreshold) {
                match.score.home++;
                addMatchEvent('ГОООЛ!', '⚽🎉');
                playSound('goal');
            } else {
                addMatchEvent('Удар мимо ворот', '💨');
            }
            
            playerWithBall.hasBall = false;
            match.ballPosition = { x: 400, y: 250 }; // Возврат в центр
            break;
            
        case 'tackle':
            // Отбор мяча
            const opponents = match.players.filter(p => p.team === 'away' && p.hasBall);
            if (opponents.length > 0) {
                const tackleChance = Math.random() * 100;
                if (tackleChance < 40) {
                    opponents[0].hasBall = false;
                    playerWithBall.hasBall = true;
                    match.ballPosition = { x: playerWithBall.x, y: playerWithBall.y };
                    addMatchEvent('Успешный отбор!', '🛡️');
                } else {
                    addMatchEvent('Отбор не удался', '❌');
                }
            }
            break;
            
        case 'sprint':
            // Спринт
            playerWithBall.stamina = Math.max(0, playerWithBall.stamina - 20);
            addMatchEvent('Спринт!', '💨');
            break;
    }
    
    renderMatch();
}

// Добавление события матча
function addMatchEvent(text, icon) {
    const match = gameState.currentMatch;
    const minutes = Math.floor(match.time / 60);
    
    match.events.unshift({ time: minutes, text, icon });
    
    const eventsContainer = document.getElementById('match-events');
    const eventEl = document.createElement('div');
    eventEl.className = 'event-item';
    eventEl.innerHTML = `
        <span class="event-time">${minutes}'</span>
        <span class="event-icon">${icon}</span>
        <span class="event-text">${text}</span>
    `;
    
    eventsContainer.insertBefore(eventEl, eventsContainer.firstChild);
    
    // Ограничение количества событий
    while (eventsContainer.children.length > 20) {
        eventsContainer.removeChild(eventsContainer.lastChild);
    }
}

// Тактические настройки
function toggleTactics() {
    const panel = document.getElementById('tactics-panel');
    panel.classList.toggle('hidden');
}

function updateTactics() {
    const playStyle = document.getElementById('play-style').value;
    const tempo = document.getElementById('tempo').value;
    addMatchEvent(`Тактика: ${playStyle}, темп: ${tempo}`, '📋');
}

// Завершение матча
function endMatch() {
    const match = gameState.currentMatch;
    match.isPlaying = false;
    
    const result = match.score.home > match.score.away ? 'win' : 
                   match.score.home < match.score.away ? 'loss' : 'draw';
    
    // Награда
    const reward = result === 'win' ? 150 : result === 'draw' ? 75 : 30;
    gameState.coins += reward;
    gameState.matchesPlayed++;
    
    if (result === 'win') gameState.wins++;
    else if (result === 'draw') gameState.draws++;
    else gameState.losses++;
    
    // Обновление рейтинга
    if (result === 'win') {
        gameState.teamRating = Math.min(99, gameState.teamRating + 1);
    } else if (result === 'loss') {
        gameState.teamRating = Math.max(50, gameState.teamRating - 1);
    }
    
    // Уровень
    gameState.level = Math.floor(gameState.matchesPlayed / 10) + 1;
    
    addMatchEvent(`Матч окончен! ${result === 'win' ? 'Победа!' : result === 'draw' ? 'Ничья' : 'Поражение'}`, '🏁');
    addMatchEvent(`Награда: +${reward} 💰`, '💰');
    
    saveGame();
    updateUI();
    
    // Показать результат через 3 секунды
    setTimeout(() => {
        alert(`Матч окончен!\n\n${match.homeTeam.name} ${match.score.home} - ${match.score.away} ${match.awayTeam.name}\n\n${result === 'win' ? '🎉 Победа!' : result === 'draw' ? '🤝 Ничья' : '😞 Поражение'}\nНаграда: ${reward} монет`);
        showScreen('main-menu');
    }, 3000);
}

// Рендер турнирной таблицы
function renderTournamentTable() {
    const tbody = document.getElementById('tournament-body');
    tbody.innerHTML = '';
    
    const teams = [
        { name: 'Моя Команда', played: gameState.matchesPlayed, wins: gameState.wins, draws: gameState.draws, losses: gameState.losses, points: gameState.wins * 3 + gameState.draws },
        { name: 'ФК «Молния»', played: 10, wins: 7, draws: 2, losses: 1, points: 23 },
        { name: 'ФК «Шторм»', played: 10, wins: 5, draws: 3, losses: 2, points: 18 },
        { name: 'ФК «Титан»', played: 10, wins: 4, draws: 4, losses: 2, points: 16 },
        { name: 'ФК «Орбита»', played: 10, wins: 3, draws: 2, losses: 5, points: 11 },
        { name: 'ФК «Комета»', played: 10, wins: 1, draws: 2, losses: 7, points: 5 }
    ].sort((a, b) => b.points - a.points);
    
    teams.forEach((team, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${team.name}</td>
            <td>${team.played}</td>
            <td>${team.wins}</td>
            <td>${team.draws}</td>
            <td>${team.losses}</td>
            <td><strong>${team.points}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

// Покупка предметов
function buyItem(itemType, price) {
    if (gameState.coins < price) {
        alert('Недостаточно монет!');
        return;
    }
    
    if (confirm(`Купить за ${price} монет?`)) {
        gameState.coins -= price;
        
        switch (itemType) {
            case 'player':
                const newPos = Object.keys(positions)[Math.floor(Math.random() * 4)];
                gameState.players.push(generatePlayer(newPos, 70, 85));
                alert('Новый игрок добавлен в команду!');
                break;
            case 'training':
                if (gameState.players.length > 0) {
                    const player = gameState.players[0];
                    player.rating = Math.min(99, player.rating + 5);
                    alert(`${player.firstName} ${player.lastName}: рейтинг +5!`);
                }
                break;
            case 'kit':
                alert('Форма команды обновлена!');
                break;
            case 'stadium':
                alert('Стадион улучшен! Доход увеличен.');
                break;
        }
        
        saveGame();
        updateUI();
        renderPlayersList();
    }
}

// Сохранение прогресса
function saveGame() {
    localStorage.setItem('footballSimSave', JSON.stringify(gameState));
}

// Загрузка прогресса
function loadGame() {
    const saved = localStorage.getItem('footballSimSave');
    if (saved) {
        const data = JSON.parse(saved);
        Object.assign(gameState, data);
    }
}

// Сброс прогресса
function resetProgress() {
    if (confirm('Вы уверены? Весь прогресс будет потерян!')) {
        localStorage.removeItem('footballSimSave');
        location.reload();
    }
}

// Звуковые эффекты (заглушка)
function playSound(type) {
    // В реальной реализации здесь было бы воспроизведение звуков
    console.log(`Sound: ${type}`);
}

// Экспорт для тестирования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { gameState, generatePlayer, getFormationPositions };
}
