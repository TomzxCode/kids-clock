// WebGL Dynamic Background for Kids Clock
// Renders a photorealistic procedural landscape on the GPU, driven by the
// time of day. Uses a physically-inspired atmospheric scattering model
// (Rayleigh + Mie) with HDR lighting and ACES tonemapping. The sun and moon
// travel across the sky, perspective clouds drift overhead, fbm mountain
// ridges recede in aerial perspective, and small wildlife (birds, sheep,
// a rabbit, butterflies, fireflies) inhabit the meadow.

const WEBGL_BG_VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const WEBGL_BG_FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;     // seconds, drives animation (clouds, twinkle, critters)
uniform float u_dayPhase; // 0..1 fraction of the 24h day (0 = midnight)

#define PI 3.14159265359
#define TWO_PI 6.28318530718

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    const mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p = rot * p * 2.03 + vec2(11.7, 5.3);
        a *= 0.5;
    }
    return v;
}

// Transmittance of direct sunlight through the atmosphere for a given
// sun height: white overhead, deep orange-red at the horizon
vec3 sunTrans(float y) {
    float m = 1.0 / max(y * 1.8 + 0.06, 0.02);
    return exp(-vec3(0.07, 0.17, 0.40) * m);
}

// Single-slab atmospheric scattering: Rayleigh (blue sky, white horizon
// haze) plus Mie forward scattering (warm glow around a low sun)
vec3 skyRadiance(vec3 rd, vec3 sd, vec3 sunT) {
    float y = max(rd.y, 0.0);
    float mu = clamp(dot(rd, sd), -1.0, 1.0);
    float dayAmt = smoothstep(-0.10, 0.25, sd.y);
    float duskAmt = smoothstep(-0.22, 0.08, sd.y);

    vec3 betaR = vec3(0.12, 0.27, 0.64);
    float od = 1.0 / (y + 0.085);
    vec3 tView = exp(-betaR * od);

    float phR = 0.75 * (1.0 + mu * mu);
    float g = 0.82;
    float phM = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));

    vec3 col = (1.0 - tView) * phR * mix(vec3(1.0), sunT, 0.4) * (0.04 + 1.00 * dayAmt);
    // Mie glow: tight and subtle in full day, broad and fiery at dusk/dawn
    col += (1.0 - exp(-od * 0.30)) * phM * sunT * (0.45 + 1.5 * (1.0 - dayAmt)) * duskAmt;
    // faint night airglow near the horizon
    col += (1.0 - tView.b) * vec3(0.010, 0.013, 0.024) * (1.0 - dayAmt);
    return col;
}

// Domain-warped fbm cloud field
float cloudDensity(vec2 cp, float t) {
    cp += vec2(t * 0.008, t * 0.002);
    float q = fbm(cp * 0.5);
    vec2 warp = vec2(fbm(cp * 0.9 + q * 1.4),
                     fbm(cp * 0.9 + q * 1.4 + vec2(5.2, 1.3)));
    return fbm(cp * 1.3 + (warp - 0.5) * 1.3);
}

float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float ellipseMask(vec2 rel, vec2 r, float soft) {
    return smoothstep(1.0 + soft, 1.0 - soft, length(rel / r));
}

// Conifer silhouette with a noisy edge so it reads as layered branches
float conifer(vec2 rel, float s, float seed, float e) {
    float hgt = 0.14 * s;
    float ty = rel.y / hgt;
    float band = step(0.0, ty) * step(ty, 1.0);
    float w = 0.030 * s * (1.0 - ty * 0.92)
            * (0.50 + 0.65 * vnoise(vec2(rel.y * 130.0 / s, seed)));
    float foliage = band * smoothstep(e, -e, abs(rel.x) - w);
    float trunk = step(abs(rel.x), 0.0022 * s)
                * step(-0.012 * s, rel.y) * step(rel.y, 0.02 * s);
    return max(foliage, trunk);
}

