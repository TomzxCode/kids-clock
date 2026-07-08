// WebGL Dynamic Background for Kids Clock
// Renders a procedural day/night scene on the GPU: the sun and moon travel
// across the sky based on the time of day, clouds drift, birds fly by,
// sheep graze between the trees, a bunny hops over the flowery hills,
// stars twinkle and fireflies glow at night.

const WEBGL_BG_VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const WEBGL_BG_FRAGMENT_SHADER = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;     // seconds, drives animation (clouds, twinkle, critters)
uniform float u_dayPhase; // 0..1 fraction of the 24h day (0 = midnight)

#define TWO_PI 6.28318530718

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.02 + vec2(17.3, 9.1);
        a *= 0.5;
    }
    return v;
}

// Silhouette height of the back and front hills
float hillY1(float x) {
    return 0.24 + 0.05 * sin(x * 2.1 + 1.7) + 0.025 * sin(x * 5.3 + 0.4);
}

float hillY2(float x) {
    return 0.15 + 0.04 * sin(x * 3.0 + 4.0) + 0.020 * sin(x * 7.1 + 2.0);
}

float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float ellipseMask(vec2 rel, vec2 r, float soft) {
    return smoothstep(1.0 + soft, 1.0 - soft, length(rel / r));
}

// Upright triangle: half-width halfW at yBase tapering to a point at yTip
float triangleMask(vec2 rel, float halfW, float yBase, float yTip, float e) {
    float t = clamp((rel.y - yBase) / (yTip - yBase), 0.0, 1.0);
    float w = halfW * (1.0 - t);
    return smoothstep(e, -e, abs(rel.x) - w)
         * smoothstep(yBase - e, yBase + e, rel.y)
         * smoothstep(yTip + e, yTip - e, rel.y);
}

// Classic two-stroke gull silhouette with flapping wings
float birdMask(vec2 rel, float flap, float s, float e) {
    vec2 tipL = vec2(-0.016, 0.011 * flap) * s;
    vec2 tipR = vec2(0.016, 0.011 * flap) * s;
    float d = min(segDist(rel, vec2(0.0), tipL), segDist(rel, vec2(0.0), tipR));
    return smoothstep(0.0022 * s + e, 0.0022 * s - e, d);
}

vec3 drawPine(vec3 col, vec2 p, vec2 base, float s, vec3 foliage, vec3 trunkC, float e) {
    vec2 rel = p - base;
    float trunk = smoothstep(e, -e, abs(rel.x) - 0.007 * s)
                * smoothstep(-0.02 * s, -0.02 * s + e, rel.y)
                * smoothstep(0.035 * s + e, 0.035 * s - e, rel.y);
    col = mix(col, trunkC, trunk);
    float m = triangleMask(rel - vec2(0.0, 0.020 * s), 0.050 * s, 0.0, 0.075 * s, e);
    m = max(m, triangleMask(rel - vec2(0.0, 0.060 * s), 0.040 * s, 0.0, 0.065 * s, e));
    m = max(m, triangleMask(rel - vec2(0.0, 0.095 * s), 0.030 * s, 0.0, 0.055 * s, e));
    col = mix(col, foliage * (0.85 + 0.30 * noise(p * 25.0)), m);
    return col;
}

vec3 drawLeafyTree(vec3 col, vec2 p, vec2 base, float s, vec3 canopy, vec3 trunkC, float e) {
    vec2 rel = p - base;
    float trunk = smoothstep(e, -e, abs(rel.x) - 0.008 * s)
                * smoothstep(-0.02 * s, -0.02 * s + e, rel.y)
                * smoothstep(0.075 * s + e, 0.075 * s - e, rel.y);
    col = mix(col, trunkC, trunk);
    float d = length((rel - vec2(0.0, 0.105 * s)) / (0.055 * s));
    d = min(d, length((rel - vec2(-0.045 * s, 0.080 * s)) / (0.042 * s)));
    d = min(d, length((rel - vec2(0.045 * s, 0.080 * s)) / (0.042 * s)));
    float m = smoothstep(1.0, 0.92, d);
    col = mix(col, canopy * (0.85 + 0.30 * noise(p * 25.0)), m);
    return col;
}

