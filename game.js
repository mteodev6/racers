// ============================================================
// F1 RACER — v2
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
let bestLapTime = null;
let lapStartTime = 0;

// --- 3. PHYSICS ---
let speed = 0;
const maxSpeed      = 1.3;
const acceleration  = 0.03;
const deceleration  = 0.01;
const turnSpeed     = 0.03;
let barrierHitCooldown = 0;
let boostTimer = 0; // frames of boost remaining
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

function playBoostSound() {
    playBeep(220, 0.08, 'sawtooth');
    setTimeout(() => playBeep(440, 0.12, 'sawtooth'), 60);
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
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ color: 0x2d862d })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ============================================================
// 6. PROCEDURAL TRACK GENERATION
// ============================================================
const roadWidth = 28;

// Track "archetypes" so each generated map feels structurally different,
// not just a jittered circle every time.
const TRACK_ARCHETYPES = ['oval', 'kidney', 'figure_bulge', 'rounded_square'];

function angleBetween(a, b, c) {
    // interior angle at point b formed by a-b-c, in radians (PI = straight line)
    const v1x = a.x - b.x, v1z = a.z - b.z;
    const v2x = c.x - b.x, v2z = c.z - b.z;
    const dot = v1x * v2x + v1z * v2z;
    const m1  = Math.hypot(v1x, v1z), m2 = Math.hypot(v2x, v2z);
    if (m1 === 0 || m2 === 0) return Math.PI;
    return Math.acos(THREE.MathUtils.clamp(dot / (m1 * m2), -1, 1));
}

function generateTrackPoints() {
    const archetype = TRACK_ARCHETYPES[Math.floor(Math.random() * TRACK_ARCHETYPES.length)];
    const N  = 10 + Math.floor(Math.random() * 4); // 10-13 control points
    const rx = 150 + Math.random() * 50;
    const rz = 130 + Math.random() * 50;

    let raw = [];
    for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2;
        let radiusScale = 1;

        if (archetype === 'oval') {
            radiusScale = 1;
        } else if (archetype === 'kidney') {
            radiusScale = 1 - 0.25 * Math.max(0, Math.cos(angle - Math.PI / 2));
        } else if (archetype === 'figure_bulge') {
            radiusScale = 1 + 0.18 * Math.sin(angle * 2);
        } else if (archetype === 'rounded_square') {
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const squareness = 1 / Math.pow(Math.pow(Math.abs(cosA), 4) + Math.pow(Math.abs(sinA), 4), 0.25);
            radiusScale = 0.6 + 0.4 * squareness;
        }

        const jitter = 0.93 + Math.random() * 0.14;
        const x = Math.cos(angle) * rx * radiusScale * jitter;
        const z = Math.sin(angle) * rz * radiusScale * jitter;
        raw.push(new THREE.Vector3(x, 0, z));
    }

    // --- Smooth out sharp corners ---
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < raw.length; i++) {
            const prev = raw[(i - 1 + raw.length) % raw.length];
            const cur  = raw[i];
            const next = raw[(i + 1) % raw.length];
            const interior = angleBetween(prev, cur, next);
            const MIN_ANGLE = Math.PI * 0.62;
            if (interior < MIN_ANGLE) {
                const mx = (prev.x + next.x) / 2;
                const mz = (prev.z + next.z) / 2;
                cur.x = THREE.MathUtils.lerp(cur.x, mx, 0.35);
                cur.z = THREE.MathUtils.lerp(cur.z, mz, 0.35);
            }
        }
    }

    // --- Build an explicit straight through the start, as real inserted points ---
    // We take the original point 0 as the centre of the start/finish line,
    // compute the direction from the point before it to the point after it,
    // and INSERT two brand new points (not just nudge existing ones) exactly
    // on that line, well clear of the curve's natural bend. This guarantees
    // there is a real straight segment physically present in the point list,
    // verifiable independent of how Catmull-Rom's arc-length table behaves.
    const beforeIdx = raw.length - 1;
    const afterIdx  = 1;
    const before = raw[beforeIdx];
    const start  = raw[0];
    const after  = raw[afterIdx];

    const dir = new THREE.Vector3().subVectors(after, before).normalize();

    // Points placed symmetrically around the start point, ON the straight line
    const preStraight  = start.clone().sub(dir.clone().multiplyScalar(60));
    const postStraight = start.clone().add(dir.clone().multiplyScalar(60));

    // Final point order:
    // [ ...track points after the start, going around ..., preStraight, START(t=0), postStraight, ...rest ]
    // We rebuild the array so index 0 is guaranteed to be the start point,
    // with preStraight immediately before it (end of array, since closed)
    // and postStraight immediately after it (index 1).
    const middle = raw.slice(2, beforeIdx); // everything except start/before/after
    const finalPoints = [start, postStraight, ...middle, preStraight];

    return finalPoints;
}

