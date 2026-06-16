// ============================================================
// F1 RACER — full rewrite
// ============================================================

// --- 1. IDENTITY ---
const myId = 'p_' + Math.random().toString(36).substr(2, 6);
let myName = "Racer";
let myColor = "#ff3333";
const players = {};

// --- 2. RACE STATE ---
let gameState = -1;   // -1=menu, 0=joining, 1=countdown, 2=racing, 3=finished
let raceStartTime = 0;

const totalLaps = 3;
let lapsCompleted = 0;
let currentLap = 1;
let nextCheckpointIndex = 0;

// --- 3. PHYSICS ---
let speed = 0;
const maxSpeed      = 1.3;
const acceleration  = 0.03;
const deceleration  = 0.01;
const turnSpeed     = 0.03;
let barrierHitCooldown = 0;
const keys = { w: false, a: false, s: false, d: false };

// ============================================================
// 4. AUDIO
// ============================================================
let audioCtx, engineOsc, engineGain;

function initAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(40, audioCtx.currentTime);
    engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
    engineOsc.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();
}

function playBeep(freq, dur, type = 'square') {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g   = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(0.1, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
}

function playCrashSound() {
    if (!audioCtx) return;
    playBeep(80, 0.3, 'sawtooth');
    setTimeout(() => playBeep(60, 0.2, 'square'), 100);
}

function playFinishFanfare() {
    playBeep(440, 0.2);
    setTimeout(() => playBeep(554, 0.2), 200);
    setTimeout(() => playBeep(659, 0.6), 400);
}

// ============================================================
// 5. THREE.JS SCENE
// ============================================================
const scene    = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog        = new THREE.Fog(0x87ceeb, 150, 400);

const camera   = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(100, 200, 100);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// Ground
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshStandardMaterial({ color: 0x2d862d })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ============================================================
// 6. PROCEDURAL TRACK GENERATION
// ============================================================
const roadWidth = 28;

function generateTrackPoints() {
    // Base shape: roughly oval with randomised bulges
    // All corners are kept gentle (no hairpins) by limiting how far
    // control points deviate from the base ellipse.
    const basePoints = [];
    const N = 12; // number of control points
    const rx = 160 + (Math.random() - 0.5) * 40;
    const rz = 140 + (Math.random() - 0.5) * 40;

    for (let i = 0; i < N; i++) {
        const angle  = (i / N) * Math.PI * 2;
        // Randomise radius per point, but keep deviation small so corners stay driveable
        const jitter = 0.85 + Math.random() * 0.30;
        const x = Math.cos(angle) * rx * jitter;
        const z = Math.sin(angle) * rz * jitter;
        basePoints.push(new THREE.Vector3(x, 0, z));
    }
    // Close the loop
    basePoints.push(basePoints[0].clone());
    return basePoints;
}

const trackPoints = generateTrackPoints();
const trackCurve  = new THREE.CatmullRomCurve3(trackPoints);
trackCurve.closed = true;
trackCurve.curveType = 'catmullrom';
trackCurve.tension   = 0.4; // higher tension = smoother corners

// Road surface
const roadGeo = new THREE.TubeGeometry(trackCurve, 500, roadWidth / 2, 8, true);
const road    = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }));
road.scale.set(1, 0.02, 1);
road.position.y = 0.1;
road.receiveShadow = true;
scene.add(road);