vec3 drawSheep(vec3 col, vec2 p, vec2 pos, float dir, float s, float daylight, float t, float e) {
    vec2 rel = (p - pos) / s;
    rel.x *= dir;
    vec3 wool = vec3(0.95, 0.95, 0.92) * (0.30 + 0.70 * daylight);
    vec3 dark = vec3(0.13, 0.12, 0.14) * (0.45 + 0.55 * daylight);

    float legs = max(
        smoothstep(e, -e, abs(rel.x + 0.011) - 0.0030),
        smoothstep(e, -e, abs(rel.x - 0.011) - 0.0030))
        * smoothstep(-0.021, -0.021 + e, rel.y)
        * smoothstep(e, -e, rel.y);
    col = mix(col, dark, legs);

    // Head bobs down slowly as the sheep grazes
    float bob = 0.007 * (0.5 + 0.5 * sin(t * 0.8 + pos.x * 20.0));
    float head = ellipseMask(rel - vec2(0.027, 0.006 - bob), vec2(0.009, 0.012), 0.15);
    col = mix(col, dark, head);

    float fluff = 1.0 + 0.12 * noise(rel * 250.0);
    float body = smoothstep(1.08, 0.90, length(rel / vec2(0.027, 0.018)) * fluff);
    col = mix(col, wool, body);
    return col;
}