const trackPoints = generateTrackPoints();
const trackCurve  = new THREE.CatmullRomCurve3(trackPoints);
trackCurve.closed = true;
trackCurve.curveType = 'catmullrom';
trackCurve.tension   = 0.55; // higher = smoother, gentler corners

// Road surface
const roadGeo = new THREE.TubeGeometry(trackCurve, 600, roadWidth / 2, 8, true);
const road    = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }));
road.scale.set(1, 0.02, 1);
road.position.y = 0.1;
road.receiveShadow = true;
scene.add(road);

// White centreline
const clGeo = new THREE.TubeGeometry(trackCurve, 600, 0.2, 8, true);
const cl    = new THREE.Mesh(clGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
cl.position.y = 0.15;
scene.add(cl);

// Dashed straight markings on both sides of the start/finish line
(function buildStraightDashes() {
    const dashGeo = new THREE.BoxGeometry(1, 0.05, 3);
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const ZONE = 0.04; // fraction of track length covered on each side of t=0
    const COUNT = 10;
    // After the line (t = 0 → ZONE)
    for (let i = 1; i <= COUNT; i++) {
        const t = (i / COUNT) * ZONE;
        const pt  = trackCurve.getPointAt(t);
        const tan = trackCurve.getTangentAt(t);
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.set(pt.x, 0.18, pt.z);
        dash.lookAt(pt.x + tan.x, 0.18, pt.z + tan.z);
        scene.add(dash);
    }
    // Before the line (t = 1-ZONE → 1)
    for (let i = 1; i <= COUNT; i++) {
        const t = 1 - (i / COUNT) * ZONE;
        const pt  = trackCurve.getPointAt(t);
        const tan = trackCurve.getTangentAt(t);
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.set(pt.x, 0.18, pt.z);
        dash.lookAt(pt.x + tan.x, 0.18, pt.z + tan.z);
        scene.add(dash);
    }
})();

// Kerbs (skipped near the start/finish straight, which has its own dashed markings)
(function buildKerbs() {
    const N = 160;
    const kerbGeo = new THREE.BoxGeometry(2, 0.15, 3);
    const STRAIGHT_ZONE = 0.045; // fraction of track length to skip on each side of t=0
    for (let i = 0; i < N; i++) {
        const t = i / N;
        // Skip kerbs on the straight that runs through the start/finish line
        if (t < STRAIGHT_ZONE || t > 1 - STRAIGHT_ZONE) continue;

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
// 7. TRACK BOUNDARY WALLS (visual Armco; collision via track-distance check)
// ============================================================
(function buildBoundaryWalls() {
    const N      = 130;
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
// 8. TYRE BARRIERS (placed away from the opening straight)
// ============================================================
const barriers = [];
(function buildTyreBarriers() {
    const zones = [
        { t: 0.35, count: 10 },
        { t: 0.55, count: 10 },
        { t: 0.80, count: 10 },
    ];
    const tyreGeo  = new THREE.CylinderGeometry(1.0, 1.0, 1.2, 10);
    const tyreMats = [
        new THREE.MeshStandardMaterial({ color: 0x111111 }),
        new THREE.MeshStandardMaterial({ color: 0xff2222 }),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
    ];

    for (const zone of zones) {
        for (let i = 0; i < zone.count; i++) {
            const t    = zone.t + (i / zone.count) * 0.05 - 0.025;
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
// 9. TRAFFIC CONES (chicane, kept off the opening straight)
// ============================================================
const cones = [];
(function buildCones() {
    const baseGeo  = new THREE.CylinderGeometry(1.0, 1.2, 0.2, 8);
    const bodyGeo  = new THREE.ConeGeometry(0.85, 2.2, 8);
    const coneMat  = new THREE.MeshStandardMaterial({ color: 0xff5500 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

    const N = 10;
    for (let i = 0; i < N; i++) {
        const t    = 0.45 + (i / N) * 0.10;
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
// 10. SPEED BUMPS (kept off the opening straight)
// ============================================================
const speedBumps = [];
(function buildSpeedBumps() {
    const bumpTs  = [0.30, 0.62, 0.88];
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
// 10b. BOOST PADS (new feature — short burst of speed)
// ============================================================
const boostPads = [];
(function buildBoostPads() {
    const boostTs = [0.18, 0.70];
    const padGeo  = new THREE.BoxGeometry(roadWidth * 0.6, 0.1, 4);
    const padMat  = new THREE.MeshStandardMaterial({
        color: 0x00ffaa, emissive: 0x00ffaa, emissiveIntensity: 0.6, transparent: true, opacity: 0.75
    });
    for (const t of boostTs) {
        const pt  = trackCurve.getPointAt(t);
        const tan = trackCurve.getTangentAt(t);
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(pt.x, 0.2, pt.z);
        pad.lookAt(pt.x + tan.x, 0.2, pt.z + tan.z);
        scene.add(pad);
        boostPads.push({ mesh: pad, position: pt.clone(), cooldown: 0 });
    }
})();

// ============================================================
// 11. SCENERY — Trees & Grandstand
// ============================================================
const treeTrunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 3, 6);
const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
const treeTopGeo   = new THREE.ConeGeometry(2.5, 6, 8);
const treeTopMat   = new THREE.MeshStandardMaterial({ color: 0x1e5631 });

for (let i = 0; i < 130; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const radius = 230 + Math.random() * 140;
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
    // Place grandstand well clear of the track, beside the opening straight
    const _sPt  = trackCurve.getPointAt(0.02);
    const _sTan = trackCurve.getTangentAt(0.02);
    const _perp = new THREE.Vector3(-_sTan.z, 0, _sTan.x).normalize();
    g.position.set(_sPt.x + _perp.x * 65, 0.5, _sPt.z + _perp.z * 65);
    g.lookAt(_sPt.x, 0.5, _sPt.z);
    scene.add(g);
})();

// ============================================================
// 12. CHECKPOINTS — invisible logic only (no physical gates)
// ============================================================
// Car spawns ahead of the line facing +tangent (forward, increasing t).
// Checkpoint POSITIONS still run in increasing t order around the track,
// but the NUMBERING is reversed: the checkpoint hit first (t=0.1) is
// labelled CP9, and the one hit last before the finish (t=0.9) is CP1.
const NUM_CHECKPOINTS = 10;
const CHECKPOINT_RADIUS = 22;
const checkpoints = [];
for (let i = 0; i < NUM_CHECKPOINTS; i++) {
    const t = i / NUM_CHECKPOINTS;
    const label = i === 0 ? 0 : NUM_CHECKPOINTS - i; // reverse numbering, keep CP0 as finish
    checkpoints.push({ position: trackCurve.getPointAt(t), t, index: label });
}

// Start / finish line — the ONLY physical marker on the track
const startPt  = trackCurve.getPointAt(0);
const startTan = trackCurve.getTangentAt(0);

const slLine = new THREE.Mesh(
    new THREE.BoxGeometry(roadWidth + 2, 0.1, 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
);
slLine.position.set(startPt.x, 0.15, startPt.z);
slLine.lookAt(startPt.x + startTan.x, 0.15, startPt.z + startTan.z);
scene.add(slLine);

// Small overhead banner so the start is identifiable, but no posts/panels blocking the road
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
const startBanner = makeTextSprite('START / FINISH', [16, 3, 1]);
startBanner.position.set(startPt.x, 9, startPt.z);
scene.add(startBanner);

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
const MAP_BOUNDS = 230;

function drawMinimap() {
    mapCtx.clearRect(0, 0, 200, 200);
    const m = v => ((v + MAP_BOUNDS) / (MAP_BOUNDS * 2)) * 200;

    mapCtx.beginPath();
    mapCtx.strokeStyle = '#555';
    mapCtx.lineWidth   = 10;
    for (let i = 0; i <= 120; i++) {
        const pt = trackCurve.getPointAt(i / 120);
        i === 0 ? mapCtx.moveTo(m(pt.x), m(pt.z)) : mapCtx.lineTo(m(pt.x), m(pt.z));
    }
    mapCtx.stroke();

    // Start/finish marker
    mapCtx.fillStyle = '#ffd700';
    mapCtx.fillRect(m(startPt.x) - 4, m(startPt.z) - 4, 8, 8);

    for (const id in players) {
        const p = players[id];
        mapCtx.fillStyle = p.hexColor || '#3366ff';
        mapCtx.beginPath();
        mapCtx.arc(m(p.mesh.position.x), m(p.mesh.position.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
    }

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
// 4 fixed grid spawn slots, arranged 2-wide x 2-deep just behind the start line,
// on the straight. Slot 0 is pole position (front-left).
const GRID_ROWS = 2;        // how many rows deep
const GRID_COLS = 2;        // how many cars per row
const GRID_ROW_SPACING = 9; // distance between rows, along the track
const GRID_COL_SPACING = 7; // distance between cars side-by-side

function getGridSlotPosition(slotIndex) {
    const row = Math.floor(slotIndex / GRID_COLS); // 0 = front row
    const col = slotIndex % GRID_COLS;             // 0 = left, 1 = right

    const perpX = -startTan.z, perpZ = startTan.x; // left-hand perp
    const colOffset = (col - (GRID_COLS - 1) / 2) * GRID_COL_SPACING;
    const rowOffset = 6 + row * GRID_ROW_SPACING; // start a bit behind the line, then stagger further back

    return {
        x: startPt.x - startTan.x * rowOffset + perpX * colOffset,
        z: startPt.z - startTan.z * rowOffset + perpZ * colOffset
    };
}

// Paint a visible numbered box on the tarmac for each of the 4 grid slots,
// so the grid is actually visible even though only one car occupies it locally.
(function paintGridSlots() {
    const boxGeo = new THREE.BoxGeometry(4, 0.05, 5);
    const boxMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, transparent: true, opacity: 0.5
    });
    for (let i = 0; i < GRID_ROWS * GRID_COLS; i++) {
        const pos = getGridSlotPosition(i);
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(pos.x, 0.2, pos.z);
        box.lookAt(pos.x + startTan.x, 0.2, pos.z + startTan.z);
        scene.add(box);

        const label = makeTextSprite(`${i + 1}`, [3, 3, 1]);
        label.position.set(pos.x, 2.5, pos.z);
        scene.add(label);
    }
})();

document.getElementById('join-btn').addEventListener('click', () => {
    myName  = document.getElementById('player-name').value || 'Racer';
    myColor = document.getElementById('player-color').value;

    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-ui').style.display   = 'block';

    myCar = createF1Car(myColor, myName);

    // Pick one of the 4 grid slots at random for this player
    const mySlot = Math.floor(Math.random() * (GRID_ROWS * GRID_COLS));
    const slotPos = getGridSlotPosition(mySlot);
    myCar.position.set(slotPos.x, 0.5, slotPos.z);

    // Car is now behind the line — face FORWARD toward it (+tangent direction),
    // rotated by 180 degrees (looking away from start line)
    myCar.lookAt(
        startPt.x - startTan.x * 40,
        0.5,
        startPt.z - startTan.z * 40
    );
    scene.add(myCar);

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
            lapStartTime  = Date.now();
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

function formatTime(ms) {
    const mm = Math.floor(ms / 60000).toString().padStart(2, '0');
    const ss = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    const cs = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
    return `${mm}:${ss}.${cs}`;
}

function updateUI() {
    document.getElementById('speedometer').innerText = Math.abs(speed * 200).toFixed(0);
    if (gameState === 2) {
        document.getElementById('timer').innerText = formatTime(Date.now() - raceStartTime);
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
const TRACK_SAMPLES = 360;
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
        const d  = dx * dx + dz * dz;
        if (d < minDist) { minDist = d; closestPt = pt; }
    }
    return { dist: Math.sqrt(minDist), closestPt };
}

function checkBoundaryWalls() {
    if (barrierHitCooldown > 0) { barrierHitCooldown--; return; }
    const { dist, closestPt } = getDistanceFromTrackCentre(myCar.position.x, myCar.position.z);
    const limit = roadWidth / 2 - 0.5;
    if (dist > limit) {
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

function checkBoostPads() {
    for (const pad of boostPads) {
        if (pad.cooldown > 0) { pad.cooldown--; continue; }
        const dx = myCar.position.x - pad.position.x;
        const dz = myCar.position.z - pad.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 6) {
            boostTimer = 40; // frames of boost
            pad.cooldown = 60;
            playBoostSound();
            showHazardMessage('🚀 BOOST!', '#00ffaa');
        }
    }
}

// ============================================================
// 18. MAIN LOOP
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

            const effectiveMax = boostTimer > 0 ? maxSpeed * 1.6 : maxSpeed;
            if (boostTimer > 0) { boostTimer--; speed = Math.min(speed + acceleration * 2, effectiveMax); }
            speed = THREE.MathUtils.clamp(speed, -maxSpeed * 0.4, effectiveMax);

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
            checkBoostPads();

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

            // --- Checkpoint / lap logic ---
            const cp  = checkpoints[nextCheckpointIndex];
            const cdx = myCar.position.x - cp.position.x;
            const cdz = myCar.position.z - cp.position.z;

            if (Math.sqrt(cdx * cdx + cdz * cdz) < CHECKPOINT_RADIUS) {
                playBeep(600, 0.1, 'sine');
                const wasFinishLine = (nextCheckpointIndex === 0);
                nextCheckpointIndex = (nextCheckpointIndex + 1) % NUM_CHECKPOINTS;

                if (wasFinishLine) {
                    lapsCompleted++;
                    const lapTime = Date.now() - lapStartTime;
                    lapStartTime  = Date.now();
                    if (bestLapTime === null || lapTime < bestLapTime) {
                        bestLapTime = lapTime;
                        const bestLapEl = document.getElementById('best-lap');
                        if (bestLapEl) bestLapEl.innerText = `Best Lap: ${formatTime(bestLapTime)}`;
                    }

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
                        showHazardMessage(`✅ LAP ${lapsCompleted} — ${formatTime(lapTime)}`, '#00ff88');
                    }
                }
            }

            // --- Engine audio ---
            if (audioCtx && engineOsc) {
                engineOsc.frequency.setTargetAtTime(40 + (Math.abs(speed) / effectiveMax) * 150, audioCtx.currentTime, 0.1);
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
