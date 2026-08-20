// ══════════════════════════════════════════════════════════════════════
//  BACKGROUND — CRT terminal rain
//
//  Reworked to sit under the UI rather than compete with it:
//
//   • The scanlines + vignette are now rendered ONCE into an offscreen
//     canvas and blitted each frame. The old loop stroked ~640 paths
//     every single frame (H/2 minor + H/8 major) — on a 1080p screen
//     that's ~600 stroke ops at 60fps for a layer that never changes.
//     This is the single biggest cost removed.
//   • Colours are read from the page's own CSS variables, so the
//     background tracks whatever palette the settings panel is set to.
//   • The scanline pitch is aligned to the 6px grain used on the UI
//     panels, so the background weave and the panel weave are in
//     register instead of moiréing against each other.
//   • A "content well" is drawn OVER the terminal text down the centre
//     column, so text stays legible out in the gutters but falls away
//     behind the app where the panels sit.
//   • Animation pauses when the tab is hidden and honours
//     prefers-reduced-motion.
//   • Removed the pixels[] grid — it allocated one object per cell
//     (tens of thousands on a large screen) on every resize and was
//     never drawn.
// ══════════════════════════════════════════════════════════════════════

const canvas = document.getElementById("matrix");
const ctx = canvas.getContext("2d", { alpha: false });

// ----------------------
// Palette — pulled from the page
//
//  The background now takes its tint from --gloss-rim-color, the same
//  variable that lights the inner edge of every panel. Tying them
//  together means the light spilling off the UI and the light in the
//  terminal behind it are the same colour — tune the rim in Settings
//  and the background follows.
//
//  --matrix-color is still honoured as an explicit override: set it to
//  anything other than the stock green and it wins.
//
//  Rim colours are chosen to look good as a thin glow against a dark
//  panel, so they tend to be dark (#00558a, for instance). Text drawn
//  at that value would be unreadable, so everything is lifted toward
//  white by a fixed amount and the scanlines keep the raw hue.
// ----------------------
const PALETTE = {
  line: "#00558a",   // scanlines — raw rim colour
  text: "#4d94c2",   // terminal text — lifted for legibility
  bg:   "#000000",   // --matrix-bg
};

function hexToRgb(hex) {
  const h = (hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (isNaN(n) || full.length !== 6) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Lift a colour toward white. Dark rim tints need this to read as text.
function lift(c, amount) {
  return {
    r: Math.round(c.r + (255 - c.r) * amount),
    g: Math.round(c.g + (255 - c.g) * amount),
    b: Math.round(c.b + (255 - c.b) * amount),
  };
}

// Guarantee a minimum brightness so a near-black rim still shows something
function floorLuma(c, min) {
  const luma = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  return luma < min ? lift(c, (min - luma) / (1 - luma)) : c;
}

let LINE_RGB = { r: 0,  g: 85,  b: 138 };
let TEXT_RGB = { r: 77, g: 148, b: 194 };

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n) => (cs.getPropertyValue(n) || "").trim();

  const matrix = get("--matrix-color");
  const rim    = get("--gloss-rim-color");

  // --matrix-color wins unless it's still the stock green
  const chosen = (matrix && matrix.toLowerCase() !== "#62bf80") ? matrix : (rim || matrix);

  const base = hexToRgb(chosen) || { r: 0, g: 85, b: 138 };
  LINE_RGB = floorLuma(base, 0.10);
  TEXT_RGB = floorLuma(lift(base, 0.42), 0.34);

  PALETTE.bg = get("--matrix-bg") || "#000000";
}

const lineRgba = (a) => `rgba(${LINE_RGB.r}, ${LINE_RGB.g}, ${LINE_RGB.b}, ${a})`;
const textRgba = (a) => `rgba(${TEXT_RGB.r}, ${TEXT_RGB.g}, ${TEXT_RGB.b}, ${a})`;

// Expose a refresh so the settings panel can re-tint the background live
window.rainRefresh = () => { readPalette(); buildStaticLayer(); };

// ----------------------
// Geometry
// ----------------------
const GRAIN = 6;           // matches the UI panel scanline cycle
const CONTENT_W = 1180;    // widest the app column gets

let DPR = 1;
let staticLayer = null;    // offscreen: scanlines + vignette
let wellGradient = null;   // centre darkening, drawn over the text

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);

  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width  = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  canvas.style.width  = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  buildStaticLayer();
  computeMaxLines();
}

