// --- 1. GAME SETTINGS & STATE ---
const myId = 'p_' + Math.random().toString(36).substr(2, 6);
let myName = "Racer";
let myColor = "#ff3333";
const players = {};

let currentLap = 1;      // display: 1-indexed
let lapsCompleted = 0;   // internal counter incremented on each lap finish
let nextCheckpointIndex = 0;
const totalLaps = 3;

let gameState = -1;
let raceStartTime = 0;

let speed = 0;
const maxSpeed = 1.3;
const acceleration = 0.03;
const deceleration = 0.01;
const turnSpeed = 0.03;

let barrierHitCooldown = 0;

const keys = { w: false, a: false, s: false, d: false };

// --- 2. AUDIO SYSTEM ---
let audioCtx, engineOsc, engineGain;

function initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(40, audioCtx.currentTime);
    engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
    engineOsc.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();
}

function playBeep(frequency, duration, type = "square") {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
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

// --- 3. THREE.JS ENVIRONMENT SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 150, 400);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(100, 200, 100);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const grassGeo = new THREE.PlaneGeometry(1000, 1000);
const grassMat = new THREE.MeshStandardMaterial({ color: 0x2d862d });
const ground = new THREE.Mesh(grassGeo, grassMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- 4. TRACK DESIGN ---
const trackPoints = [
    new THREE.Vector3(0,    0, -160),
    new THREE.Vector3(60,   0, -160),
    new THREE.Vector3(130,  0, -140),
    new THREE.Vector3(170,  0, -80),
    new THREE.Vector3(175,  0,  0),
    new THREE.Vector3(160,  0,  70),
    new THREE.Vector3(120,  0, 110),
    new THREE.Vector3(60,   0, 130),
    new THREE.Vector3(10,   0, 110),
    new THREE.Vector3(-20,  0,  60),
    new THREE.Vector3(20,   0,  30),
    new THREE.Vector3(-10,  0,   0),
    new THREE.Vector3(-60,  0, -10),
    new THREE.Vector3(-130, 0, -10),
    new THREE.Vector3(-170, 0, -50),
    new THREE.Vector3(-175, 0, -100),
    new THREE.Vector3(-160, 0, -140),
    new THREE.Vector3(-110, 0, -165),
    new THREE.Vector3(-50,  0, -168),
    new THREE.Vector3(0,    0, -160),
];
const trackCurve = new THREE.CatmullRomCurve3(trackPoints);
trackCurve.closed = true;

const roadWidth = 26;
const roadGeo = new THREE.TubeGeometry(trackCurve, 400, roadWidth / 2, 8, true);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
const road = new THREE.Mesh(roadGeo, roadMat);
road.scale.set(1, 0.02, 1);
road.position.y = 0.1;
road.receiveShadow = true;
scene.add(road);

const centerlineGeo = new THREE.TubeGeometry(trackCurve, 400, 0.2, 8, true);
const centerlineMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
const centerline = new THREE.Mesh(centerlineGeo, centerlineMat);
centerline.position.y = 0.15;
scene.add(centerline);

// Kerbs
(function buildKerbs() {
    const kerbCount = 120;
    for (let i = 0; i < kerbCount; i++) {
        const t = i / kerbCount;
        const pt = trackCurve.getPointAt(t);
        const tan = trackCurve.getTangentAt(t);
        const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        for (const side of [-1, 1]) {
            const kerbColor = (i % 2 === 0) ? 0xff0000 : 0xffffff;
            const kerbGeo = new THREE.BoxGeometry(2, 0.15, 3);
            const kerbMat = new THREE.MeshStandardMaterial({ color: kerbColor });
            const kerb = new THREE.Mesh(kerbGeo, kerbMat);
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

// --- 5. OBSTACLES ---

// 5a. Tyre barriers at hairpin and sweeper only
const barriers = [];
(function buildTyreBarriers() {
    const barrierZones = [
        { tStart: 0.68, tEnd: 0.78, side: 1, count: 14 },
        { tStart: 0.10, tEnd: 0.20, side: 1, count: 10 },
    ];
    const tyreGeo = new THREE.CylinderGeometry(1.0, 1.0, 1.2, 10);
    const tyreMats = [
        new THREE.MeshStandardMaterial({ color: 0x111111 }),
        new THREE.MeshStandardMaterial({ color: 0xff2222 }),
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
    ];
    for (const zone of barrierZones) {
        for (let i = 0; i < zone.count; i++) {
            const t = zone.tStart + (i / zone.count) * (zone.tEnd - zone.tStart);
            const pt = trackCurve.getPointAt(t);
            const tan = trackCurve.getTangentAt(t);
            const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
            const offset = roadWidth / 2 + 2.5;
            const pos = new THREE.Vector3(
                pt.x + perp.x * offset * zone.side,
                0.6,
                pt.z + perp.z * offset * zone.side
            );
            const mat = tyreMats[i % tyreMats.length];
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
})();

// 5b. Traffic cones in chicane — bright orange, large enough to see
const cones = [];
(function buildCones() {
    const coneBaseGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.12, 8);
    const coneBodyGeo = new THREE.ConeGeometry(0.5, 1.4, 8);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5500 });
    const coneWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

    const conePlacements = 8;
    for (let i = 0; i < conePlacements; i++) {
        const t = 0.43 + (i / conePlacements) * 0.12;
        const pt = trackCurve.getPointAt(t);
        const tan = trackCurve.getTangentAt(t);
        const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        const sideOffset = (i % 2 === 0 ? 1 : -1) * 6;
        const conePos = new THREE.Vector3(
            pt.x + perp.x * sideOffset,
            0,
            pt.z + perp.z * sideOffset
        );
        const coneGroup = new THREE.Group();
        const base = new THREE.Mesh(coneBaseGeo, coneMat);
        const body = new THREE.Mesh(coneBodyGeo, coneMat);
        body.position.y = 0.7;
        const stripe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.51, 0.51, 0.18, 8),
            coneWhiteMat
        );
        stripe.position.y = 0.5;
        coneGroup.add(base, body, stripe);
        coneGroup.position.copy(conePos);
        coneGroup.position.y = 0.06;
        coneGroup.castShadow = true;
        scene.add(coneGroup);
        cones.push({ group: coneGroup, position: conePos.clone(), fallen: false });
    }
})();

// 5c. Speed bumps — partial width, only covering the middle third of the road
const speedBumps = [];
(function buildSpeedBumps() {
    const bumpTs = [0.30, 0.60];
    // Narrower bump: only 1/3 of road width, centred
    const bumpGeo = new THREE.BoxGeometry(roadWidth * 0.33, 0.3, 1.5);
    const bumpMat = new THREE.MeshStandardMaterial({ color: 0xffdd00 });
    for (const t of bumpTs) {
        const pt = trackCurve.getPointAt(t);
        const tan = trackCurve.getTangentAt(t);
        const bump = new THREE.Mesh(bumpGeo, bumpMat);
        bump.position.set(pt.x, 0.25, pt.z);
        bump.lookAt(pt.x + tan.x, 0.25, pt.z + tan.z);
        bump.castShadow = true;
        bump.receiveShadow = true;
        scene.add(bump);
        speedBumps.push({ mesh: bump, position: pt.clone() });
    }
})();

// Scenery: Trees
const treeTrunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 3, 6);
const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
const treeTopGeo = new THREE.ConeGeometry(2.5, 6, 8);
const treeTopMat = new THREE.MeshStandardMaterial({ color: 0x1e5631 });
for (let i = 0; i < 120; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 200 + Math.random() * 120;
    const trunk = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
    trunk.position.set(Math.cos(angle) * radius, 1.5, Math.sin(angle) * radius);
    trunk.castShadow = true;
    const top = new THREE.Mesh(treeTopGeo, treeTopMat);
    top.position.set(trunk.position.x, 5, trunk.position.z);
    top.castShadow = true;
    scene.add(trunk, top);
}

// Scenery: Grandstand
const crowdMembers = [];
function createGrandstand() {
    const standGroup = new THREE.Group();
    const standMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (let step = 0; step < 3; step++) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 3), standMat);
        bench.position.set(0, step * 1, step * -3);
        bench.castShadow = true;
        standGroup.add(bench);
        for (let c = 0; c < 10; c++) {
            const randomColor = Math.floor(Math.random() * 16777215);
            const guy = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.8), new THREE.MeshStandardMaterial({ color: randomColor }));
            guy.position.set(-18 + (c * 4) + (Math.random() * 2), (step * 1) + 1, (step * -3));
            crowdMembers.push({ mesh: guy, baseY: guy.position.y, offset: Math.random() * Math.PI * 2 });
            standGroup.add(guy);
        }
    }
    standGroup.position.set(0, 0.5, -185);
    scene.add(standGroup);
}
createGrandstand();

