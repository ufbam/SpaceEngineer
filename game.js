const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const keys = new Set();
let walkMask = null;
let ready = false;

const state = {
  x: 0,
  y: 0,
  speed: 120,
  direction: 'down',
  frame: 0,
  frameTimer: 0,
  moving: false,
};

const dirRow = { up: 0, down: 1, left: 2, right: 3 };

const mapCandidates = ['GAME MAP.png', 'level-map.png'];
const spriteCandidates = ['Space Engineer Walk Cycle.png', 'sprite-walk-cycle.png'];

start();

window.addEventListener('keydown', (event) => {
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    keys.add(event.key);
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.key);
});

async function start() {
  try {
    const mapImage = await loadFirstAvailable(mapCandidates);
    const spriteSheet = await loadFirstAvailable(spriteCandidates);
    init(mapImage, spriteSheet);
  } catch (error) {
    showLoadError(String(error?.message || error));
  }
}

function showLoadError(message) {
  canvas.width = 960;
  canvas.height = 540;
  ctx.fillStyle = '#0f1420';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f8d7da';
  ctx.font = '20px sans-serif';
  ctx.fillText('Unable to load image assets.', 30, 50);
  ctx.fillStyle = '#d4edda';
  ctx.font = '16px sans-serif';
  ctx.fillText('Expected files:', 30, 90);
  ctx.fillText('- GAME MAP.png', 30, 120);
  ctx.fillText('- Space Engineer Walk Cycle.png', 30, 145);
  ctx.fillStyle = '#cfe2ff';
  ctx.fillText(message, 30, 190);
}

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${path}`));
    image.src = encodeURI(path);
  });
}

async function loadFirstAvailable(paths) {
  for (const path of paths) {
    try {
      return await loadImage(path);
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(`Could not load any image from: ${paths.join(', ')}`);
}

function init(mapImage, spriteSheet) {
  canvas.width = mapImage.width;
  canvas.height = mapImage.height;

  const offscreen = document.createElement('canvas');
  offscreen.width = mapImage.width;
  offscreen.height = mapImage.height;
  const octx = offscreen.getContext('2d');
  octx.drawImage(mapImage, 0, 0);

  const data = octx.getImageData(0, 0, offscreen.width, offscreen.height).data;
  walkMask = new Uint8Array(offscreen.width * offscreen.height);

  for (let y = 0; y < offscreen.height; y++) {
    for (let x = 0; x < offscreen.width; x++) {
      const i = (y * offscreen.width + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      walkMask[y * offscreen.width + x] = lum > 125 ? 1 : 0;
    }
  }

  const spawn = findSpawn(offscreen.width, offscreen.height);
  state.x = spawn.x;
  state.y = spawn.y;

  ready = true;
  requestAnimationFrame((ts) => loop(ts, mapImage, spriteSheet));
}

function findSpawn(w, h) {
  for (let y = Math.floor(h / 2); y < h; y++) {
    for (let x = Math.floor(w / 2); x < w; x++) {
      if (isWalkable(x, y, w, h)) return { x, y };
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isWalkable(x, y, w, h)) return { x, y };
    }
  }

  return { x: 20, y: 20 };
}

function isWalkable(x, y, width = canvas.width, height = canvas.height) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return false;
  return walkMask[iy * width + ix] === 1;
}

function canStandAt(nextX, nextY, radius) {
  const probes = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7, radius * 0.7],
    [radius * 0.7, -radius * 0.7],
    [-radius * 0.7, radius * 0.7],
    [-radius * 0.7, -radius * 0.7],
  ];

  return probes.every(([dx, dy]) => isWalkable(nextX + dx, nextY + dy));
}

let prev = 0;
function loop(ts, mapImage, spriteSheet) {
  if (!ready) return;
  const dt = Math.min((ts - prev) / 1000 || 0, 0.05);
  prev = ts;

  update(dt, spriteSheet);
  draw(mapImage, spriteSheet);

  requestAnimationFrame((nextTs) => loop(nextTs, mapImage, spriteSheet));
}

function update(dt, spriteSheet) {
  let dx = 0;
  let dy = 0;

  if (keys.has('ArrowUp')) dy -= 1;
  if (keys.has('ArrowDown')) dy += 1;
  if (keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('ArrowRight')) dx += 1;

  state.moving = dx !== 0 || dy !== 0;

  if (state.moving) {
    if (Math.abs(dx) > Math.abs(dy)) state.direction = dx > 0 ? 'right' : 'left';
    else state.direction = dy > 0 ? 'down' : 'up';

    const mag = Math.hypot(dx, dy);
    dx /= mag;
    dy /= mag;

    const radius = Math.max(spriteSheet.width / 9 / 5, 4);
    const move = state.speed * dt;

    const nx = state.x + dx * move;
    if (canStandAt(nx, state.y, radius)) state.x = nx;

    const ny = state.y + dy * move;
    if (canStandAt(state.x, ny, radius)) state.y = ny;

    state.frameTimer += dt;
    if (state.frameTimer > 0.085) {
      state.frame = (state.frame + 1) % 9;
      state.frameTimer = 0;
    }
  } else {
    state.frame = 0;
    state.frameTimer = 0;
  }
}

function draw(mapImage, spriteSheet) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mapImage, 0, 0);

  const frameW = spriteSheet.width / 9;
  const frameH = spriteSheet.height / 4;
  const srcX = Math.floor(state.frame) * frameW;
  const srcY = dirRow[state.direction] * frameH;

  ctx.drawImage(
    spriteSheet,
    srcX,
    srcY,
    frameW,
    frameH,
    Math.round(state.x - frameW / 2),
    Math.round(state.y - frameH / 2),
    frameW,
    frameH
  );
}