window.addEventListener("resize", resize);

// ----------------------
// Static layer — built once per resize, blitted per frame
// ----------------------
function buildStaticLayer() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!w || !h) return;

  staticLayer = document.createElement("canvas");
  staticLayer.width  = Math.floor(w * DPR);
  staticLayer.height = Math.floor(h * DPR);
  const s = staticLayer.getContext("2d");
  s.setTransform(DPR, 0, 0, DPR, 0, 0);

  s.fillStyle = PALETTE.bg;
  s.fillRect(0, 0, w, h);

  // Major scanlines — on the same 6px cycle as the panel grain
  s.beginPath();
  for (let y = 0; y < h; y += GRAIN) { s.moveTo(0, y); s.lineTo(w, y); }
  s.strokeStyle = lineRgba(0.075);
  s.lineWidth = 0.6;
  s.stroke();

  // Minor scanlines — half pitch, very faint
  s.beginPath();
  for (let y = 0; y < h; y += GRAIN / 2) { s.moveTo(0, y); s.lineTo(w, y); }
  s.strokeStyle = lineRgba(0.03);
  s.lineWidth = 0.4;
  s.stroke();

  // Vignette
  const vig = s.createRadialGradient(
    w / 2, h / 2, h * 0.3,
    w / 2, h / 2, h * 0.85
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.34)");
  s.fillStyle = vig;
  s.fillRect(0, 0, w, h);

  // Content well — a soft dark band down the middle where the app sits.
  // Drawn over the terminal text each frame so the text fades out behind
  // the panels and stays readable in the gutters.
  const wellW = Math.min(CONTENT_W, w * 0.96);
  const x0 = (w - wellW) / 2;
  wellGradient = ctx.createLinearGradient(x0, 0, x0 + wellW, 0);
  wellGradient.addColorStop(0.00, "rgba(0,0,0,0)");
  wellGradient.addColorStop(0.10, "rgba(0,0,0,0.55)");
  wellGradient.addColorStop(0.50, "rgba(0,0,0,0.72)");
  wellGradient.addColorStop(0.90, "rgba(0,0,0,0.55)");
  wellGradient.addColorStop(1.00, "rgba(0,0,0,0)");
}

// ----------------------
// Terminal Config
// ----------------------
const FONT_SIZE = 13;
const LINE_HEIGHT = 32;
const MARGIN_X_RATIO = 0.06;
const MARGIN_Y = 48;
const FONT = `${FONT_SIZE}px "Courier New", Courier, monospace`;

// Per-character typing delay in ms, by tier — these are the ORIGINAL
// values; SPEED divides them at schedule time.
//
// setTimeout can't reliably fire faster than ~4ms, so past SPEED ≈ 4
// simply shrinking the delay stops buying anything: you queue callbacks
// the browser can't service and the typing plateaus. Beyond that point
// scheduleNextChar() switches strategy — it holds the delay at the 4ms
// floor and emits SEVERAL characters per tick instead of one, so the
// throughput keeps scaling linearly with SPEED no matter how high it
// goes. Tiers stay proportionally distinct rather than all flattening
// into the same wall.
const SPEED = 12;
const MIN_DELAY = 4;

const SPEED_TIERS = [
  { min: 1,  max: 3  },
  { min: 4,  max: 10 },
  { min: 12, max: 25 },
  { min: 30, max: 60 },
];

let currentTier = SPEED_TIERS[0];

function pickSpeedTier() {
  const roll = Math.random();
  if (roll < 0.45)      currentTier = SPEED_TIERS[0];
  else if (roll < 0.70) currentTier = SPEED_TIERS[1];
  else if (roll < 0.88) currentTier = SPEED_TIERS[2];
  else                  currentTier = SPEED_TIERS[3];
}

const prefixes = [
  "INITIALIZING", "EXECUTING", "LOADING", "BYPASSING", "SCANNING",
  "INJECTING", "COMPILING", "REROUTING", "EXTRACTING", "DECRYPTING",
  "ESTABLISHING", "MOUNTING", "FORKING", "SYNCING", "WIPING",
  "PATCHING", "DUMPING", "HANDSHAKING", "AUTHENTICATING", "TUNNELING",
  // a few that nod to what the app actually does
  "ENUMERATING", "RESOLVING", "INDEXING", "HASHING", "TRANSPOSING",
];