// White centreline
const clGeo = new THREE.TubeGeometry(trackCurve, 500, 0.2, 8, true);
const cl    = new THREE.Mesh(clGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
cl.position.y = 0.15;
scene.add(cl);

// Kerbs
(function buildKerbs() {
    const N = 150;
    const kerbGeo = new THREE.BoxGeometry(2, 0.15, 3);
    for (let i = 0; i < N; i++) {
        const t   = i / N;
        const pt  = trackCurve.getPointAt(t);
        const tan = trackCurve.getTangentAt(t);
        const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        for (const side of [-1, 1]) {
            const col  = (i % 2 === 0) ? 0xff0000 : 0xffffff;
            const kerb = new THREE.Mesh(kerbGeo, new THREE.MeshStandardMaterial({ color: col }));
            kerb.position.set(
                pt.x + perp.x * (roadWidth / 2 + 1) * side,
                0.12,
                pt.z + perp.z * (roadWidth / 2 + 1) * side
            );
            kerb.lookAt(kerb.position.x + tan.x, 0.12, kerb.position.z + tan.z);
            kerb.receiveShadow = true;
            scene.add(kerb);
        }
    }
})();

// ============================================================
// 7. TRACK BOUNDARY WALLS  (visual Armco barriers, collision via track-distance)
// ============================================================
(function buildBoundaryWalls() {
    const N      = 120;
    const wallH  = 1.0;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.7 });

    for (let i = 0; i < N; i++) {
        const t    = i / N;
        const pt   = trackCurve.getPointAt(t);
        const tan  = trackCurve.getTangentAt(t);
        const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        const segLen = trackCurve.getLength() / N * 1.08;
        const wGeo = new THREE.BoxGeometry(segLen, wallH, 0.6);

        for (const side of [-1, 1]) {
            const offset = roadWidth / 2 + 1.8;
            const wall   = new THREE.Mesh(wGeo, wallMat);
            wall.position.set(
                pt.x + perp.x * offset * side,
                wallH / 2,
                pt.z + perp.z * offset * side
            );
            wall.lookAt(pt.x + tan.x, wallH / 2, pt.z + tan.z);
            wall.castShadow = true;
            scene.add(wall);
        }
    }
})();

// ============================================================
// 8. TYRE BARRIERS (at a few corners)
// ============================================================
const barriers = [];
(function buildTyreBarriers() {
    // Place barriers at t=0.20, 0.50, 0.75 on the inside of curves
    const zones = [
        { t: 0.20, count: 12 },
        { t: 0.50, count: 10 },
        { t: 0.75, count: 12 },
    ];
    const tyreGeo  = new THREE.CylinderGeometry(1.0, 1.0, 1.2, 10);
    const tyreMats = [
        new THREE.MeshStandardMaterial({ color: 0x111111 }),
        new THREE.MeshStandardMaterial({ color: 0xff2222 }),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
    ];

    for (const zone of zones) {
        for (let i = 0; i < zone.count; i++) {
            const t    = zone.t + (i / zone.count) * 0.06 - 0.03;
            const pt   = trackCurve.getPointAt((t + 1) % 1);
            const tan  = trackCurve.getTangentAt((t + 1) % 1);
            const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

            for (const side of [-1, 1]) {
                const offset = roadWidth / 2 + 2.5;
                const pos = new THREE.Vector3(
                    pt.x + perp.x * offset * side,
                    0.6,
                    pt.z + perp.z * offset * side
                );
                const mat  = tyreMats[i % tyreMats.length];
                const tyre = new THREE.Mesh(tyreGeo, mat);
                tyre.position.copy(pos);
                tyre.castShadow = true;
                scene.add(tyre);
                barriers.push({ mesh: tyre, position: pos.clone() });

                const tyre2 = new THREE.Mesh(tyreGeo, tyreMats[(i + 1) % tyreMats.length]);
                tyre2.position.set(pos.x, 1.8, pos.z);
                tyre2.castShadow = true;
                scene.add(tyre2);
                barriers.push({ mesh: tyre2, position: tyre2.position.clone() });
            }
        }
    }
})();

