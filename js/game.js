// PandaLife — Единая игра: ходьба, прыжки, бесконечный мир
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const W = canvas.width = 868;
const H = canvas.height = 480;

const GRAVITY = 0.6;
const JUMP_FORCE = -14;
const WALK_SPEED = 5;
const GROUND_Y = H - 80;
const CHUNK_SIZE = 700;
const CAMERA_MARGIN = W / 2;

// Game state
let score = 0;
let lives = 3;
let gameOver = false;
let gameLoopId = null;
let cameraX = 0;
let lastGeneratedX = 0;

// Panda (world coordinates)
const panda = {
  x: W / 2,
  y: GROUND_Y - 50,
  w: 50,
  h: 50,
  vx: 0,
  vy: 0,
  onGround: true,
  facing: 1,
  walkFrame: 0,
};

// Dumplings, platforms, water (world coordinates)
let dumplings = [];
let platforms = [];
let waterSegments = [];
const DUMPLING_R = 18;
const COLLECT_DIST = 45;

// Input
const keys = { left: false, right: false, jump: false };
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Выбор персонажа: 'giant' | 'red'
let selectedCharacter = 'giant';

function initGame() {
  score = 0;
  lives = 3;
  gameOver = false;
  cameraX = 0;
  lastGeneratedX = W * 2;
  panda.x = W / 2;
  panda.y = GROUND_Y - 50;
  panda.vx = 0;
  panda.vy = 0;
  panda.onGround = true;
  dumplings = [];
  platforms = [];
  waterSegments = [];

  // Генерируем первые чанки
  generateChunk(0, CHUNK_SIZE);
  generateChunk(CHUNK_SIZE, CHUNK_SIZE * 2);
  lastGeneratedX = CHUNK_SIZE * 2;
}

function platformsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function generateChunk(startX, endX) {
  const rnd = (seed) => {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  };

  const PLATFORM_H = 16;
  const MIN_PLATFORM_Y = 120;
  const MAX_PLATFORM_Y = GROUND_Y - PLATFORM_H - 20;

  const chunkId = Math.floor(startX / CHUNK_SIZE);
  const hasPlatforms = chunkId === 0 || chunkId % 2 === 1 || rnd(chunkId) > 0.25;

  if (hasPlatforms) {
    const numPlatforms = 2 + Math.floor(rnd(chunkId * 7) * 3);
    for (let i = 0; i < numPlatforms; i++) {
      const pw = 80 + rnd(chunkId + i * 17) * 100;
      const minGap = 60;

      for (let attempt = 0; attempt < 15; attempt++) {
        const px = startX + 80 + rnd(chunkId + i * 11 + attempt * 3) * (endX - startX - 200 - pw);
        const py = MIN_PLATFORM_Y + rnd(chunkId + i * 13 + attempt * 5) * (MAX_PLATFORM_Y - MIN_PLATFORM_Y);

        const newPlat = { x: px, y: py, w: pw, h: PLATFORM_H };
        const overlaps = platforms.some((p) => platformsOverlap(p, newPlat));
        if (!overlaps) {
          platforms.push(newPlat);
          if (rnd(chunkId + i * 19) > 0.3) {
            dumplings.push({
              x: px + pw / 2,
              y: py - 20,
              collected: false,
              bob: rnd(chunkId + i) * Math.PI * 2,
            });
          }
          break;
        }
      }
    }
  }

  // Водные промежутки (не чаще чем раз в 2 чанка, с отступом от предыдущей воды)
  const lastWater = waterSegments[waterSegments.length - 1];
  const minDistFromLastWater = lastWater ? (startX - (lastWater.x + lastWater.w)) : 9999;
  const canAddWater = chunkId >= 1 && (chunkId % 2 === 1) && minDistFromLastWater > 350;
  if (canAddWater && rnd(chunkId * 47) > 0.4) {
    const waterW = 70 + rnd(chunkId * 53) * 80;
    const waterX = startX + 150 + rnd(chunkId * 61) * (endX - startX - 300 - waterW);
    waterSegments.push({ x: waterX, w: waterW });
  }

  // Пельмени на земле (не в воде)
  const groundDumplings = 2 + Math.floor(rnd(chunkId * 31) * 3);
  for (let i = 0; i < groundDumplings; i++) {
    const dx = startX + 100 + rnd(chunkId + i * 23) * (endX - startX - 200);
    const inWater = waterSegments.some((w) => dx > w.x - 30 && dx < w.x + w.w + 30);
    if (!inWater) {
      dumplings.push({
        x: dx,
        y: GROUND_Y - 25 - rnd(chunkId + i * 29) * 15,
        collected: false,
        bob: rnd(chunkId + i * 37) * Math.PI * 2,
      });
    }
  }
}