const segments = [
  "SECURE SHELL PROTOCOL v4.2.1", "KERNEL MODULE [matrix.ko]",
  "FIREWALL LAYERS 1-9", "PAYLOAD [73.4kb]", "REVERSE SHELL :4444",
  "MEMORY PAGES 0xFFFF→0x0000", "CIPHER AES-512-GCM", "ROOTKIT PERSISTENT",
  "SUBNET 10.0.0.0/8", "NEURAL BRIDGE v3.14", "SHADOW DAEMON THREAD",
  "DNS-OVER-HTTPS BEACON", "BIOMETRIC HASH LAYER", "LATERAL PIVOT DMZ→CORE",
  "STACK FRAME 0x00007FFF", "TOR RELAY CHAIN x9", "GPU HASHCRACK MODULE",
  "CLOCK DESYNC DELTA T-∞", "SYSLOG ROTATION CYCLE", "ZERO-DAY CVE-2024-∅∅∅∅",
  "PORT FORWARD 127.0.0.1:9050", "ROOTFS SECTOR 0x000→0xFFF", "C2 CHANNEL INTERVAL 30s",
  "SSH TUNNEL AES-256-GCM", "EXFIL ARCHIVE [4.7GB]", "ENV PATH=/dev/void",
  "/bin/ghost.sh --no-trace", "PACKET SPOOF 192.168.0.∅", "CORE DUMP /var/log/ZION",
  "PID:0x00 DAEMON FORK", "MAC 00:1A:2B:3C:4D:5E", "CREDENTIAL HARVEST /etc/shadow",
  // cipher-flavoured lines, so the background reads as part of this app
  "ORDINAL TABLE A→Z [26]", "REVERSE ORDINAL MAP LOADED",
  "REDUCTION MOD-9 LATTICE", "SUMERIAN x6 MULTIPLIER",
  "GEMATRIA INDEX REBUILD", "CIPHER REGISTRY [77 ACTIVE]",
  "VAULT SHARD /local/db", "COLLISION BUCKET 0x1F",
];

const statusTokens = [
  "OK", "DONE", "CLEAR", "ACTIVE", "LIVE", "UP", "COMPLETE",
  "GRANTED", "STABLE", "SILENT", "ONLINE", "LOCKED", "VERIFIED",
  "BYPASSED", "CONNECTED", "PERSISTENT", "CONFIRMED", "ENCRYPTED",
];

const hexChunks = () => {
  const hex = () => Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, "0");
  return `0x${hex()}${hex()}`;
};

const dotFill = "............";

function buildLine(targetWidth) {
  ctx.font = FONT;

  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const seg    = segments[Math.floor(Math.random() * segments.length)];
  const status = statusTokens[Math.floor(Math.random() * statusTokens.length)];
  const tail   = ` .... ${status}`;

  let line = `${prefix}: ${seg}`;

  let safety = 0;
  while (safety < 40) {
    const candidate = (() => {
      const roll = Math.random();
      if (roll < 0.35) return ` ${dotFill} ${segments[Math.floor(Math.random() * segments.length)]}`;
      if (roll < 0.6)  return ` ${dotFill} ${hexChunks()}`;
      if (roll < 0.8)  return ` ${dotFill} ${statusTokens[Math.floor(Math.random() * statusTokens.length)]}`;
      return ` ${dotFill}`;
    })();

    if (ctx.measureText(line + candidate + tail).width < targetWidth) {
      line += candidate;
    } else {
      break;
    }
    safety++;
  }

  line += tail;
  return line;
}

// ----------------------
// Terminal State
// ----------------------
let displayedLines = [];
let currentText   = "";
let targetText    = "";
let charIndex     = 0;
let glitchPending = false;
let MAX_LINES     = 7;
let typeTimer     = null;

function computeMaxLines() {
  MAX_LINES = Math.max(1, Math.floor((window.innerHeight - MARGIN_Y * 2) / LINE_HEIGHT));
}

function getLeftX() { return window.innerWidth * MARGIN_X_RATIO; }

function getTargetWidth() {
  const min = window.innerWidth * (3 / 5);
  const max = window.innerWidth * (1 - MARGIN_X_RATIO);
  return min + Math.random() * (max - min);
}