// ============================================================
// 9. TRAFFIC CONES  (chicane obstacles)
// ============================================================
const cones = [];
(function buildCones() {
    const baseGeo  = new THREE.CylinderGeometry(1.0, 1.2, 0.2, 8);
    const bodyGeo  = new THREE.ConeGeometry(0.85, 2.2, 8);
    const coneMat  = new THREE.MeshStandardMaterial({ color: 0xff5500 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

    const N = 10;
    for (let i = 0; i < N; i++) {
        const t    = 0.38 + (i / N) * 0.10;
        const pt   = trackCurve.getPointAt(t);
        const tan  = trackCurve.getTangentAt(t);
        const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        const side = (i % 2 === 0 ? 1 : -1) * 8;

        const conePos = new THREE.Vector3(pt.x + perp.x * side, 0, pt.z + perp.z * side);
        const g = new THREE.Group();
        const base   = new THREE.Mesh(baseGeo, coneMat);
        const body   = new THREE.Mesh(bodyGeo, coneMat);
        body.position.y = 1.2;
        const stripe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.86, 0.86, 0.28, 8),
            whiteMat
        );
        stripe.position.y = 0.8;
        g.add(base, body, stripe);
        g.position.copy(conePos);
        g.position.y = 0.1;
        scene.add(g);
        cones.push({ group: g, position: conePos.clone(), fallen: false });
    }
})();

// ============================================================
// 10. SPEED BUMPS
// ============================================================
const speedBumps = [];
(function buildSpeedBumps() {
    const bumpTs  = [0.28, 0.58, 0.82];
    const bumpGeo = new THREE.BoxGeometry(roadWidth * 0.35, 0.3, 1.5);
    const bumpMat = new THREE.MeshStandardMaterial({ color: 0xffdd00 });

    for (const t of bumpTs) {
        const pt  = trackCurve.getPointAt(t);
        const tan = trackCurve.getTangentAt(t);
        const bump = new THREE.Mesh(bumpGeo, bumpMat);
        bump.position.set(pt.x, 0.25, pt.z);
        bump.lookAt(pt.x + tan.x, 0.25, pt.z + tan.z);
        bump.castShadow = bump.receiveShadow = true;
        scene.add(bump);
        speedBumps.push({ mesh: bump, position: pt.clone() });
    }
})();

// ============================================================
// 11. SCENERY — Trees & Grandstand
// ============================================================
const treeTrunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 3, 6);
const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
const treeTopGeo   = new THREE.ConeGeometry(2.5, 6, 8);
const treeTopMat   = new THREE.MeshStandardMaterial({ color: 0x1e5631 });

for (let i = 0; i < 120; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const radius = 210 + Math.random() * 120;
    const trunk  = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
    trunk.position.set(Math.cos(angle) * radius, 1.5, Math.sin(angle) * radius);
    trunk.castShadow = true;
    const top = new THREE.Mesh(treeTopGeo, treeTopMat);
    top.position.set(trunk.position.x, 5, trunk.position.z);
    top.castShadow = true;
    scene.add(trunk, top);
}

const crowdMembers = [];
(function createGrandstand() {
    const g       = new THREE.Group();
    const standMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (let step = 0; step < 3; step++) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 3), standMat);
        bench.position.set(0, step, step * -3);
        bench.castShadow = true;
        g.add(bench);
        for (let c = 0; c < 10; c++) {
            const guy = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 1.5, 0.8),
                new THREE.MeshStandardMaterial({ color: Math.floor(Math.random() * 16777215) })
            );
            guy.position.set(-18 + c * 4 + Math.random() * 2, step + 1, step * -3);
            crowdMembers.push({ mesh: guy, baseY: guy.position.y, offset: Math.random() * Math.PI * 2 });
            g.add(guy);
        }
    }
    // Place grandstand well outside the track boundary
    const _sPt  = trackCurve.getPointAt(0);
    const _sTan = trackCurve.getTangentAt(0);
    const _perp = new THREE.Vector3(-_sTan.z, 0, _sTan.x).normalize();
    // Push 60 units to the side of the start/finish line - well clear of road+walls
    g.position.set(_sPt.x + _perp.x * 60, 0.5, _sPt.z + _perp.z * 60);
    g.lookAt(_sPt.x, 0.5, _sPt.z);
    scene.add(g);
})();

// ============================================================
// 12. CHECKPOINTS  (visible arch gates)
// ============================================================
const NUM_CHECKPOINTS = 10;
const CHECKPOINT_RADIUS = 22;
const checkpoints = [];