// Two-stroke gull silhouette with flapping wings
float birdMask(vec2 rel, float flap, float s, float e) {
    vec2 tipL = vec2(-0.011, 0.008 * flap) * s;
    vec2 tipR = vec2(0.011, 0.008 * flap) * s;
    float d = min(segDist(rel, vec2(0.0), tipL), segDist(rel, vec2(0.0), tipR));
    return smoothstep(0.0016 * s + e, 0.0016 * s - e, d);
}

vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
    vec2 fragUV = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    float t = u_time;
    float e = 1.5 / u_resolution.y;

    // Camera ray; horizon sits at 30% of screen height
    vec2 q = vec2((fragUV.x - 0.5) * aspect, fragUV.y - 0.30);
    vec3 rd = normalize(vec3(q.x, q.y, 0.9));

    // Sun rises at 06:00, peaks at noon, sets at 18:00; moon on the
    // opposite arc, in a slightly different orbital plane
    // Orbits are flattened so both bodies stay inside the camera frame
    // at their culmination instead of passing overhead out of view
    float ang = (u_dayPhase - 0.25) * TWO_PI;
    vec3 sunDir = normalize(vec3(-cos(ang) * 0.78, sin(ang) * 0.59, 0.90));
    vec3 moonDir = normalize(vec3(cos(ang) * 0.78, -sin(ang) * 0.59, 0.90));

    float dayAmt = smoothstep(-0.10, 0.25, sunDir.y);
    float duskAmt = smoothstep(-0.22, 0.08, sunDir.y);
    float moonUp = smoothstep(0.0, 0.20, moonDir.y);
    vec3 sunT = sunTrans(sunDir.y);

    // ------ Sky ------
    vec3 col = skyRadiance(rd, sunDir, sunT);

    // Sun disc (HDR — the tonemapper turns it into a hot white core)
    float mu = dot(rd, sunDir);
    col += smoothstep(0.99950, 0.99978, mu) * sunT * 40.0;
    col += pow(max(mu, 0.0), 900.0) * sunT * 4.0;

    // ------ Stars & milky way ------
    float starVis = (1.0 - dayAmt) * smoothstep(0.0, 0.12, rd.y);
    if (starVis > 0.002) {
        vec2 sc = rd.xy / (rd.z + 1.2) * 130.0;
        vec2 cellS = floor(sc);
        float hs = hash12(cellS);
        vec2 sPos = vec2(hash12(cellS + 0.17), hash12(cellS + 0.53)) * 0.8 + 0.1;
        float dS = length(fract(sc) - sPos);
        float mag = pow(hash12(cellS + 0.71), 5.0) * 0.8 + 0.08;
        float tw = 0.75 + 0.25 * sin(t * (1.0 + hs * 4.0) + hs * 40.0);
        col += smoothstep(0.12, 0.0, dS) * step(0.72, hs) * mag * tw * starVis
             * vec3(0.85, 0.90, 1.05) * 1.3;
        // faint milky way band
        float mwd = rd.y - (0.55 - rd.x * 0.35);
        float mw = exp(-mwd * mwd * 28.0) * fbm(rd.xy * 4.0 + 7.3);
        col += mw * starVis * vec3(0.014, 0.016, 0.022);
    }

    // ------ Moon: sphere shaded by real sun direction (correct phases) ------
    if (moonDir.y > -0.05) {
        float mcos = dot(rd, moonDir);
        vec3 mws = rd - moonDir * mcos;
        float sinA = length(mws);
        float moonR = 0.024;
        float moonVis = smoothstep(-0.05, 0.10, moonDir.y);
        if (mcos > 0.0 && sinA < moonR) {
            vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir));
            vec3 my = cross(moonDir, mx);
            vec2 muv = vec2(dot(mws, mx), dot(mws, my)) / moonR;
            float r2 = dot(muv, muv);
            vec3 n = normalize(mx * muv.x + my * muv.y - moonDir * sqrt(max(1.0 - r2, 0.0)));
            // Light the sphere from the true anti-sun direction (the flattened
            // display orbits would otherwise give impossible phases)
            vec3 moonLightDir = normalize(mix(-moonDir, sunDir, 0.30));
            float ndl = clamp(dot(n, moonLightDir), 0.0, 1.0);
            float alb = 0.95 - 0.45 * fbm(muv * 3.5 + 7.0);   // dark maria
            alb *= 0.80 + 0.35 * fbm(muv * 9.0);              // crater detail
            float edgeM = smoothstep(1.0, 0.90, r2);
            vec3 mcol = vec3(1.0, 0.97, 0.90) * alb * (ndl * 2.2 + 0.02);
            col = mix(col, mcol, edgeM * moonVis);
        }
        col += exp(-sinA * 45.0) * vec3(0.045, 0.055, 0.085) * (1.0 - dayAmt) * moonVis;
    }

    // ------ Clouds on a perspective plane, lit toward the sun ------
    if (rd.y > 0.012) {
        float ct = 0.35 / rd.y;
        vec2 cp = rd.xz * ct * 1.6;
        float dens = cloudDensity(cp, t);
        float cover = smoothstep(0.64, 0.84, dens);
        if (cover > 0.001) {
            float dToSun = cloudDensity(cp + sunDir.xz * 0.18, t);
            float lit = clamp((dens - dToSun) * 3.0, -1.0, 1.0) * 0.5 + 0.5;
            vec3 cloudAmb = mix(vec3(0.012, 0.016, 0.030), vec3(0.30, 0.37, 0.50), dayAmt)
                          + vec3(0.020, 0.024, 0.038) * moonUp * (1.0 - dayAmt);
            vec3 cloudCol = cloudAmb + sunT * (1.3 * lit + 0.15) * duskAmt;
            float fade = exp(-ct * 0.35) * smoothstep(0.012, 0.05, rd.y);
            col = mix(col, cloudCol, cover * fade * 0.85);
        }
    }

    // ------ Birds (day, distant silhouettes) ------
    float birdVis = smoothstep(0.10, 0.40, dayAmt);
    if (birdVis > 0.001 && fragUV.y > 0.45) {
        for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float bx = (fract(t * (0.010 + fi * 0.003) + fi * 0.37) - 0.5) * (aspect + 0.15);
            float by = 0.58 + 0.10 * fract(fi * 0.618) + 0.010 * sin(t * 1.3 + fi * 2.0);
            float flap = sin(t * (6.0 + fi * 0.8) + fi * 2.4);
            float bm = birdMask(vec2(q.x - bx, fragUV.y - by), flap, 0.6 + 0.12 * fi, e);
            col = mix(col, vec3(0.02, 0.022, 0.028), bm * birdVis * 0.85);
        }
    }

    // ------ Terrain: layered fbm ridges with aerial perspective ------
    float sy = fragUV.y;
    float sx = q.x;

    vec3 horizonSky = skyRadiance(normalize(vec3(rd.x, 0.035, rd.z)), sunDir, sunT);

    vec3 lightSun = sunT * smoothstep(-0.02, 0.30, sunDir.y) * 1.7;
    vec3 lightSky = mix(vec3(0.006, 0.008, 0.016), vec3(0.16, 0.22, 0.35), dayAmt);
    vec3 lightMoon = vec3(0.018, 0.022, 0.038) * moonUp * (1.0 - dayAmt);
    vec3 terrLight = lightSun + lightSky + lightMoon;

    // Distant mountains, heavily hazed
    float hm = 0.315 + (fbm(vec2(sx * 1.3 + 7.7, 2.1)) - 0.5) * 0.17;
    float mMask = smoothstep(hm + e, hm - e, sy);
    vec3 mCol = mix(vec3(0.075, 0.085, 0.080) * terrLight, horizonSky, 0.70);
    col = mix(col, mCol, mMask);

    // Forested mid hills with a jagged treeline silhouette
    float hf = 0.262 + (fbm(vec2(sx * 2.3 + 3.1, 8.4)) - 0.5) * 0.09;
    hf += (0.5 + 0.5 * vnoise(vec2(sx * 8.0, 4.2)))
        * (0.25 + 0.75 * vnoise(vec2(sx * 85.0, 9.9))) * 0.028;
    float fMask = smoothstep(hf + e, hf - e, sy);
    vec3 fAlb = vec3(0.022, 0.042, 0.018) * (0.75 + 0.5 * fbm(vec2(sx * 22.0, sy * 22.0)));
    col = mix(col, mix(fAlb * terrLight, horizonSky, 0.22), fMask);

    // Near grassy hill with slope-dependent sun shading
    float hn = 0.208 + (fbm(vec2(sx * 3.2 + 11.0, 1.7)) - 0.5) * 0.075;
    float hnDx = 0.208 + (fbm(vec2((sx + 0.012) * 3.2 + 11.0, 1.7)) - 0.5) * 0.075;
    float slope = (hnDx - hn) / 0.012;
    float shade = clamp(1.0 - slope * sunDir.x * 1.5, 0.55, 1.35);
    float nMask = smoothstep(hn + e, hn - e, sy);
    vec3 gAlb = vec3(0.070, 0.140, 0.038) * (0.70 + 0.55 * fbm(vec2(sx * 35.0, sy * 35.0)));
    col = mix(col, mix(gAlb * terrLight * shade, horizonSky, 0.07), nMask);

    // Conifers standing on the near hill
    vec3 treeCol = mix(vec3(0.020, 0.050, 0.014) * terrLight, horizonSky, 0.03);
    float treeTex = 0.75 + 0.5 * vnoise(vec2(sx * 90.0, sy * 90.0));
    float th1 = 0.208 + (fbm(vec2(-0.62 * 3.2 + 11.0, 1.7)) - 0.5) * 0.075;
    float th2 = 0.208 + (fbm(vec2(-0.18 * 3.2 + 11.0, 1.7)) - 0.5) * 0.075;
    float th3 = 0.208 + (fbm(vec2(0.58 * 3.2 + 11.0, 1.7)) - 0.5) * 0.075;
    float tMask = conifer(vec2(sx + 0.62, sy - th1 + 0.006), 1.00, 3.7, e);
    tMask = max(tMask, conifer(vec2(sx + 0.18, sy - th2 + 0.006), 0.72, 8.1, e));
    tMask = max(tMask, conifer(vec2(sx - 0.58, sy - th3 + 0.006), 1.15, 5.9, e));
    col = mix(col, treeCol * treeTex, tMask);

    // Sheep grazing on the near hill (distant white specks with shadows)
    for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float xsh = mix(-0.31, 0.15, fi) + sin(t * 0.02 + fi * 3.0) * 0.03;
        float shh = 0.208 + (fbm(vec2(xsh * 3.2 + 11.0, 1.7)) - 0.5) * 0.075;
        vec2 srel = vec2(sx - xsh, sy - (shh - 0.011));
        float shadow = ellipseMask(srel - vec2(0.0, -0.006), vec2(0.012, 0.003), 0.5);
        col = mix(col, col * 0.55, shadow * 0.5 * dayAmt * nMask);
        float body = ellipseMask(srel, vec2(0.010, 0.0068), 0.18);
        float head = ellipseMask(srel - vec2(0.0085, 0.0005), vec2(0.0038, 0.0042), 0.25);
        col = mix(col, vec3(0.62, 0.60, 0.55) * terrLight, body * nMask);
        col = mix(col, vec3(0.055, 0.050, 0.048) * terrLight, head * nMask);
    }

    // Foreground meadow with vertical grass-blade streaks
    float hd = 0.128 + (fbm(vec2(sx * 4.6 + 23.0, 6.3)) - 0.5) * 0.055;
    float dMask = smoothstep(hd + e, hd - e, sy);
    float bladeWarp = vnoise(vec2(sy * 40.0, sx * 6.0)) * 3.0;
    float blades = vnoise(vec2(sx * 200.0 + bladeWarp, sy * 30.0))
                 * vnoise(vec2(sx * 47.0 + 9.0, sy * 18.0));
    blades = 0.78 + 0.60 * blades;
    vec3 dAlb = vec3(0.060, 0.135, 0.030) * blades
              * (0.8 + 0.4 * fbm(vec2(sx * 12.0, sy * 12.0)));
    vec3 dCol = dAlb * terrLight * (1.0 - 0.30 * smoothstep(hd, -0.1, sy));
    col = mix(col, dCol, dMask);

    // Wildflowers speckled through the meadow (day)
    vec2 flc = floor(vec2(sx, sy) * 90.0);
    float flh = hash12(flc + 3.3);
    vec2 flp = (flc + vec2(hash12(flc + 1.1), hash12(flc + 2.2))) / 90.0;
    float fld = length(vec2(sx, sy) - flp);
    vec3 flCol = mix(vec3(0.75, 0.75, 0.70), vec3(0.85, 0.75, 0.25), step(0.6, hash12(flc + 4.4)));
    col = mix(col, flCol * terrLight * 1.3,
              smoothstep(0.0028, 0.0012, fld) * step(0.965, flh) * dMask * dayAmt);

    // Rabbit hopping across the meadow ridge
    float rbx = (fract(t * 0.009 + 0.3) - 0.5) * (aspect + 0.2);
    float rbh = 0.128 + (fbm(vec2(rbx * 4.6 + 23.0, 6.3)) - 0.5) * 0.055;
    float hop = abs(sin(t * 4.5)) * 0.009;
    vec2 rrel = vec2(sx - rbx, sy - (rbh + 0.002 + hop));
    float rBody = ellipseMask(rrel, vec2(0.0075, 0.0052), 0.2);
    float rHead = ellipseMask(rrel - vec2(0.0068, 0.0042), vec2(0.0036, 0.0033), 0.25);
    float rEars = max(ellipseMask(rrel - vec2(0.0048, 0.0100), vec2(0.0012, 0.0038), 0.3),
                      ellipseMask(rrel - vec2(0.0078, 0.0096), vec2(0.0012, 0.0035), 0.3));
    col = mix(col, vec3(0.085, 0.062, 0.045) * terrLight, max(rBody, max(rHead, rEars)));

    // Butterflies over the meadow (day)
    for (int i = 0; i < 2; i++) {
        float fi = float(i);
        vec2 bp = vec2(mix(-0.30, 0.28, fi) + 0.14 * sin(t * 0.35 + fi * 3.1),
                       0.165 + 0.035 * sin(t * 0.8 + fi * 1.9));
        float flapB = 0.4 + 0.6 * abs(sin(t * 9.0 + fi * 2.0));
        float bf = smoothstep(0.0038 * flapB, 0.0012, length(vec2(sx, sy) - bp));
        vec3 bCol = mix(vec3(0.85, 0.70, 0.30), vec3(0.80, 0.80, 0.85), fi);
        col = mix(col, bCol * terrLight * 1.5, bf * dayAmt * 0.9);
    }

    // Fireflies drifting over the meadow at night
    vec2 gCell = floor(vec2(sx, sy) * 12.0);
    float gh = hash12(gCell + 5.0);
    vec2 gPos = (gCell + 0.5 + 0.32 * vec2(sin(t * 0.6 + gh * 40.0),
                                           cos(t * 0.8 + gh * 60.0))) / 12.0;
    float blink = max(sin(t * (0.8 + gh * 1.5) + gh * 30.0), 0.0);
    float firefly = exp(-length(vec2(sx, sy) - gPos) * 400.0) * step(0.72, gh) * blink * blink;
    col += firefly * vec3(0.35, 0.60, 0.12) * (1.0 - dayAmt) * max(dMask, nMask);

    // ------ Exposure, filmic tonemap, gamma, vignette ------
    col = aces(col * 1.35);
    col = pow(col, vec3(0.4545));
    col *= 1.0 - 0.30 * dot(fragUV - 0.5, fragUV - 0.5);
    col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;

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