function pickNextLine() {
  pickSpeedTier();
  targetText  = buildLine(getTargetWidth());
  currentText = "";
  charIndex   = 0;
  scheduleNextChar();
}

// How many characters the next tick should emit. 1 until the delay
// would drop below the timer floor, then it scales up instead.
let burst = 1;

function scheduleNextChar() {
  const raw = (currentTier.min + Math.random() * (currentTier.max - currentTier.min)) / SPEED;
  if (raw < MIN_DELAY) {
    burst = Math.max(1, Math.round(MIN_DELAY / raw));
    typeTimer = setTimeout(typeNextChar, MIN_DELAY);
  } else {
    burst = 1;
    typeTimer = setTimeout(typeNextChar, raw);
  }
}

function typeNextChar() {
  if (charIndex >= targetText.length) {
    const alpha = Math.random() < 0.12 ? 0.18 : Math.random() < 0.4 ? 0.08 : 0.13;
    displayedLines.push({ text: currentText, alpha });
    if (displayedLines.length > MAX_LINES) displayedLines.shift();
    currentText = "";
    typeTimer = setTimeout(pickNextLine, (80 + Math.random() * 300) / SPEED);
    return;
  }

  if (!glitchPending && Math.random() < 0.03) {
    glitchPending = true;
    const wrongChars = "!@#$%^&*01∅█▓░";
    currentText += wrongChars[Math.floor(Math.random() * wrongChars.length)];
    typeTimer = setTimeout(() => {
      currentText = currentText.slice(0, -1);
      currentText += targetText[charIndex];
      charIndex++;
      glitchPending = false;
      scheduleNextChar();
    }, 50 / SPEED);
    return;
  }

  // Emit `burst` characters this tick (1 at normal speeds)
  const take = Math.min(burst, targetText.length - charIndex);
  currentText += targetText.substr(charIndex, take);
  charIndex += take;
  scheduleNextChar();
}

// ----------------------
// Main Loop
// ----------------------
let blinkOn = true;
const BLINK_MS = 530 / SPEED;
let blinkTimer = setInterval(() => { blinkOn = !blinkOn; }, BLINK_MS);

let running = true;
let rafId = null;

function loop() {
  rafId = requestAnimationFrame(loop);
  if (!running) return;

  const W = window.innerWidth;
  const H = window.innerHeight;

  // One blit replaces ~640 stroked paths per frame
  if (staticLayer) {
    ctx.drawImage(staticLayer, 0, 0, W, H);
  } else {
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, W, H);
  }

  // ---- Terminal text ----
  ctx.font = FONT;
  ctx.textBaseline = "top";

  const LEFT_X = getLeftX();
  const topY   = MARGIN_Y;

  for (let i = 0; i < displayedLines.length; i++) {
    const line = displayedLines[i];
    ctx.fillStyle = textRgba(line.alpha);
    ctx.fillText(line.text, LEFT_X, topY + i * LINE_HEIGHT);
  }

  const activeY = topY + displayedLines.length * LINE_HEIGHT;
  ctx.fillStyle = textRgba(0.30);
  ctx.fillText(currentText, LEFT_X, activeY);

  if (blinkOn) {
    const cursorX = LEFT_X + ctx.measureText(currentText).width;
    ctx.fillStyle = textRgba(0.32);
    ctx.fillRect(cursorX + 2, activeY, 8, FONT_SIZE + 1);
  }

  // ---- Content well, over the text ----
  if (wellGradient) {
    ctx.fillStyle = wellGradient;
    ctx.fillRect(0, 0, W, H);
  }
}

// ----------------------
// Pause when not visible
// ----------------------
document.addEventListener("visibilitychange", () => {
  running = !document.hidden;
  if (document.hidden) {
    clearTimeout(typeTimer);
    clearInterval(blinkTimer);
  } else {
    blinkTimer = setInterval(() => { blinkOn = !blinkOn; }, BLINK_MS);
    scheduleNextChar();
  }
});

// ----------------------
// Init
// ----------------------
readPalette();
resize();
computeMaxLines();

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (reduceMotion) {
  // Static frame only: draw the layers once and stop.
  for (let i = 0; i < 5; i++) {
    displayedLines.push({ text: buildLine(getTargetWidth()), alpha: 0.11 });
  }
  blinkOn = false;
  clearInterval(blinkTimer);
  running = true;
  loop();
  running = false;
} else {
  pickNextLine();
  loop();
}
