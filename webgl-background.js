/**
 * WebGL 3D Day/Night Background
 * A fully 3D animated background using WebGL
 */

class WebGLBackground {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.programs = {};
        this.buffers = {};
        this.objects = [];
        this.time = 0;
        this.isDaytime = true;
        this.sunMoonAngle = 0;
        this.animationFrameId = null;

        this.init();
    }

    init() {
        // Initialize WebGL context
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');

        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        const gl = this.gl;

        // Set canvas size
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Enable depth testing and blending
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Compile shaders and create programs
        this.createShaderPrograms();

        // Create scene objects
        this.createScene();

        // Start animation loop
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program linking error:', gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    createShaderPrograms() {
        // Sky dome shader
        this.programs.sky = this.createProgram(
            // Vertex shader
            `
            attribute vec3 position;
            uniform mat4 projection;
            uniform mat4 view;
            varying vec3 vPosition;

            void main() {
                vPosition = position;
                gl_Position = projection * view * vec4(position, 1.0);
            }
            `,
            // Fragment shader
            `
            precision mediump float;
            varying vec3 vPosition;
            uniform float timeOfDay; // 0.0 = night, 1.0 = day
            uniform vec3 sunDirection;

            void main() {
                // Calculate gradient based on position
                float height = normalize(vPosition).y;

                // Day colors
                vec3 dayTopColor = vec3(0.4, 0.6, 1.0); // Sky blue
                vec3 dayHorizonColor = vec3(0.7, 0.85, 1.0); // Light blue

                // Night colors
                vec3 nightTopColor = vec3(0.02, 0.02, 0.1); // Dark blue
                vec3 nightHorizonColor = vec3(0.1, 0.1, 0.2); // Slightly lighter

                // Sunrise/sunset colors
                vec3 sunsetColor = vec3(1.0, 0.5, 0.3);

                // Interpolate between top and horizon
                vec3 dayColor = mix(dayHorizonColor, dayTopColor, height);
                vec3 nightColor = mix(nightHorizonColor, nightTopColor, height);

                // Add sunset glow near sun
                float sunDot = max(dot(normalize(vPosition), sunDirection), 0.0);
                float sunGlow = pow(sunDot, 8.0);
                vec3 glowColor = sunsetColor * sunGlow * (1.0 - abs(timeOfDay - 0.5) * 2.0);

                // Mix day and night
                vec3 finalColor = mix(nightColor, dayColor, timeOfDay);
                finalColor += glowColor;

                gl_FragColor = vec4(finalColor, 1.0);
            }
            `
        );

        // Sphere shader (for sun, moon, planets)
        this.programs.sphere = this.createProgram(
            // Vertex shader
            `
            attribute vec3 position;
            attribute vec3 normal;
            uniform mat4 model;
            uniform mat4 view;
            uniform mat4 projection;
            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
                vNormal = normal;
                vPosition = position;
                gl_Position = projection * view * model * vec4(position, 1.0);
            }
            `,
            // Fragment shader
            `
            precision mediump float;
            varying vec3 vNormal;
            varying vec3 vPosition;
            uniform vec3 color;
            uniform float glow;
            uniform vec3 lightDir;

            void main() {
                vec3 normal = normalize(vNormal);
                float diffuse = max(dot(normal, lightDir), 0.3);

                vec3 finalColor = color * diffuse;

                // Add glow effect
                if (glow > 0.0) {
                    float edge = 1.0 - abs(dot(normal, vec3(0.0, 0.0, 1.0)));
                    finalColor += color * edge * glow;
                }

                gl_FragColor = vec4(finalColor, 1.0);
            }
            `
        );

        // Star shader
        this.programs.star = this.createProgram(
            // Vertex shader
            `
            attribute vec3 position;
            attribute float size;
            attribute float twinkle;
            uniform mat4 view;
            uniform mat4 projection;
            uniform float time;
            varying float vAlpha;

            void main() {
                vAlpha = 0.5 + 0.5 * sin(time * 2.0 + twinkle);
                gl_Position = projection * view * vec4(position, 1.0);
                gl_PointSize = size;
            }
            `,
            // Fragment shader
            `
            precision mediump float;
            varying float vAlpha;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                float alpha = (0.5 - dist) * 2.0 * vAlpha;
                gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
            }
            `
        );

        // Simple colored object shader (for trees, ground, etc.)
        this.programs.simple = this.createProgram(
            // Vertex shader
            `
            attribute vec3 position;
            attribute vec3 color;
            uniform mat4 model;
            uniform mat4 view;
            uniform mat4 projection;
            varying vec3 vColor;

            void main() {
                vColor = color;
                gl_Position = projection * view * model * vec4(position, 1.0);
            }
            `,
            // Fragment shader
            `
            precision mediump float;
            varying vec3 vColor;
            uniform float brightness;

            void main() {
                gl_FragColor = vec4(vColor * brightness, 1.0);
            }
            `
        );

        // Cloud shader
        this.programs.cloud = this.createProgram(
            // Vertex shader
            `
            attribute vec3 position;
            uniform mat4 model;
            uniform mat4 view;
            uniform mat4 projection;
            varying vec3 vPosition;

            void main() {
                vPosition = position;
                gl_Position = projection * view * model * vec4(position, 1.0);
            }
            `,
            // Fragment shader
            `
            precision mediump float;
            varying vec3 vPosition;
            uniform float opacity;

            void main() {
                // Simple soft cloud shape
                vec2 p = vPosition.xy;
                float dist = length(p);
                float cloud = smoothstep(1.0, 0.3, dist);

                gl_FragColor = vec4(1.0, 1.0, 1.0, cloud * opacity);
            }
            `
        );
    }

    createSphere(radius, segments) {
        const positions = [];
        const normals = [];
        const indices = [];

        for (let lat = 0; lat <= segments; lat++) {
            const theta = lat * Math.PI / segments;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= segments; lon++) {
                const phi = lon * 2 * Math.PI / segments;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = cosPhi * sinTheta;
                const y = cosTheta;
                const z = sinPhi * sinTheta;

                positions.push(radius * x, radius * y, radius * z);
                normals.push(x, y, z);
            }
        }

        for (let lat = 0; lat < segments; lat++) {
            for (let lon = 0; lon < segments; lon++) {
                const first = lat * (segments + 1) + lon;
                const second = first + segments + 1;

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        return { positions, normals, indices };
    }

    createScene() {
        const gl = this.gl;

        // Create sky dome
        const skyDome = this.createSphere(100, 32);
        this.buffers.sky = {
            position: this.createBuffer(skyDome.positions),
            indices: this.createIndexBuffer(skyDome.indices),
            indexCount: skyDome.indices.length
        };

        // Create sun
        const sun = this.createSphere(3, 16);
        this.buffers.sun = {
            position: this.createBuffer(sun.positions),
            normal: this.createBuffer(sun.normals),
            indices: this.createIndexBuffer(sun.indices),
            indexCount: sun.indices.length
        };

        // Create moon
        const moon = this.createSphere(2.5, 16);
        this.buffers.moon = {
            position: this.createBuffer(moon.positions),
            normal: this.createBuffer(moon.normals),
            indices: this.createIndexBuffer(moon.indices),
            indexCount: moon.indices.length
        };

        // Create stars
        this.createStars();

        // Create planets
        this.createPlanets();

        // Create ground
        this.createGround();

        // Create trees
        this.createTrees();

        // Create clouds
        this.createClouds();

        // Create cars
        this.createCars();
    }

    createBuffer(data) {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        return buffer;
    }

    createIndexBuffer(data) {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), gl.STATIC_DRAW);
        return buffer;
    }

    createStars() {
        const positions = [];
        const sizes = [];
        const twinkles = [];

        for (let i = 0; i < 200; i++) {
            // Random position on sphere
            const theta = Math.random() * Math.PI;
            const phi = Math.random() * Math.PI * 2;
            const radius = 95;

            const x = radius * Math.sin(theta) * Math.cos(phi);
            const y = radius * Math.cos(theta);
            const z = radius * Math.sin(theta) * Math.sin(phi);

            // Only place stars in upper hemisphere and slightly below horizon
            if (y > -10) {
                positions.push(x, y, z);
                sizes.push(1 + Math.random() * 2);
                twinkles.push(Math.random() * Math.PI * 2);
            }
        }

        this.buffers.stars = {
            position: this.createBuffer(positions),
            size: this.createBuffer(sizes),
            twinkle: this.createBuffer(twinkles),
            count: positions.length / 3
        };
    }

    createPlanets() {
        const planet = this.createSphere(1, 12);
        this.buffers.planet = {
            position: this.createBuffer(planet.positions),
            normal: this.createBuffer(planet.normals),
            indices: this.createIndexBuffer(planet.indices),
            indexCount: planet.indices.length
        };

        // Planet data
        this.planets = [
            { x: -70, y: 60, z: -50, radius: 1.5, color: [0.8, 0.6, 0.4] },
            { x: 60, y: 70, z: -60, radius: 1.2, color: [0.6, 0.5, 0.4] },
            { x: -50, y: 75, z: -70, radius: 1.0, color: [0.4, 0.6, 0.8] }
        ];
    }

    createGround() {
        // Simple ground plane
        const groundSize = 200;
        const positions = [
            -groundSize, -5, -groundSize,
            groundSize, -5, -groundSize,
            groundSize, -5, groundSize,
            -groundSize, -5, groundSize
        ];

        const colors = [
            0.2, 0.6, 0.2,
            0.2, 0.6, 0.2,
            0.2, 0.6, 0.2,
            0.2, 0.6, 0.2
        ];

        const indices = [0, 1, 2, 0, 2, 3];

        this.buffers.ground = {
            position: this.createBuffer(positions),
            color: this.createBuffer(colors),
            indices: this.createIndexBuffer(indices),
            indexCount: indices.length
        };
    }

    createTrees() {
        this.trees = [];
        const treePlacements = [
            { x: -40, z: -30 },
            { x: -30, z: -35 },
            { x: 40, z: -32 },
            { x: 45, z: -28 },
            { x: -60, z: -25 },
            { x: 60, z: -27 },
            { x: 0, z: -40 }
        ];

        treePlacements.forEach(pos => {
            this.trees.push({
                x: pos.x,
                y: -5,
                z: pos.z,
                height: 8 + Math.random() * 4
            });
        });

        // Create tree geometry (simple cone for pine tree)
        const treePositions = [];
        const treeColors = [];
        const treeIndices = [];
        const segments = 8;
        const height = 10;
        const radius = 3;

        // Cone
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            treePositions.push(x, 0, z);
            treeColors.push(0.2, 0.5, 0.2);
        }

        // Top vertex
        treePositions.push(0, height, 0);
        treeColors.push(0.2, 0.5, 0.2);

        // Create triangles
        for (let i = 0; i < segments; i++) {
            treeIndices.push(i, (i + 1) % segments, segments);
        }

        this.buffers.tree = {
            position: this.createBuffer(treePositions),
            color: this.createBuffer(treeColors),
            indices: this.createIndexBuffer(treeIndices),
            indexCount: treeIndices.length
        };
    }

    createClouds() {
        this.clouds = [];

        for (let i = 0; i < 8; i++) {
            this.clouds.push({
                x: -80 + Math.random() * 160,
                y: 20 + Math.random() * 30,
                z: -40 - Math.random() * 40,
                speed: 0.5 + Math.random() * 1.0,
                scale: 3 + Math.random() * 4
            });
        }

        // Simple quad for cloud
        const positions = [
            -1, -1, 0,
            1, -1, 0,
            1, 1, 0,
            -1, 1, 0
        ];

        const indices = [0, 1, 2, 0, 2, 3];

        this.buffers.cloud = {
            position: this.createBuffer(positions),
            indices: this.createIndexBuffer(indices),
            indexCount: indices.length
        };
    }

    createCars() {
        this.cars = [];

        for (let i = 0; i < 5; i++) {
            this.cars.push({
                x: -100 + Math.random() * 200,
                y: -4.5,
                z: -8 + (i % 2) * 4,
                speed: 5 + Math.random() * 10,
                direction: i % 2 === 0 ? 1 : -1,
                color: [Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5]
            });
        }

        // Simple car geometry (box shape)
        const positions = [
            // Body
            -2, 0, -1, 2, 0, -1, 2, 1, -1, -2, 1, -1,
            -2, 0, 1, 2, 0, 1, 2, 1, 1, -2, 1, 1,
            // Top
            -1.5, 1, -0.8, 1.5, 1, -0.8, 1.5, 1.8, -0.8, -1.5, 1.8, -0.8,
            -1.5, 1, 0.8, 1.5, 1, 0.8, 1.5, 1.8, 0.8, -1.5, 1.8, 0.8
        ];

        const colors = [];
        for (let i = 0; i < positions.length / 3; i++) {
            colors.push(1, 0, 0); // Will be replaced per car
        }

        const indices = [
            0, 1, 2, 0, 2, 3,
            4, 5, 6, 4, 6, 7,
            0, 1, 5, 0, 5, 4,
            2, 3, 7, 2, 7, 6,
            1, 2, 6, 1, 6, 5,
            0, 3, 7, 0, 7, 4,
            8, 9, 10, 8, 10, 11,
            12, 13, 14, 12, 14, 15,
            8, 9, 13, 8, 13, 12,
            10, 11, 15, 10, 15, 14,
            9, 10, 14, 9, 14, 13,
            8, 11, 15, 8, 15, 12
        ];

        this.buffers.car = {
            position: this.createBuffer(positions),
            color: this.createBuffer(colors),
            indices: this.createIndexBuffer(indices),
            indexCount: indices.length
        };
    }

    createMatrix4() {
        return new Float32Array(16);
    }

    identity(out) {
        out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
        out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
        return out;
    }

    perspective(out, fov, aspect, near, far) {
        const f = 1.0 / Math.tan(fov / 2);
        const nf = 1 / (near - far);

        out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
        out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;

        return out;
    }

    lookAt(out, eye, center, up) {
        const eyex = eye[0], eyey = eye[1], eyez = eye[2];
        const centerx = center[0], centery = center[1], centerz = center[2];
        const upx = up[0], upy = up[1], upz = up[2];

        let z0 = eyex - centerx;
        let z1 = eyey - centery;
        let z2 = eyez - centerz;

        let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
        z0 *= len;
        z1 *= len;
        z2 *= len;

        let x0 = upy * z2 - upz * z1;
        let x1 = upz * z0 - upx * z2;
        let x2 = upx * z1 - upy * z0;
        len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
        if (!len) {
            x0 = 0;
            x1 = 0;
            x2 = 0;
        } else {
            len = 1 / len;
            x0 *= len;
            x1 *= len;
            x2 *= len;
        }

        let y0 = z1 * x2 - z2 * x1;
        let y1 = z2 * x0 - z0 * x2;
        let y2 = z0 * x1 - z1 * x0;

        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
        out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
        out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
        out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
        out[15] = 1;

        return out;
    }

    translate(out, a, v) {
        const x = v[0], y = v[1], z = v[2];

        out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
        out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
        out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];

        return out;
    }

    scale(out, a, v) {
        const x = v[0], y = v[1], z = v[2];

        out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
        out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
        out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];

        return out;
    }

    rotateY(out, a, rad) {
        const s = Math.sin(rad);
        const c = Math.cos(rad);
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];

        out[0] = a00 * c + a20 * s;
        out[1] = a01 * c + a21 * s;
        out[2] = a02 * c + a22 * s;
        out[3] = a03 * c + a23 * s;
        out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
        out[8] = a20 * c - a00 * s;
        out[9] = a21 * c - a01 * s;
        out[10] = a22 * c - a02 * s;
        out[11] = a23 * c - a03 * s;
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];

        return out;
    }

    updateTimeOfDay(isDaytime, sunMoonAngle) {
        this.isDaytime = isDaytime;
        this.sunMoonAngle = sunMoonAngle;
    }

    render() {
        const gl = this.gl;

        // Calculate time of day (0 = night, 1 = day)
        const timeOfDay = this.isDaytime ? 1.0 : 0.0;
        const brightness = 0.3 + timeOfDay * 0.7;

        // Clear
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Setup matrices
        const projection = this.createMatrix4();
        const view = this.createMatrix4();
        const model = this.createMatrix4();

        const aspect = this.canvas.width / this.canvas.height;
        this.perspective(projection, Math.PI / 3, aspect, 0.1, 500);
        this.lookAt(view, [0, 5, 30], [0, 0, -10], [0, 1, 0]);

        // Calculate sun/moon position
        const sunX = Math.cos(this.sunMoonAngle) * 60;
        const sunY = Math.sin(this.sunMoonAngle) * 60;
        const sunDirection = [sunX, sunY, -50];
        const len = Math.sqrt(sunDirection[0] ** 2 + sunDirection[1] ** 2 + sunDirection[2] ** 2);
        sunDirection[0] /= len;
        sunDirection[1] /= len;
        sunDirection[2] /= len;

        // Render sky
        this.renderSky(projection, view, timeOfDay, sunDirection);

        // Render celestial bodies
        if (this.isDaytime) {
            this.renderSun(projection, view, sunX, sunY);
        } else {
            this.renderMoon(projection, view, sunX, sunY);
            this.renderStars(projection, view, this.time);
            this.renderPlanets(projection, view);
        }

        // Render clouds
        this.renderClouds(projection, view, timeOfDay);

        // Render ground
        this.renderGround(projection, view, brightness);

        // Render trees
        this.renderTrees(projection, view, brightness);

        // Render cars
        this.renderCars(projection, view, brightness);
    }

    renderSky(projection, view, timeOfDay, sunDirection) {
        const gl = this.gl;
        const program = this.programs.sky;

        gl.useProgram(program);
        gl.disable(gl.DEPTH_TEST);

        // Set uniforms
        const projLoc = gl.getUniformLocation(program, 'projection');
        const viewLoc = gl.getUniformLocation(program, 'view');
        const timeLoc = gl.getUniformLocation(program, 'timeOfDay');
        const sunDirLoc = gl.getUniformLocation(program, 'sunDirection');

        gl.uniformMatrix4fv(projLoc, false, projection);
        gl.uniformMatrix4fv(viewLoc, false, view);
        gl.uniform1f(timeLoc, timeOfDay);
        gl.uniform3fv(sunDirLoc, sunDirection);

        // Bind buffers
        const posLoc = gl.getAttribLocation(program, 'position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.sky.position);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        // Draw
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.sky.indices);
        gl.drawElements(gl.TRIANGLES, this.buffers.sky.indexCount, gl.UNSIGNED_SHORT, 0);

        gl.enable(gl.DEPTH_TEST);
    }

    renderSun(projection, view, x, y) {
        const gl = this.gl;
        const program = this.programs.sphere;

        gl.useProgram(program);

        const model = this.createMatrix4();
        this.identity(model);
        this.translate(model, model, [x, y, -50]);

        // Set uniforms
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, projection);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
        gl.uniform3f(gl.getUniformLocation(program, 'color'), 1.0, 0.9, 0.3);
        gl.uniform1f(gl.getUniformLocation(program, 'glow'), 0.8);
        gl.uniform3f(gl.getUniformLocation(program, 'lightDir'), 0, 0, 1);

        // Bind buffers
        const posLoc = gl.getAttribLocation(program, 'position');
        const normLoc = gl.getAttribLocation(program, 'normal');

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.sun.position);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.sun.normal);
        gl.enableVertexAttribArray(normLoc);
        gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);

        // Draw
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.sun.indices);
        gl.drawElements(gl.TRIANGLES, this.buffers.sun.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    renderMoon(projection, view, x, y) {
        const gl = this.gl;
        const program = this.programs.sphere;

        gl.useProgram(program);

        const model = this.createMatrix4();
        this.identity(model);
        this.translate(model, model, [x, y, -50]);

        // Set uniforms
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, projection);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
        gl.uniform3f(gl.getUniformLocation(program, 'color'), 0.9, 0.9, 0.95);
        gl.uniform1f(gl.getUniformLocation(program, 'glow'), 0.3);
        gl.uniform3f(gl.getUniformLocation(program, 'lightDir'), 0, 0, 1);

        // Bind buffers
        const posLoc = gl.getAttribLocation(program, 'position');
        const normLoc = gl.getAttribLocation(program, 'normal');

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.moon.position);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.moon.normal);
        gl.enableVertexAttribArray(normLoc);
        gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);

        // Draw
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.moon.indices);
        gl.drawElements(gl.TRIANGLES, this.buffers.moon.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    renderStars(projection, view, time) {
        const gl = this.gl;
        const program = this.programs.star;

        gl.useProgram(program);

        // Set uniforms
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, projection);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
        gl.uniform1f(gl.getUniformLocation(program, 'time'), time);

        // Bind buffers
        const posLoc = gl.getAttribLocation(program, 'position');
        const sizeLoc = gl.getAttribLocation(program, 'size');
        const twinkleLoc = gl.getAttribLocation(program, 'twinkle');

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.stars.position);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.stars.size);
        gl.enableVertexAttribArray(sizeLoc);
        gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.stars.twinkle);
        gl.enableVertexAttribArray(twinkleLoc);
        gl.vertexAttribPointer(twinkleLoc, 1, gl.FLOAT, false, 0, 0);

        // Draw
        gl.drawArrays(gl.POINTS, 0, this.buffers.stars.count);
    }

    renderPlanets(projection, view) {
        const gl = this.gl;
        const program = this.programs.sphere;

        gl.useProgram(program);

        this.planets.forEach(planet => {
            const model = this.createMatrix4();
            this.identity(model);
            this.translate(model, model, [planet.x, planet.y, planet.z]);
            this.scale(model, model, [planet.radius, planet.radius, planet.radius]);

            // Set uniforms
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, projection);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
            gl.uniform3fv(gl.getUniformLocation(program, 'color'), planet.color);
            gl.uniform1f(gl.getUniformLocation(program, 'glow'), 0.0);
            gl.uniform3f(gl.getUniformLocation(program, 'lightDir'), 0, 0, 1);

            // Bind buffers
            const posLoc = gl.getAttribLocation(program, 'position');
            const normLoc = gl.getAttribLocation(program, 'normal');

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.planet.position);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.planet.normal);
            gl.enableVertexAttribArray(normLoc);
            gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);

            // Draw
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.planet.indices);
            gl.drawElements(gl.TRIANGLES, this.buffers.planet.indexCount, gl.UNSIGNED_SHORT, 0);
        });
    }

    renderGround(projection, view, brightness) {
        const gl = this.gl;
        const program = this.programs.simple;

        gl.useProgram(program);

        const model = this.createMatrix4();
        this.identity(model);

        // Set uniforms
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, projection);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
        gl.uniform1f(gl.getUniformLocation(program, 'brightness'), brightness);

        // Bind buffers
        const posLoc = gl.getAttribLocation(program, 'position');
        const colorLoc = gl.getAttribLocation(program, 'color');

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.ground.position);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.ground.color);
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);

        // Draw
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.ground.indices);
        gl.drawElements(gl.TRIANGLES, this.buffers.ground.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    renderTrees(projection, view, brightness) {
        const gl = this.gl;
        const program = this.programs.simple;

        gl.useProgram(program);

        this.trees.forEach(tree => {
            const model = this.createMatrix4();
            this.identity(model);
            this.translate(model, model, [tree.x, tree.y, tree.z]);
            this.scale(model, model, [1, tree.height / 10, 1]);

            // Set uniforms
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, projection);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
            gl.uniform1f(gl.getUniformLocation(program, 'brightness'), brightness);

            // Bind buffers
            const posLoc = gl.getAttribLocation(program, 'position');
            const colorLoc = gl.getAttribLocation(program, 'color');

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.tree.position);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.tree.color);
            gl.enableVertexAttribArray(colorLoc);
            gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);

            // Draw
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.tree.indices);
            gl.drawElements(gl.TRIANGLES, this.buffers.tree.indexCount, gl.UNSIGNED_SHORT, 0);
        });
    }

    renderClouds(projection, view, timeOfDay) {
        const gl = this.gl;
        const program = this.programs.cloud;

        gl.useProgram(program);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const opacity = 0.3 + timeOfDay * 0.4;

        this.clouds.forEach(cloud => {
            const model = this.createMatrix4();
            this.identity(model);
            this.translate(model, model, [cloud.x, cloud.y, cloud.z]);
            this.scale(model, model, [cloud.scale, cloud.scale, 1]);

            // Set uniforms
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, projection);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
            gl.uniform1f(gl.getUniformLocation(program, 'opacity'), opacity);

            // Bind buffers
            const posLoc = gl.getAttribLocation(program, 'position');

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.cloud.position);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

            // Draw
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.cloud.indices);
            gl.drawElements(gl.TRIANGLES, this.buffers.cloud.indexCount, gl.UNSIGNED_SHORT, 0);
        });
    }

    renderCars(projection, view, brightness) {
        const gl = this.gl;
        const program = this.programs.simple;

        gl.useProgram(program);

        this.cars.forEach(car => {
            const model = this.createMatrix4();
            this.identity(model);
            this.translate(model, model, [car.x, car.y, car.z]);
            if (car.direction < 0) {
                this.rotateY(model, model, Math.PI);
            }

            // Set uniforms
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, projection);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
            gl.uniform1f(gl.getUniformLocation(program, 'brightness'), brightness);

            // Update car colors
            const colorData = [];
            for (let i = 0; i < 16; i++) {
                colorData.push(...car.color);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.car.color);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colorData), gl.DYNAMIC_DRAW);

            // Bind buffers
            const posLoc = gl.getAttribLocation(program, 'position');
            const colorLoc = gl.getAttribLocation(program, 'color');

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.car.position);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.car.color);
            gl.enableVertexAttribArray(colorLoc);
            gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);

            // Draw
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.car.indices);
            gl.drawElements(gl.TRIANGLES, this.buffers.car.indexCount, gl.UNSIGNED_SHORT, 0);
        });
    }

    update(deltaTime) {
        this.time += deltaTime * 0.001;

        // Update clouds
        this.clouds.forEach(cloud => {
            cloud.x += cloud.speed * deltaTime * 0.01;
            if (cloud.x > 100) cloud.x = -100;
        });

        // Update cars
        this.cars.forEach(car => {
            car.x += car.speed * car.direction * deltaTime * 0.01;
            if (car.x > 120) car.x = -120;
            if (car.x < -120) car.x = 120;
        });
    }

    animate() {
        let lastTime = performance.now();

        const loop = (currentTime) => {
            const deltaTime = currentTime - lastTime;
            lastTime = currentTime;

            this.update(deltaTime);
            this.render();

            this.animationFrameId = requestAnimationFrame(loop);
        };

        this.animationFrameId = requestAnimationFrame(loop);
    }

    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }
}