function makeTextSprite(msg, scale = [8, 2, 1]) {
    const canvas  = document.createElement('canvas');
    canvas.width  = 256; canvas.height = 64;
    const ctx     = canvas.getContext('2d');
    ctx.font      = 'bold 26px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'black';
    ctx.strokeText(msg, 128, 42);
    ctx.fillText(msg, 128, 42);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
    sprite.scale.set(...scale);
    return sprite;
}

function buildCheckpointGate(t, index) {
    const pt   = trackCurve.getPointAt(t);
    const tan  = trackCurve.getTangentAt(t);
    const isFinish = (index === 0);

    const gateColor  = isFinish ? 0xffd700 : 0x00aaff;
    const postColor  = isFinish ? 0xff8800 : 0x0044cc;
    const gateH      = 9;
    const gateW      = roadWidth + 6;

    const g = new THREE.Group();

    // Translucent gate panel
    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(gateW, gateH, 0.5),
        new THREE.MeshStandardMaterial({
            color: gateColor, transparent: true, opacity: 0.35,
            emissive: gateColor, emissiveIntensity: 0.5, side: THREE.DoubleSide
        })
    );
    panel.position.y = gateH / 2;

    // Posts
    const postGeo = new THREE.BoxGeometry(1.2, gateH, 1.2);
    const postMat = new THREE.MeshStandardMaterial({ color: postColor });
    const postL   = new THREE.Mesh(postGeo, postMat);
    const postR   = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-(gateW / 2), gateH / 2, 0);
    postR.position.set( (gateW / 2), gateH / 2, 0);

    // Top beam
    const beam = new THREE.Mesh(
        new THREE.BoxGeometry(gateW + 1.2, 1.2, 1.2),
        postMat
    );
    beam.position.y = gateH;

    // Label
    const label = makeTextSprite(isFinish ? 'START / FINISH' : `CP ${index}`, [12, 2.5, 1]);
    label.position.y = gateH + 2.5;

    g.add(panel, postL, postR, beam, label);
    g.position.copy(pt);
    g.position.y = 0;
    // Orient gate perpendicular to track direction
    g.lookAt(pt.x + tan.x, 0, pt.z + tan.z);
    scene.add(g);

    return { group: g, position: pt.clone(), t, panelMat: panel.material };
}

// CP0 = start/finish at t=0.
// CP1..CP9 step backwards through t so they match the direction the car
// is pointing (the car faces +tangent at t=0, which means increasing t).
// Actually the ellipse goes counter-clockwise when cos/sin is used with
// increasing angle, but the car lookAt points it along +startTan.
// We determine the correct order at runtime by checking which t-direction
// from CP0 the car naturally drives into first.
// Simple reliable fix: place CPs in increasing t order (0, 0.1 … 0.9),
// spawn car pointing in the +tangent direction, require CP1 first.
for (let i = 0; i < NUM_CHECKPOINTS; i++) {
    const t = i / NUM_CHECKPOINTS;
    checkpoints.push(buildCheckpointGate(t, i));
}