// --- CHECKPOINTS ---
// Use tighter radius (18) and require sequential progression so rapid movement
// can't accidentally trigger multiple checkpoints in one frame and skip a lap.
const numCheckpoints = 30;
const checkpoints = [];
for (let i = 0; i < numCheckpoints; i++) {
    checkpoints.push(trackCurve.getPointAt(i / numCheckpoints));
}
const CHECKPOINT_RADIUS = 18; // tight enough to need to actually drive through

const startPoint = trackCurve.getPointAt(0);
const startTangent = trackCurve.getTangentAt(0);
const slBox = new THREE.BoxGeometry(roadWidth + 2, 0.1, 2);
const slMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
const slLine = new THREE.Mesh(slBox, slMat);
slLine.position.set(startPoint.x, 0.15, startPoint.z);
slLine.lookAt(startPoint.x + startTangent.x, 0.15, startPoint.z + startTangent.z);
scene.add(slLine);

// --- 6. F1 CAR GENERATOR ---
function makeTextSprite(message) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const context = canvas.getContext('2d');
    context.font = "bold 28px sans-serif";
    context.fillStyle = "white";
    context.textAlign = "center";
    context.lineWidth = 4;
    context.strokeStyle = "black";
    context.strokeText(message, 128, 40);
    context.fillText(message, 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(6, 1.5, 1);
    sprite.position.y = 2.5;
    return sprite;
}

