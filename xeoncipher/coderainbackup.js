// ----------------------
// Setup
// ----------------------
const canvas = document.getElementById("matrix");
const ctx = canvas.getContext("2d");

let dotSize = 6;
let gap = 2;

let cols, rows;
let pixels = [];
let vignette;

// ----------------------
// Resize
// ----------------------
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    cols = Math.floor(canvas.width / (dotSize + gap));
    rows = Math.floor(canvas.height / (dotSize + gap));

    createPixels();

    vignette = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.8
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.30)");
}

window.addEventListener("resize", resize);

// ----------------------
// Create Pixel Grid
// ----------------------
function createPixels() {
    pixels = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            pixels.push({
                x: x * (dotSize + gap),
                y: y * (dotSize + gap),
                flickers: [
                    Math.floor(Math.random() * 15) - 7,
                    Math.floor(Math.random() * 15) - 7,
                    Math.floor(Math.random() * 15) - 7
                ]
            });
        }
    }
}

// ----------------------
// Terminal Config
// ----------------------
const FONT_SIZE = 13;
const LINE_HEIGHT = 32;
const MARGIN_X_RATIO = 0.06;
const MARGIN_Y = 48; // top and bottom gap in px

const SPEED_TIERS = [
    { min: 1,  max: 3   }, // blazing
    { min: 4,  max: 10  }, // fast
    { min: 12, max: 25  }, // medium
    { min: 30, max: 60  }, // slow
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
    ctx.font = `${FONT_SIZE}px "Courier New", Courier, monospace`;

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

function computeMaxLines() {
    MAX_LINES = Math.floor((canvas.height - MARGIN_Y * 2) / LINE_HEIGHT);
}

function getLeftX()       { return canvas.width * MARGIN_X_RATIO; }
function getRightX()      { return canvas.width * (1 - MARGIN_X_RATIO); }
function getTargetWidth() { return getRightX() - getLeftX(); }

function pickNextLine() {
    pickSpeedTier();
    targetText  = buildLine(getTargetWidth());
    currentText = "";
    charIndex   = 0;
    scheduleNextChar();
}

function scheduleNextChar() {
    const delay = currentTier.min + Math.random() * (currentTier.max - currentTier.min);
    setTimeout(typeNextChar, delay);
}

function typeNextChar() {
    if (charIndex >= targetText.length) {
        const alpha = Math.random() < 0.12 ? 0.18 : Math.random() < 0.4 ? 0.08 : 0.13;
        displayedLines.push({ text: currentText, alpha });
        if (displayedLines.length > MAX_LINES) displayedLines.shift();
        currentText = "";
        setTimeout(pickNextLine, 80 + Math.random() * 300);
        return;
    }

    if (!glitchPending && Math.random() < 0.03) {
        glitchPending = true;
        const wrongChars = "!@#$%^&*01∅█▓░";
        currentText += wrongChars[Math.floor(Math.random() * wrongChars.length)];
        setTimeout(() => {
            currentText = currentText.slice(0, -1);
            currentText += targetText[charIndex];
            charIndex++;
            glitchPending = false;
            scheduleNextChar();
        }, 50);
        return;
    }

    currentText += targetText[charIndex];
    charIndex++;
    scheduleNextChar();
}

// ----------------------
// Main Loop
// ----------------------
let blinkOn = true;
setInterval(() => { blinkOn = !blinkOn; }, 530);

function loop() {
    requestAnimationFrame(loop);

    const W = canvas.width;
    const H = canvas.height;

    computeMaxLines();

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, W, H);

    // CRT lines — major (blue)
    ctx.beginPath();
    for (let y = 0; y < H; y += 8) {
        ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.strokeStyle = "rgba(60, 120, 220, 0.10)";
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // CRT lines — minor (blue)
    ctx.beginPath();
    for (let y = 0; y < H; y += 2) {
        ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.strokeStyle = "rgba(60, 120, 220, 0.04)";
    ctx.lineWidth = 0.4;
    ctx.stroke();

    if (vignette) {
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);
    }

    // ---- Terminal text ----
    ctx.font = `${FONT_SIZE}px "Courier New", Courier, monospace`;
    ctx.textBaseline = "top";

    const LEFT_X = getLeftX();
    const topY   = MARGIN_Y;  // text starts MARGIN_Y from top

    displayedLines.forEach((line, i) => {
        const y = topY + i * LINE_HEIGHT;
        ctx.fillStyle = `rgba(80, 140, 200, ${line.alpha})`;
        ctx.fillText(line.text, LEFT_X, y);
    });

    const activeY = topY + displayedLines.length * LINE_HEIGHT;
    ctx.fillStyle = "rgba(90, 155, 215, 0.28)";
    ctx.fillText(currentText, LEFT_X, activeY);

    if (blinkOn) {
        const cursorX = LEFT_X + ctx.measureText(currentText).width;
        ctx.fillStyle = "rgba(80, 140, 200, 0.30)";
        ctx.fillRect(cursorX + 2, activeY, 8, FONT_SIZE + 1);
    }
}

// ----------------------
// Init
// ----------------------
resize();
computeMaxLines();
pickNextLine();
loop();