// Start/finish line visual
const startPt  = trackCurve.getPointAt(0);
const startTan = trackCurve.getTangentAt(0);
const slLine   = new THREE.Mesh(
    new THREE.BoxGeometry(roadWidth + 2, 0.1, 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
);
slLine.position.set(startPt.x, 0.15, startPt.z);
slLine.lookAt(startPt.x + startTan.x, 0.15, startPt.z + startTan.z);
scene.add(slLine);

// ============================================================
// 13. F1 CAR
// ============================================================
function createF1Car(colorHex, playerName) {
    const g       = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex });
    const wingMat = new THREE.MeshStandardMaterial({ color: colorHex });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 5),  bodyMat));

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 1.5), bodyMat);
    nose.position.set(0, -0.1, -3); g.add(nose);

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0x000000 }));
    cockpit.position.set(0, 0.5, -0.3); g.add(cockpit);

    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.8), wingMat);
    frontWing.position.set(0, -0.2, -3.8); g.add(frontWing);

    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 1.2), wingMat);
    rearWing.position.set(0, 0.6, 2.4); g.add(rearWing);

    [[1.5, 0.3, 2.4], [-1.5, 0.3, 2.4]].forEach(([x, y, z]) => {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.2), wingMat);
        s.position.set(x, y, z); g.add(s);
    });

    const wGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.6, 12);
    wGeo.rotateZ(Math.PI / 2);
    [[-1.1, 0, -2.5], [1.1, 0, -2.5]].forEach(([x, y, z]) => {
        const w = new THREE.Mesh(wGeo, wheelMat); w.position.set(x, y, z); g.add(w);
    });
    const rwGeo = wGeo.clone();
    [[-1.3, 0.1, 1.8], [1.3, 0.1, 1.8]].forEach(([x, y, z]) => {
        const w = new THREE.Mesh(rwGeo, wheelMat); w.scale.setScalar(1.2); w.position.set(x, y, z); g.add(w);
    });

    g.children.forEach(c => { c.castShadow = true; });

    if (playerName) {
        const tag = makeTextSprite(playerName);
        tag.position.y = 2.5;
        g.add(tag);
    }
    return g;
}

let myCar;
const cameraOffset = new THREE.Vector3(0, 5, 12);
camera.position.set(0, 10, -100);

// ============================================================
// 14. MINIMAP
// ============================================================
const mapCanvas = document.getElementById('minimap');
const mapCtx    = mapCanvas.getContext('2d');
const MAP_BOUNDS = 210;