function ensureWorldGenerated() {
  const viewRight = cameraX + W + 200;
  while (lastGeneratedX < viewRight) {
    generateChunk(lastGeneratedX, lastGeneratedX + CHUNK_SIZE);
    lastGeneratedX += CHUNK_SIZE;
  }
}

function worldToScreen(x, y) {
  return { x: x - cameraX, y };
}

function drawPanda() {
  const sx = panda.x - cameraX;
  const sy = panda.y;
  if (sx < -100 || sx > W + 100) return;

  ctx.save();
  ctx.translate(sx + panda.w / 2, sy + panda.h / 2);
  ctx.scale(panda.facing, 1);
  ctx.translate(-(sx + panda.w / 2), -(sy + panda.h / 2));

  const bounce = panda.onGround ? Math.sin(panda.walkFrame * 0.3) * 2 : 0;

  const isRed = selectedCharacter === 'red';
  const bodyColor = isRed ? '#c1440e' : '#fff';
  const darkColor = isRed ? '#5c2610' : '#333';
  const strokeColor = isRed ? '#8b3310' : '#333';
  const faceLight = isRed ? '#f5d5c8' : '#fff';

  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.ellipse(sx + 25, sy + 28 + bounce, 18, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isRed ? '#e8a080' : bodyColor;
  ctx.beginPath();
  ctx.arc(sx + 25, sy + 18 + bounce, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = darkColor;
  ctx.beginPath();
  ctx.ellipse(sx + 12, sy + 8 + bounce, 6, 8, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx + 38, sy + 8 + bounce, 6, 8, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(sx + 16, sy + 18 + bounce, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx + 34, sy + 18 + bounce, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = faceLight;
  ctx.beginPath();
  ctx.arc(sx + 17, sy + 17 + bounce, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + 35, sy + 17 + bounce, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawDumpling(d) {
  if (d.collected) return;
  const sx = d.x - cameraX;
  if (sx < -50 || sx > W + 50) return;

  const bob = Math.sin(d.bob + Date.now() * 0.003) * 3;
  d.bob += 0.05;

  ctx.save();
  ctx.translate(sx, d.y + bob);

  ctx.fillStyle = '#f5e6d3';
  ctx.strokeStyle = '#d4b896';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, DUMPLING_R * 0.9, DUMPLING_R, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#c9a86c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, DUMPLING_R * 0.6, -Math.PI * 0.4, Math.PI * 0.4);
  ctx.stroke();

  ctx.restore();
}

function drawClouds() {
  const t = Date.now() * 0.0002;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const cloudBase = (cameraX * 0.02) % 300;
  [
    [100 + cloudBase + Math.sin(t) * 20, 60],
    [400 + cloudBase + Math.sin(t + 1) * 15, 90],
    [700 + cloudBase + Math.sin(t + 2) * 25, 50],
  ].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 25, 0, Math.PI * 2);
    ctx.arc(x + 35, y, 30, 0, Math.PI * 2);
    ctx.arc(x + 70, y, 22, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawGround() {
  const startX = Math.max(0, Math.floor(cameraX / 40) * 40);
  const endX = Math.max(cameraX + W + 200, lastGeneratedX);
  const drawW = endX - cameraX + 100;

  ctx.fillStyle = '#6ab86a';
  ctx.fillRect(-cameraX, GROUND_Y, drawW, H - GROUND_Y);

  ctx.fillStyle = '#5aa85a';
  for (let i = startX; i < endX; i += 40) {
    const inWater = waterSegments.some((w) => i + 20 > w.x && i < w.x + w.w);
    if (!inWater) {
      ctx.fillRect(i - cameraX, GROUND_Y, 20, H - GROUND_Y);
    }
  }

  waterSegments.forEach((w) => {
    const sx = w.x - cameraX;
    if (sx + w.w < -20 || sx > W + 20) return;
    const grad = ctx.createLinearGradient(sx, GROUND_Y, sx, H);
    grad.addColorStop(0, '#3498db');
    grad.addColorStop(0.5, '#2980b9');
    grad.addColorStop(1, '#1a5276');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, GROUND_Y, w.w, H - GROUND_Y);
    const wave = Math.sin(Date.now() * 0.003 + w.x * 0.01) * 3;
    ctx.fillStyle = 'rgba(52, 152, 219, 0.5)';
    ctx.beginPath();
    ctx.moveTo(sx, GROUND_Y);
    for (let i = 0; i <= w.w; i += 15) {
      ctx.lineTo(sx + i, GROUND_Y + Math.sin(i * 0.2 + Date.now() * 0.004) * 4 + wave);
    }
    ctx.lineTo(sx + w.w, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2471a3';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, GROUND_Y, w.w, H - GROUND_Y);
  });

  ctx.strokeStyle = '#4a984a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-cameraX, GROUND_Y);
  ctx.lineTo(-cameraX + drawW, GROUND_Y);
  ctx.stroke();
}

function drawPlatforms() {
  platforms.forEach((p) => {
    const sx = p.x - cameraX;
    if (sx + p.w < -50 || sx > W + 50) return;

    ctx.fillStyle = '#8b7355';
    ctx.fillRect(sx, p.y, p.w, p.h);
    ctx.fillStyle = '#6b5344';
    ctx.fillRect(sx, p.y + p.h - 4, p.w, 4);
    ctx.strokeStyle = '#5a4538';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, p.y, p.w, p.h);
  });
}

function isOverWater(x, w) {
  return waterSegments.some((seg) => x + w > seg.x && x < seg.x + seg.w);
}

function checkPlatformCollision() {
  panda.onGround = false;
  panda.vy += GRAVITY;
  panda.y += panda.vy;

  // Платформы
  platforms.forEach((p) => {
    if (
      panda.x + panda.w > p.x &&
      panda.x < p.x + p.w &&
      panda.y + panda.h >= p.y &&
      panda.y + panda.h <= p.y + p.h + 10 &&
      panda.vy >= 0
    ) {
      panda.y = p.y - panda.h;
      panda.vy = 0;
      panda.onGround = true;
    }
  });

  // Вода: упал в воду — минус жизнь
  if (panda.y + panda.h >= GROUND_Y && isOverWater(panda.x, panda.w)) {
    lives--;
    panda.y = GROUND_Y - 150;
    panda.vy = 0;
    const water = waterSegments.find((w) => panda.x + panda.w > w.x && panda.x < w.x + w.w);
    panda.x = water ? Math.max(0, water.x - 100) : cameraX + 100;
    if (lives <= 0) gameOver = true;
    return;
  }

  // Земля (только если не над водой)
  if (panda.y + panda.h >= GROUND_Y && panda.vy >= 0 && !isOverWater(panda.x, panda.w)) {
    panda.y = GROUND_Y - panda.h;
    panda.vy = 0;
    panda.onGround = true;
  }

  // Падение за экран
  if (panda.y > H) {
    lives--;
    panda.y = GROUND_Y - 150;
    panda.vy = 0;
    panda.x = cameraX + W / 3;
    if (lives <= 0) gameOver = true;
  }
}

function checkDumplingCollect() {
  const px = panda.x + panda.w / 2;
  const py = panda.y + panda.h / 2;

  dumplings.forEach((d) => {
    if (d.collected) return;
    const dx = d.x - px;
    const dy = d.y - py;
    if (Math.sqrt(dx * dx + dy * dy) < COLLECT_DIST) {
      d.collected = true;
      score++;
    }
  });
}

function update() {
  if (gameOver) return;

  panda.vx = 0;
  if (keys.left) panda.vx = -WALK_SPEED;
  if (keys.right) panda.vx = WALK_SPEED;

  if (keys.jump && panda.onGround) {
    panda.vy = JUMP_FORCE;
    panda.onGround = false;
  }

  panda.x += panda.vx;
  panda.x = Math.max(0, panda.x);

  if (panda.vx !== 0) {
    panda.facing = panda.vx > 0 ? 1 : -1;
  }
  panda.walkFrame++;

  // Камера следует за пандой (панда в центре при движении вправо)
  cameraX = Math.max(0, panda.x - CAMERA_MARGIN);

  ensureWorldGenerated();
  checkPlatformCollision();
  checkDumplingCollect();
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#87ceeb');
  grad.addColorStop(0.5, '#b8e6f0');
  grad.addColorStop(0.8, '#90d4a0');
  grad.addColorStop(1, '#6ab86a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  drawClouds();
  drawPlatforms();
  drawGround();
  dumplings.forEach(drawDumpling);
  drawPanda();

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px Quicksand';
    ctx.textAlign = 'center';
    ctx.fillText('Конец игры!', W / 2, H / 2 - 20);
    ctx.font = '24px Quicksand';
    ctx.fillText(`Счёт: ${score}`, W / 2, H / 2 + 20);
    ctx.fillText('Нажми R для перезапуска', W / 2, H / 2 + 60);
  }
}

function loop() {
  update();
  draw();
  document.getElementById('score').textContent = `🥟 ${score}`;
  document.getElementById('lives').textContent = `❤️ ${lives}`;
  gameLoopId = requestAnimationFrame(loop);
}

// Выбор персонажа
document.querySelectorAll('.char-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.char-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCharacter = btn.dataset.char;
  });
});

// Запуск игры
document.getElementById('play-btn').addEventListener('click', () => {
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('mobile-controls').classList.toggle('visible', isTouchDevice);
  initGame();
  loop();
});

document.getElementById('back-btn').addEventListener('click', () => {
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('menu-screen').classList.remove('hidden');
});

canvas.addEventListener('touchstart', (e) => {
  keys.jump = true;
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => keys.jump = false, { passive: true });

canvas.addEventListener('click', () => {
  if (isTouchDevice) keys.jump = true;
});

document.getElementById('btn-left').addEventListener('touchstart', (e) => { e.preventDefault(); keys.left = true; });
document.getElementById('btn-left').addEventListener('touchend', () => keys.left = false);
document.getElementById('btn-left').addEventListener('mousedown', () => keys.left = true);
document.getElementById('btn-left').addEventListener('mouseup', () => keys.left = false);
document.getElementById('btn-left').addEventListener('mouseleave', () => keys.left = false);

document.getElementById('btn-right').addEventListener('touchstart', (e) => { e.preventDefault(); keys.right = true; });
document.getElementById('btn-right').addEventListener('touchend', () => keys.right = false);
document.getElementById('btn-right').addEventListener('mousedown', () => keys.right = true);
document.getElementById('btn-right').addEventListener('mouseup', () => keys.right = false);
document.getElementById('btn-right').addEventListener('mouseleave', () => keys.right = false);

document.getElementById('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); keys.jump = true; });
document.getElementById('btn-jump').addEventListener('touchend', () => keys.jump = false);
document.getElementById('btn-jump').addEventListener('mousedown', () => keys.jump = true);
document.getElementById('btn-jump').addEventListener('mouseup', () => keys.jump = false);
document.getElementById('btn-jump').addEventListener('mouseleave', () => keys.jump = false);

document.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) keys.left = true;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) keys.right = true;
  if (['ArrowUp', 'w', 'W', ' '].includes(e.key)) {
    keys.jump = true;
    e.preventDefault();
  }
  if (e.key === 'r' && gameOver) {
    gameOver = false;
    lives = 3;
    score = 0;
    initGame();
  }
});

document.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) keys.left = false;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) keys.right = false;
  if (['ArrowUp', 'w', 'W', ' '].includes(e.key)) keys.jump = false;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
