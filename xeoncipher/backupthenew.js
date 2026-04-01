// ----------------------
// Setup
// ----------------------
const canvas = document.getElementById("matrix");
const ctx = canvas.getContext("2d");

let dotSize = 6;
let gap = 2;
let renderSize = dotSize * 0.50;

let cols, rows;
let pixels = [];
let vignette;

// Base phosphor color (precomputed)
let r = 18;
let g = 24;
let b = 22;

// ----------------------
// Resize
// ----------------------
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    cols = Math.floor(canvas.width / (dotSize + gap));
    rows = Math.floor(canvas.height / (dotSize + gap));

    createPixels();

    // Create vignette once
    vignette = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        canvas.height * 0.3,
        canvas.width / 2,
        canvas.height / 2,
        canvas.height * 0.8
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.30)");
}

// ----------------------
// Create Pixel Grid
// ----------------------
function createPixels() {
    pixels = [];

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            // Precompute flicker colors as strings
            const flickers = [
                Math.floor(Math.random() * 15) - 7,
                Math.floor(Math.random() * 15) - 7,
                Math.floor(Math.random() * 15) - 7
            ];

            pixels.push({
                x: x * (dotSize + gap),
                y: y * (dotSize + gap),
                flickerColors: [
                    `rgb(${r + flickers[0]}, ${g + flickers[0]}, ${b + flickers[0]})`,
                    `rgb(${r + flickers[1]}, ${g + flickers[1]}, ${b + flickers[1]})`,
                    `rgb(${r + flickers[2]}, ${g + flickers[2]}, ${b + flickers[2]})`
                ]
            });
        }
    }
}

// ----------------------
// Draw Function
// ----------------------
function draw() {
    // Base background
    ctx.fillStyle = "rgb(0, 5, 8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw pixels with precomputed flicker colors
    for (let i = 0; i < pixels.length; i++) {
        let pixel = pixels[i];

        // Pick a random precomputed color
        ctx.fillStyle = pixel.flickerColors[Math.floor(Math.random() * 3)];
        ctx.fillRect(pixel.x, pixel.y, renderSize, renderSize);
    }

    // Scanlines (cheap enough to leave in)
    ctx.fillStyle = "rgba(0, 0, 24, 0.14)";
    for (let y = 0; y < canvas.height; y += 4) {
        ctx.fillRect(0, y, canvas.width, 2);
    }

    // Vignette overlay
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ----------------------
// Init
// ----------------------
resize();

// ----------------------
// Pseudo-animation 12 FPS
// ----------------------
setInterval(draw, 1000 / 12);

window.addEventListener("resize", resize);