function drawMinimap() {
    mapCtx.clearRect(0, 0, 200, 200);
    const m = v => ((v + MAP_BOUNDS) / (MAP_BOUNDS * 2)) * 200;

    // Track
    mapCtx.beginPath();
    mapCtx.strokeStyle = '#555';
    mapCtx.lineWidth   = 10;
    for (let i = 0; i <= 120; i++) {
        const pt = trackCurve.getPointAt(i / 120);
        i === 0 ? mapCtx.moveTo(m(pt.x), m(pt.z)) : mapCtx.lineTo(m(pt.x), m(pt.z));
    }
    mapCtx.stroke();

    // Checkpoints
    checkpoints.forEach((cp, idx) => {
        mapCtx.fillStyle = idx === 0 ? '#ffd700' : '#00aaff';
        mapCtx.fillRect(m(cp.position.x) - 3, m(cp.position.z) - 3, 6, 6);
    });

    // Other players
    for (const id in players) {
        const p = players[id];
        mapCtx.fillStyle = p.hexColor || '#3366ff';
        mapCtx.beginPath();
        mapCtx.arc(m(p.mesh.position.x), m(p.mesh.position.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
    }

    // My car
    if (myCar) {
        mapCtx.fillStyle = myColor;
        mapCtx.beginPath();
        mapCtx.arc(m(myCar.position.x), m(myCar.position.z), 5, 0, Math.PI * 2);
        mapCtx.fill();
    }
}

// ============================================================
// 15. MULTIPLAYER (Ably)
// ============================================================
let ably, channel;

function connectMultiplayer() {
    ably    = new Ably.Realtime({ authUrl: '/api/ably-auth?clientId=' + myId });
    channel = ably.channels.get('f1-lobby');

    ably.connection.on('connected', () => {
        document.getElementById('status').innerText = 'Network Connected!';
        document.getElementById('status').style.color = '#4CAF50';
        startCountdown();

        channel.subscribe('move', msg => {
            const d = msg.data;
            if (msg.clientId === myId) return;
            if (!players[msg.clientId]) {
                const car = createF1Car(d.color, d.name);
                car.position.y = 0.5;
                scene.add(car);
                players[msg.clientId] = { mesh: car, hexColor: d.color };
            }
            players[msg.clientId].mesh.position.set(d.x, d.y, d.z);
            const q = new THREE.Quaternion();
            q.setFromEuler(new THREE.Euler(0, d.rotation, 0));
            players[msg.clientId].mesh.quaternion.copy(q);
        });

        channel.presence.subscribe('leave', member => {
            if (players[member.clientId]) {
                scene.remove(players[member.clientId].mesh);
                delete players[member.clientId];
            }
        });
        channel.presence.enter();
    });
}

function broadcastPosition() {
    if (ably && ably.connection.state === 'connected' && gameState === 2 && myCar) {
        const euler = new THREE.Euler().setFromQuaternion(myCar.quaternion);
        channel.publish('move', {
            x: myCar.position.x, y: myCar.position.y, z: myCar.position.z,
            rotation: euler.y, color: myColor, name: myName
        });
    }
}
setInterval(broadcastPosition, 100);

// ============================================================
// 16. UI & EVENTS
// ============================================================
document.getElementById('join-btn').addEventListener('click', () => {
    myName  = document.getElementById('player-name').value || 'Racer';
    myColor = document.getElementById('player-color').value;

    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-ui').style.display   = 'block';

    myCar = createF1Car(myColor, myName);

    // Spawn safely on the track, 8 units behind CP0 in the driving direction.
    // The car must drive FORWARD (in +tangent direction) toward CP1, CP2 … CP0.
    // Offset slightly to the left so multiple players don't overlap.
    const perpX = -startTan.z, perpZ = startTan.x; // left-hand perp
    const gridOff = (Math.random() - 0.5) * 10; // small lateral scatter
    myCar.position.set(
        startPt.x - startTan.x * 8 + perpX * gridOff,
        0.5,
        startPt.z - startTan.z * 8 + perpZ * gridOff
    );
    // Face FORWARD along the track (toward increasing t = toward CP1)
    myCar.lookAt(
        startPt.x + startTan.x * 20,
        0.5,
        startPt.z + startTan.z * 20
    );
    scene.add(myCar);

    // Must hit CP1 first, then CP2…CP9, then CP0 to complete a lap
    nextCheckpointIndex = 1;
    lapsCompleted  = 0;
    currentLap     = 1;
    document.getElementById('race-state').innerText = `Lap 1 / ${totalLaps}`;

    gameState = 0;
    initAudio();
    connectMultiplayer();
});

function startCountdown() {
    gameState = 1;
    const cdText = document.getElementById('countdown-text');
    let count = 3;
    cdText.style.opacity = 1;

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            cdText.innerText = count;
            cdText.style.transform = `scale(${1 + Math.random() * 0.2})`;
            playBeep(400, 0.1);
        } else if (count === 0) {
            cdText.innerText = 'GO!';
            cdText.style.color = '#4CAF50';
            playBeep(800, 0.3);
            if (engineGain) engineGain.gain.setTargetAtTime(0.05, audioCtx.currentTime, 0.5);
            gameState = 2;
            raceStartTime = Date.now();
        } else {
            clearInterval(timer);
            cdText.style.opacity = 0;
        }
    }, 1000);
}

function showHazardMessage(msg, color = '#ff6600') {
    const el = document.getElementById('hazard-msg');
    el.innerText  = msg;
    el.style.color   = color;
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 1800);
}

function updateUI() {
    document.getElementById('speedometer').innerText = Math.abs(speed * 200).toFixed(0);
    if (gameState === 2) {
        const e  = Date.now() - raceStartTime;
        const mm = Math.floor(e / 60000).toString().padStart(2, '0');
        const ss = Math.floor((e % 60000) / 1000).toString().padStart(2, '0');
        const ms = Math.floor((e % 1000) / 10).toString().padStart(2, '0');
        document.getElementById('timer').innerText = `${mm}:${ss}.${ms}`;
    }
    drawMinimap();
}