function createF1Car(colorHex, playerName) {
    const carGroup = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex });
    const wingMat = new THREE.MeshStandardMaterial({ color: colorHex });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 5), bodyMat);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 1.5), bodyMat);
    nose.position.z = -3; nose.position.y = -0.1;
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0x000000 }));
    cockpit.position.y = 0.5; cockpit.position.z = -0.3;
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.8), wingMat);
    frontWing.position.z = -3.8; frontWing.position.y = -0.2;
    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 1.2), wingMat);
    rearWing.position.z = 2.4; rearWing.position.y = 0.6;
    const supp1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.2), wingMat);
    supp1.position.set(1.5, 0.3, 2.4);
    const supp2 = supp1.clone(); supp2.position.x = -1.5;

    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.6, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const fwL = new THREE.Mesh(wheelGeo, wheelMat); fwL.position.set(-1.1, 0, -2.5);
    const fwR = fwL.clone(); fwR.position.x = 1.1;
    const rwL = fwL.clone(); rwL.scale.set(1.2, 1.2, 1.2); rwL.position.set(-1.3, 0.1, 1.8);
    const rwR = rwL.clone(); rwR.position.x = 1.3;

    carGroup.add(body, nose, cockpit, frontWing, rearWing, supp1, supp2, fwL, fwR, rwL, rwR);
    carGroup.children.forEach(c => { c.castShadow = true; });

    if (playerName) {
        const nameTag = makeTextSprite(playerName);
        carGroup.add(nameTag);
    }
    return carGroup;
}

let myCar;
const relativeCameraOffset = new THREE.Vector3(0, 4, 10);
camera.position.set(0, 10, -100);

// --- 7. MINIMAP ---
const mapCanvas = document.getElementById('minimap');
const mapCtx = mapCanvas.getContext('2d');
const mapBounds = 200;

