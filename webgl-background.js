// WebGL Dynamic Background for Kids Clock
// Renders a procedural day/night scene on the GPU: the sun and moon travel
// across the sky based on the time of day, clouds drift, stars twinkle at
// night and fireflies glow over rolling hills.

const WEBGL_BG_VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const WEBGL_BG_FRAGMENT_SHADER = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;     // seconds, drives animation (clouds, twinkle)
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

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

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

    // Rolling hills, two silhouette layers
    float edge = 2.0 / u_resolution.y;
    float hill1 = 0.24 + 0.05 * sin(p.x * 2.1 + 1.7) + 0.025 * sin(p.x * 5.3 + 0.4);
    float hill2 = 0.15 + 0.04 * sin(p.x * 3.0 + 4.0) + 0.020 * sin(p.x * 7.1 + 2.0);
    float m1 = smoothstep(hill1 + edge, hill1 - edge, uv.y);
    float m2 = smoothstep(hill2 + edge, hill2 - edge, uv.y);
    vec3 col = sky;
    col = mix(col, mix(vec3(0.05, 0.10, 0.16), vec3(0.35, 0.65, 0.30), daylight), m1);
    col = mix(col, mix(vec3(0.03, 0.07, 0.12), vec3(0.25, 0.52, 0.22), daylight), m2);

    // Fireflies wandering over the hills at night
    vec2 fCell = floor(p * 10.0);
    float fh = hash(fCell + 5.0);
    vec2 fPos = (fCell + 0.5 + 0.3 * vec2(sin(u_time * 0.7 + fh * 40.0),
                                          cos(u_time * 0.9 + fh * 60.0))) / 10.0;
    float blink = 0.5 + 0.5 * sin(u_time * (1.0 + fh * 2.0) + fh * 30.0);
    float firefly = exp(-distance(p, fPos) * 220.0) * step(0.75, fh) * blink;
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