window.addEventListener('keydown', e => { if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup',   e => { if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = false; });
window.addEventListener('resize',  () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// ============================================================
// 17. COLLISION HELPERS
// ============================================================
// Pre-sample the track centreline for fast closest-point lookup
const TRACK_SAMPLES = 300;
const trackSamples = [];
for (let i = 0; i < TRACK_SAMPLES; i++) {
    trackSamples.push(trackCurve.getPointAt(i / TRACK_SAMPLES));
}

function getDistanceFromTrackCentre(px, pz) {
    let minDist = Infinity;
    let closestPt = null;
    for (const pt of trackSamples) {
        const dx = px - pt.x;
        const dz = pz - pt.z;
        const d  = dx * dx + dz * dz; // squared, for speed
        if (d < minDist) { minDist = d; closestPt = pt; }
    }
    return { dist: Math.sqrt(minDist), closestPt };
}

function checkBoundaryWalls() {
    if (barrierHitCooldown > 0) { barrierHitCooldown--; return; }
    const { dist, closestPt } = getDistanceFromTrackCentre(myCar.position.x, myCar.position.z);
    const limit = roadWidth / 2 - 0.5; // car must stay within half-road-width of centre
    if (dist > limit) {
        // Push car back toward track centre
        const dx = myCar.position.x - closestPt.x;
        const dz = myCar.position.z - closestPt.z;
        const angle = Math.atan2(dz, dx);
        myCar.position.x = closestPt.x + Math.cos(angle) * (limit - 0.5);
        myCar.position.z = closestPt.z + Math.sin(angle) * (limit - 0.5);
        speed *= -0.25;
        barrierHitCooldown = 15;
        playCrashSound();
        showHazardMessage('💥 WALL!', '#ff2200');
    }
}

function checkBarrierCollisions() {
    if (barrierHitCooldown > 0) return;
    for (const b of barriers) {
        const dx = myCar.position.x - b.position.x;
        const dz = myCar.position.z - b.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 2.8) {
            const angle = Math.atan2(dz, dx);
            myCar.position.x += Math.cos(angle) * 1.5;
            myCar.position.z += Math.sin(angle) * 1.5;
            speed *= -0.3;
            barrierHitCooldown = 20;
            playCrashSound();
            showHazardMessage('💥 TYRE BARRIER!', '#ff2200');
            b.mesh.rotation.z = (Math.random() - 0.5) * 0.4;
            return;
        }
    }
}

function checkConeCollisions() {
    for (const cone of cones) {
        if (cone.fallen) continue;
        const dx = myCar.position.x - cone.position.x;
        const dz = myCar.position.z - cone.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 3.5) {
            cone.fallen = true;
            cone.group.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
            cone.group.position.y = 0.4;
            speed *= 0.8;
            playBeep(300, 0.2, 'square');
            showHazardMessage('🔶 CONE HIT!', '#ff9900');
        }
    }
}

function checkSpeedBumpCollisions() {
    for (const bump of speedBumps) {
        const dx = myCar.position.x - bump.position.x;
        const dz = myCar.position.z - bump.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 5) {
            if (Math.abs(speed) > 0.4) {
                speed *= 0.65;
                myCar.position.y = 0.9;
                playBeep(180, 0.15, 'triangle');
                showHazardMessage('⚠️ SPEED BUMP!', '#ffdd00');
            }
        } else {
            myCar.position.y = 0.5;
        }
    }
}

// ============================================================
// 18. CHECKPOINT FLASH HELPER
// ============================================================
function flashGate(cp, flashColor = 0x00ff44) {
    const orig = cp.panelMat.color.getHex();
    cp.panelMat.color.setHex(flashColor);
    cp.panelMat.emissive.setHex(flashColor);
    cp.panelMat.opacity = 0.8;
    setTimeout(() => {
        cp.panelMat.color.setHex(orig);
        cp.panelMat.emissive.setHex(orig);
        cp.panelMat.opacity = 0.35;
    }, 500);
}