function drawMinimap() {
    mapCtx.clearRect(0, 0, 200, 200);
    const toMap = (val) => ((val + mapBounds) / (mapBounds * 2)) * 200;

    mapCtx.beginPath();
    mapCtx.strokeStyle = '#555';
    mapCtx.lineWidth = 12;
    for (let i = 0; i <= 100; i++) {
        const pt = trackCurve.getPointAt(i / 100);
        if (i === 0) mapCtx.moveTo(toMap(pt.x), toMap(pt.z));
        else mapCtx.lineTo(toMap(pt.x), toMap(pt.z));
    }
    mapCtx.stroke();

    mapCtx.fillStyle = 'white';
    mapCtx.fillRect(toMap(startPoint.x) - 2, toMap(startPoint.z) - 2, 4, 4);

    for (const id in players) {
        mapCtx.fillStyle = players[id].hexColor || '#3366ff';
        mapCtx.beginPath();
        mapCtx.arc(toMap(players[id].mesh.position.x), toMap(players[id].mesh.position.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
    }

    if (myCar) {
        mapCtx.fillStyle = myColor;
        mapCtx.beginPath();
        mapCtx.arc(toMap(myCar.position.x), toMap(myCar.position.z), 5, 0, Math.PI * 2);
        mapCtx.fill();
    }
}

// --- 8. ABLY MULTIPLAYER ---
let ably, channel;

function connectMultiplayer() {
    ably = new Ably.Realtime({ authUrl: '/api/ably-auth?clientId=' + myId });
    channel = ably.channels.get('f1-lobby');

    ably.connection.on('connected', () => {
        document.getElementById('status').innerText = 'Network Connected!';
        document.getElementById('status').style.color = '#4CAF50';
        startCountdown();

        channel.subscribe('move', (message) => {
            const data = message.data;
            if (message.clientId === myId) return;
            if (!players[message.clientId]) {
                const otherCar = createF1Car(data.color, data.name);
                otherCar.position.y = 0.5;
                scene.add(otherCar);
                players[message.clientId] = { mesh: otherCar, hexColor: data.color };
            }
            players[message.clientId].mesh.position.set(data.x, data.y, data.z);
            const q = new THREE.Quaternion();
            q.setFromEuler(new THREE.Euler(0, data.rotation, 0));
            players[message.clientId].mesh.quaternion.copy(q);
        });

        channel.presence.subscribe('leave', (member) => {
            if (players[member.clientId]) {
                scene.remove(players[member.clientId].mesh);
                delete players[member.clientId];
            }
        });
        channel.presence.enter();
    });
}

function broadcastPosition() {
    if (ably && ably.connection.state === 'connected' && gameState === 2) {
        const euler = new THREE.Euler().setFromQuaternion(myCar.quaternion);
        channel.publish('move', {
            x: myCar.position.x, y: myCar.position.y, z: myCar.position.z,
            rotation: euler.y,
            color: myColor,
            name: myName
        });
    }
}
setInterval(broadcastPosition, 100);

// --- 9. GAME SYSTEMS & UI ---
document.getElementById('join-btn').addEventListener('click', () => {
    myName = document.getElementById('player-name').value || "Racer";
    myColor = document.getElementById('player-color').value;

    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';

    myCar = createF1Car(myColor, myName);

    const perpX = startTangent.z;
    const perpZ = -startTangent.x;
    const randomGridOffset = (Math.random() - 0.5) * 12;
    const randomDepthOffset = 5 + (Math.random() * 15);

    myCar.position.set(
        startPoint.x - (startTangent.x * randomDepthOffset) + (perpX * randomGridOffset),
        0.5,
        startPoint.z - (startTangent.z * randomDepthOffset) + (perpZ * randomGridOffset)
    );
    myCar.lookAt(startPoint.x + startTangent.x, 0.5, startPoint.z + startTangent.z);
    scene.add(myCar);

    gameState = 0;
    initAudio();
    connectMultiplayer();
});

function startCountdown() {
    gameState = 1;
    const cdText = document.getElementById('countdown-text');
    let count = 3;
    cdText.style.opacity = 1;

    const timerObj = setInterval(() => {
        count--;
        if (count > 0) {
            cdText.innerText = count;
            cdText.style.transform = `scale(${1 + Math.random() * 0.2})`;
            playBeep(400, 0.1);
        } else if (count === 0) {
            cdText.innerText = "GO!";
            cdText.style.color = "#4CAF50";
            playBeep(800, 0.3);
            if (engineGain) engineGain.gain.setTargetAtTime(0.05, audioCtx.currentTime, 0.5);
            gameState = 2;
            raceStartTime = Date.now();
        } else {
            clearInterval(timerObj);
            cdText.style.opacity = 0;
        }
    }, 1000);
}

function showHazardMessage(msg, color = '#ff6600') {
    const el = document.getElementById('hazard-msg');
    el.innerText = msg;
    el.style.color = color;
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 1800);
}

function updateUI() {
    document.getElementById('speedometer').innerText = Math.abs(speed * 200).toFixed(0);

    if (gameState === 2) {
        const elapsed = Date.now() - raceStartTime;
        const min = Math.floor(elapsed / 60000).toString().padStart(2, '0');
        const sec = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
        const ms = Math.floor((elapsed % 1000) / 10).toString().padStart(2, '0');
        document.getElementById('timer').innerText = `${min}:${sec}.${ms}`;
    }

    drawMinimap();
}

window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = false; });
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 10. OBSTACLE COLLISION HELPERS ---
function checkBarrierCollisions() {
    if (barrierHitCooldown > 0) { barrierHitCooldown--; return; }
    for (const barrier of barriers) {
        const dx = myCar.position.x - barrier.position.x;
        const dz = myCar.position.z - barrier.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 2.8) {
            const angle = Math.atan2(dz, dx);
            myCar.position.x += Math.cos(angle) * 1.5;
            myCar.position.z += Math.sin(angle) * 1.5;
            speed *= -0.3;
            barrierHitCooldown = 20;
            playCrashSound();
            showHazardMessage('💥 TYRE BARRIER!', '#ff2200');
            barrier.mesh.rotation.z = (Math.random() - 0.5) * 0.4;
            return;
        }
    }
}