vec3 drawBunny(vec3 col, vec2 p, vec2 pos, float s, float daylight) {
    vec2 rel = (p - pos) / s;
    vec3 fur = mix(vec3(0.05, 0.07, 0.11), vec3(0.45, 0.36, 0.29), daylight);
    vec3 tailC = mix(vec3(0.15, 0.17, 0.22), vec3(0.95, 0.92, 0.88), daylight);
    float body = ellipseMask(rel, vec2(0.016, 0.012), 0.10);
    float head = ellipseMask(rel - vec2(0.015, 0.010), vec2(0.008, 0.0075), 0.12);
    float ear1 = ellipseMask(rel - vec2(0.010, 0.024), vec2(0.0028, 0.0085), 0.15);
    float ear2 = ellipseMask(rel - vec2(0.017, 0.023), vec2(0.0028, 0.0080), 0.15);
    col = mix(col, fur, max(max(body, head), max(ear1, ear2)));
    col = mix(col, tailC, ellipseMask(rel - vec2(-0.016, 0.005), vec2(0.0045, 0.0045), 0.2));
    return col;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float e = 2.0 / u_resolution.y;

    // Sun elevation: rises at 06:00, peaks at noon, sets at 18:00
    float sunAngle = (u_dayPhase - 0.25) * TWO_PI;
    float sunEl = sin(sunAngle);
    float daylight = smoothstep(-0.12, 0.25, sunEl);
    float twilight = 1.0 - smoothstep(0.0, 0.35, abs(sunEl));

    // Sky gradient blending between night and day palettes
    vec3 dayTop = vec3(0.25, 0.60, 0.95);
    vec3 dayBottom = vec3(0.65, 0.85, 0.98);
    vec3 nightTop = vec3(0.02, 0.03, 0.10);
    vec3 nightBottom = vec3(0.08, 0.10, 0.25);
    vec3 sky = mix(mix(nightBottom, dayBottom, daylight),
                   mix(nightTop, dayTop, daylight),
                   smoothstep(0.0, 1.0, uv.y));

    // Warm dawn/dusk glow near the horizon
    vec3 glowColor = vec3(1.0, 0.45, 0.25);
    float horizonGlow = twilight * (1.0 - smoothstep(0.0, 0.55, uv.y));
    sky = mix(sky, glowColor, horizonGlow * 0.55);

    // Stars (night only), twinkling on a hashed grid
    vec2 sp = p * 55.0;
    vec2 cell = floor(sp);
    float h = hash(cell);
    vec2 starPos = vec2(hash(cell + 0.13), hash(cell + 0.71)) * 0.8 + 0.1;
    float starDist = length(fract(sp) - starPos);
    float twinkle = 0.6 + 0.4 * sin(u_time * (1.5 + h * 3.0) + h * 20.0);
    float star = smoothstep(0.14, 0.0, starDist) * step(0.82, h) * twinkle;
    sky += star * (1.0 - daylight) * smoothstep(0.25, 0.45, uv.y) * vec3(0.9, 0.95, 1.0);

    // Sun: disc + glow travelling in an arc across the sky
    vec2 sunPos = vec2((0.5 - cos(sunAngle) * 0.40) * aspect, 0.24 + sunEl * 0.62);
    float dSun = distance(p, sunPos);
    float sunDisc = smoothstep(0.058, 0.048, dSun);
    float sunGlow = exp(-dSun * 5.0) * 0.55;
    vec3 sunColor = mix(vec3(1.0, 0.55, 0.25), vec3(1.0, 0.95, 0.70),
                        clamp(sunEl * 2.0, 0.0, 1.0));
    sky += (sunDisc + sunGlow) * sunColor;

    // Moon: crescent on the opposite arc, visible at night
    float moonAngle = sunAngle + TWO_PI * 0.5;
    vec2 moonPos = vec2((0.5 - cos(moonAngle) * 0.40) * aspect, 0.24 + sin(moonAngle) * 0.62);
    float dMoon = distance(p, moonPos);
    float moonDisc = smoothstep(0.050, 0.044, dMoon);
    float moonBite = smoothstep(0.052, 0.046, distance(p, moonPos + vec2(0.020, 0.010)));
    float moon = clamp(moonDisc - moonBite * 0.9, 0.0, 1.0);
    float moonGlow = exp(-dMoon * 9.0) * 0.35;
    sky += (moon + moonGlow) * vec3(0.90, 0.93, 1.0) * (1.0 - daylight);

    // Drifting clouds, two fbm layers for parallax
    float cloudBand = smoothstep(0.40, 0.55, uv.y) * (1.0 - smoothstep(0.88, 1.0, uv.y));
    float c1 = fbm(vec2(p.x * 2.6 + u_time * 0.020, uv.y * 5.5));
    float c2 = fbm(vec2(p.x * 4.2 + u_time * 0.035 + 31.0, uv.y * 8.0));
    float clouds = smoothstep(0.52, 0.75, c1) * 0.85 + smoothstep(0.58, 0.80, c2) * 0.45;
    vec3 cloudColor = mix(vec3(0.16, 0.19, 0.30), vec3(1.0), daylight);
    cloudColor = mix(cloudColor, glowColor, twilight * 0.35);
    sky = mix(sky, cloudColor, clamp(clouds, 0.0, 1.0) * cloudBand * 0.85);

    // Birds gliding across the daytime sky
    vec3 birdColor = mix(vec3(0.10, 0.12, 0.16), vec3(0.16, 0.18, 0.22), daylight);
    for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float bx = fract(u_time * (0.014 + fi * 0.004) + fi * 0.31) * (aspect + 0.10) - 0.05;
        float by = 0.62 + 0.09 * fract(fi * 0.618) + 0.012 * sin(u_time * 1.7 + fi * 2.0);
        float flap = sin(u_time * (7.0 + fi) + fi * 2.4);
        float bm = birdMask(p - vec2(bx, by), flap, 0.8 + 0.15 * fi, e);
        sky = mix(sky, birdColor, bm * daylight);
    }

    // Back hill with grass texture
    float y1 = hillY1(p.x);
    float m1 = smoothstep(y1 + e, y1 - e, uv.y);
    vec3 grass1 = mix(vec3(0.05, 0.10, 0.16), vec3(0.35, 0.65, 0.30), daylight);
    grass1 *= 0.92 + 0.16 * fbm(p * 14.0);
    vec3 col = mix(sky, grass1, m1);

    // Trees along the back hill ridge
    vec3 pineColor = mix(vec3(0.030, 0.075, 0.105), vec3(0.10, 0.42, 0.22), daylight);
    vec3 leafColor = mix(vec3(0.040, 0.090, 0.110), vec3(0.24, 0.58, 0.26), daylight);
    vec3 trunkColor = mix(vec3(0.045, 0.040, 0.055), vec3(0.38, 0.25, 0.14), daylight);
    float tx1 = aspect * 0.055;
    float tx2 = aspect * 0.135;
    float tx3 = aspect * 0.915;
    float tx4 = aspect * 0.700;
    col = drawPine(col, p, vec2(tx1, hillY1(tx1)), 1.00, pineColor, trunkColor, e);
    col = drawPine(col, p, vec2(tx2, hillY1(tx2)), 0.75, pineColor, trunkColor, e);
    col = drawPine(col, p, vec2(tx3, hillY1(tx3)), 1.10, pineColor, trunkColor, e);
    col = drawLeafyTree(col, p, vec2(tx4, hillY1(tx4)), 1.0, leafColor, trunkColor, e);

    // Sheep grazing on the back hill
    float sx1 = aspect * 0.300;
    float sx2 = aspect * 0.505;
    col = drawSheep(col, p, vec2(sx1, hillY1(sx1) + 0.020), 1.0, 1.0, daylight, u_time, e);
    col = drawSheep(col, p, vec2(sx2, hillY1(sx2) + 0.017), -1.0, 0.85, daylight, u_time, e);

    // Front hill with grass texture
    float y2 = hillY2(p.x);
    float m2 = smoothstep(y2 + e, y2 - e, uv.y);
    vec3 grass2 = mix(vec3(0.03, 0.07, 0.12), vec3(0.25, 0.52, 0.22), daylight);
    grass2 *= 0.92 + 0.16 * fbm(p * 17.0 + 13.0);
    col = mix(col, grass2, m2);

    // Flowers dotted over the front hill, open during the day
    vec2 fCell = floor(p * 16.0);
    float fh = hash(fCell + 9.7);
    vec2 fPos = (fCell + vec2(hash(fCell + 3.1), hash(fCell + 6.7)) * 0.6 + 0.2) / 16.0;
    fPos.x += 0.003 * sin(u_time * 1.5 + fh * 20.0);
    float onGrass = step(fPos.y, hillY2(fPos.x) - 0.02);
    float fd = distance(p, fPos);
    vec3 petalColor = mix(vec3(1.0, 0.55, 0.75), vec3(1.0, 0.85, 0.35), step(0.5, hash(fCell + 1.3)));
    petalColor = mix(petalColor, vec3(0.95), step(0.8, hash(fCell + 2.9)));
    float flowerShow = step(0.55, fh) * onGrass * daylight;
    col = mix(col, petalColor, smoothstep(0.0055, 0.0030, fd) * flowerShow);
    col = mix(col, vec3(1.0, 0.95, 0.55), smoothstep(0.0022, 0.0010, fd) * flowerShow);

    // Bunny hopping along the front hill
    float bunnyX = fract(u_time * 0.015 + 0.15) * (aspect + 0.08) - 0.04;
    float hop = abs(sin(u_time * 5.0)) * 0.014;
    col = drawBunny(col, p, vec2(bunnyX, hillY2(bunnyX) + 0.008 + hop), 1.0, daylight);

    // Butterflies fluttering over the flowers during the day
    for (int i = 0; i < 2; i++) {
        float fi = float(i);
        vec2 bPos = vec2(aspect * (0.28 + 0.42 * fi) + 0.10 * sin(u_time * 0.45 + fi * 3.1),
                         0.205 + 0.045 * sin(u_time * 0.75 + fi * 1.9));
        float flapW = 0.35 + 0.65 * abs(sin(u_time * 9.0 + fi * 2.2));
        vec2 rel = p - bPos;
        float wings = max(
            ellipseMask(rel - vec2(-0.0042 * flapW, 0.0), vec2(0.0042 * flapW, 0.0052), 0.2),
            ellipseMask(rel - vec2(0.0042 * flapW, 0.0), vec2(0.0042 * flapW, 0.0052), 0.2));
        vec3 wingColor = mix(vec3(1.0, 0.60, 0.30), vec3(0.75, 0.55, 0.95), fi);
        col = mix(col, wingColor, wings * daylight);
    }

    // Fireflies wandering over the hills at night
    vec2 gCell = floor(p * 10.0);
    float gh = hash(gCell + 5.0);
    vec2 gPos = (gCell + 0.5 + 0.3 * vec2(sin(u_time * 0.7 + gh * 40.0),
                                          cos(u_time * 0.9 + gh * 60.0))) / 10.0;
    float blink = 0.5 + 0.5 * sin(u_time * (1.0 + gh * 2.0) + gh * 30.0);
    float firefly = exp(-distance(p, gPos) * 220.0) * step(0.75, gh) * blink;
    col += firefly * vec3(0.7, 1.0, 0.4) * (1.0 - daylight) * m1;

    // Slight dither to avoid gradient banding
    col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

    gl_FragColor = vec4(col, 1.0);
}
`;

class WebGLBackground {
    // getTime: callback returning the current Date (real or simulated)
    constructor(canvas, getTime) {
        this.canvas = canvas;
        this.getTime = getTime;
        this.gl = null;
        this.program = null;
        this.uniforms = {};
        this.animationFrame = null;
        this.running = false;
        this.startTimestamp = performance.now();

        this.handleResize = () => this.resize();
        this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            this.cancelFrame();
        });
        this.canvas.addEventListener('webglcontextrestored', () => {
            this.gl = null;
            if (this.running) {
                this.initGL();
                this.scheduleFrame();
            }
        });
    }

    static isSupported() {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch (e) {
            return false;
        }
    }

    initGL() {
        const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!gl) {
            console.error('WebGL background: could not create WebGL context');
            return false;
        }

        const compile = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('WebGL background shader error:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vertexShader = compile(gl.VERTEX_SHADER, WEBGL_BG_VERTEX_SHADER);
        const fragmentShader = compile(gl.FRAGMENT_SHADER, WEBGL_BG_FRAGMENT_SHADER);
        if (!vertexShader || !fragmentShader) return false;

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('WebGL background link error:', gl.getProgramInfoLog(program));
            return false;
        }
        gl.useProgram(program);

        // Full-screen triangle
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const positionLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        this.gl = gl;
        this.program = program;
        this.uniforms = {
            resolution: gl.getUniformLocation(program, 'u_resolution'),
            time: gl.getUniformLocation(program, 'u_time'),
            dayPhase: gl.getUniformLocation(program, 'u_dayPhase')
        };

        this.resize();
        return true;
    }

    resize() {
        if (!this.gl) return;
        // Cap the pixel ratio to keep fill-rate reasonable on high-DPI screens
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
        const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        this.gl.viewport(0, 0, width, height);
    }

    start() {
        if (this.running) return;
        this.running = true;
        window.addEventListener('resize', this.handleResize);
        if (!this.gl && !this.initGL()) {
            this.running = false;
            window.removeEventListener('resize', this.handleResize);
            return;
        }
        this.resize();
        this.scheduleFrame();
    }

    stop() {
        this.running = false;
        window.removeEventListener('resize', this.handleResize);
        this.cancelFrame();
    }

    scheduleFrame() {
        if (this.animationFrame !== null) return;
        this.animationFrame = requestAnimationFrame(() => {
            this.animationFrame = null;
            this.renderFrame();
        });
    }

    cancelFrame() {
        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    renderFrame() {
        if (!this.running || !this.gl || this.gl.isContextLost()) return;

        const gl = this.gl;
        const now = this.getTime();
        const dayPhase = (now.getHours() * 3600 + now.getMinutes() * 60 +
            now.getSeconds() + now.getMilliseconds() / 1000) / 86400;
        const elapsed = (performance.now() - this.startTimestamp) / 1000;

        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniforms.time, elapsed);
        gl.uniform1f(this.uniforms.dayPhase, dayPhase);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        this.scheduleFrame();
    }
}