// ============================================================
// 19. MAIN LOOP
// ============================================================
function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.01;
    crowdMembers.forEach(c => {
        c.mesh.position.y = c.baseY + Math.abs(Math.sin(time + c.offset)) * 0.4;
    });

    if (myCar && gameState >= 1) {

        if (gameState === 2) {
            // --- Input ---
            if (keys.w) speed += acceleration;
            if (keys.s) speed -= acceleration * 0.6;
            if (!keys.w && !keys.s) {
                speed > 0 ? speed = Math.max(0, speed - deceleration)
                          : speed = Math.min(0, speed + deceleration);
            }
            speed = THREE.MathUtils.clamp(speed, -maxSpeed * 0.4, maxSpeed);

            if (Math.abs(speed) > 0.05) {
                const dir = speed > 0 ? 1 : -1;
                const up  = new THREE.Vector3(0, 1, 0);
                if (keys.a) myCar.rotateOnWorldAxis(up,  turnSpeed * dir);
                if (keys.d) myCar.rotateOnWorldAxis(up, -turnSpeed * dir);
            }

            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(myCar.quaternion).multiplyScalar(speed);
            myCar.position.add(fwd);
            myCar.position.y = 0.5;

            // --- Collisions ---
            checkBoundaryWalls();
            checkBarrierCollisions();
            checkConeCollisions();
            checkSpeedBumpCollisions();

            // Multiplayer bumps
            for (const id in players) {
                const opp = players[id].mesh;
                const dx = myCar.position.x - opp.position.x;
                const dz = myCar.position.z - opp.position.z;
                if (Math.sqrt(dx * dx + dz * dz) < 3.5) {
                    const a = Math.atan2(dz, dx);
                    myCar.position.x += Math.cos(a) * 0.5;
                    myCar.position.z += Math.sin(a) * 0.5;
                    speed *= 0.4;
                    playBeep(120, 0.15, 'square');
                }
            }

            // --- Checkpoint logic ---
            const cp   = checkpoints[nextCheckpointIndex];
            const cdx  = myCar.position.x - cp.position.x;
            const cdz  = myCar.position.z - cp.position.z;

            if (Math.sqrt(cdx * cdx + cdz * cdz) < CHECKPOINT_RADIUS) {
                flashGate(cp);
                playBeep(600, 0.1, 'sine');

                const wasFinishLine = (nextCheckpointIndex === 0);
                nextCheckpointIndex = (nextCheckpointIndex + 1) % NUM_CHECKPOINTS;

                if (wasFinishLine) {
                    // Crossed the start/finish gate → lap complete
                    lapsCompleted++;
                    if (lapsCompleted >= totalLaps) {
                        gameState = 3;
                        document.getElementById('race-state').innerText = '🏁 FINISHED!';
                        document.getElementById('race-state').style.color = '#4CAF50';
                        document.getElementById('countdown-text').innerText = 'FINISH';
                        document.getElementById('countdown-text').style.opacity = 1;
                        playFinishFanfare();
                    } else {
                        currentLap = lapsCompleted + 1;
                        document.getElementById('race-state').innerText = `Lap ${currentLap} / ${totalLaps}`;
                        showHazardMessage(`✅ LAP ${lapsCompleted} COMPLETE!`, '#00ff88');
                    }
                } else {
                    showHazardMessage(`CP ${nextCheckpointIndex - 1 < 0 ? NUM_CHECKPOINTS - 1 : nextCheckpointIndex - 1} ✓`, '#00ccff');
                }
            }

            // --- Engine audio ---
            if (audioCtx && engineOsc) {
                engineOsc.frequency.setTargetAtTime(40 + (Math.abs(speed) / maxSpeed) * 150, audioCtx.currentTime, 0.1);
                engineGain.gain.setTargetAtTime(Math.abs(speed) > 0.05 ? 0.15 : 0.05, audioCtx.currentTime, 0.2);
            }

        } else if (gameState === 3) {
            speed = Math.max(0, speed - deceleration);
            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(myCar.quaternion).multiplyScalar(speed);
            myCar.position.add(fwd);
            if (engineGain) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 1);
        }

        updateUI();

        const camPos = cameraOffset.clone().applyMatrix4(myCar.matrixWorld);
        camera.position.lerp(camPos, 0.15);
        camera.lookAt(myCar.position);
    }

    renderer.render(scene, camera);
}

animate();