function checkConeCollisions() {
    for (const cone of cones) {
        if (cone.fallen) continue;
        const dx = myCar.position.x - cone.position.x;
        const dz = myCar.position.z - cone.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 2.5) {
            cone.fallen = true;
            cone.group.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
            cone.group.position.y = 0.35;
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
        // Narrow hit zone to match the bump's actual width (~roadWidth*0.33/2 ≈ 4 units)
        if (Math.sqrt(dx * dx + dz * dz) < 4) {
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

// --- 11. MAIN GAME LOOP ---
function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.01;
    crowdMembers.forEach(c => {
        c.mesh.position.y = c.baseY + Math.abs(Math.sin(time + c.offset)) * 0.4;
    });

    if (myCar && gameState >= 1) {
        if (gameState === 2) {

            if (keys.w) speed += acceleration;
            if (keys.s) speed -= acceleration * 0.6;

            if (!keys.w && !keys.s) {
                if (speed > 0) speed = Math.max(0, speed - deceleration);
                if (speed < 0) speed = Math.min(0, speed + deceleration);
            }

            speed = THREE.MathUtils.clamp(speed, -maxSpeed * 0.4, maxSpeed);

            // Use rotateY() on the world Y-axis so steering is always consistent
            // regardless of how lookAt() set the initial quaternion.
            // rotateY(+angle) = turn left, rotateY(-angle) = turn right (Three.js world-space).
            if (Math.abs(speed) > 0.05) {
                const direction = speed > 0 ? 1 : -1;
                if (keys.a) myCar.rotateOnWorldAxis(new THREE.Vector3(0,1,0),  turnSpeed * direction);
                if (keys.d) myCar.rotateOnWorldAxis(new THREE.Vector3(0,1,0), -turnSpeed * direction);
            }

            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(myCar.quaternion);
            forward.multiplyScalar(speed);
            myCar.position.add(forward);
            myCar.position.y = 0.5;

            checkBarrierCollisions();
            checkConeCollisions();
            checkSpeedBumpCollisions();

            // Multiplayer collisions
            for (const id in players) {
                const opp = players[id].mesh;
                const dx = myCar.position.x - opp.position.x;
                const dz = myCar.position.z - opp.position.z;
                if (Math.sqrt(dx * dx + dz * dz) < 3.5) {
                    const angle = Math.atan2(dz, dx);
                    myCar.position.x += Math.cos(angle) * 0.5;
                    myCar.position.z += Math.sin(angle) * 0.5;
                    speed *= 0.4;
                    playBeep(120, 0.15, "square");
                }
            }

            // --- LAP / CHECKPOINT LOGIC ---
            // Only test the NEXT checkpoint, never skip ahead.
            const targetPoint = checkpoints[nextCheckpointIndex];
            const chk_dx = myCar.position.x - targetPoint.x;
            const chk_dz = myCar.position.z - targetPoint.z;

            if (Math.sqrt(chk_dx * chk_dx + chk_dz * chk_dz) < CHECKPOINT_RADIUS) {
                playBeep(600, 0.1, "sine");
                nextCheckpointIndex++;

                if (nextCheckpointIndex >= numCheckpoints) {
                    // Completed a full lap
                    nextCheckpointIndex = 0;
                    lapsCompleted++;

                    if (lapsCompleted >= totalLaps) {
                        gameState = 3;
                        document.getElementById('race-state').innerText = "🏁 FINISHED!";
                        document.getElementById('race-state').style.color = '#4CAF50';
                        document.getElementById('countdown-text').innerText = "FINISH";
                        document.getElementById('countdown-text').style.opacity = 1;
                        playFinishFanfare();
                    } else {
                        currentLap = lapsCompleted + 1;
                        document.getElementById('race-state').innerText = `Lap ${currentLap} / ${totalLaps}`;
                    }
                }
            }

            if (audioCtx && engineOsc) {
                const targetFreq = 40 + (Math.abs(speed) / maxSpeed) * 150;
                engineOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);
                engineGain.gain.setTargetAtTime(Math.abs(speed) > 0.05 ? 0.15 : 0.05, audioCtx.currentTime, 0.2);
            }

        } else if (gameState === 3) {
            speed = Math.max(0, speed - deceleration);
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(myCar.quaternion).multiplyScalar(speed);
            myCar.position.add(forward);
            if (engineGain) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 1);
        }

        updateUI();

        const cameraOffset = relativeCameraOffset.clone().applyMatrix4(myCar.matrixWorld);
        camera.position.lerp(cameraOffset, 0.15);
        camera.lookAt(myCar.position);
    }

    renderer.render(scene, camera);
}

animate();
