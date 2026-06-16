// --- 1. GAME SETTINGS & STATE ---
const myId = 'p_' + Math.random().toString(36).substr(2, 6);
let myName = "Racer";
let myColor = "#ff3333";
const players = {}; 

let currentLap = 1;
let nextCheckpointIndex = 0;
const totalLaps = 3;

let gameState = -1; 
let raceStartTime = 0;

let speed = 0;
const maxSpeed = 1.3; 
const acceleration = 0.03; 
const deceleration = 0.01;
const turnSpeed = 0.03; 

const keys = { w: false, a: false, s: false, d: false };

// --- 2. IMPROVED AUDIO SYSTEM (Engine Growl) ---
let audioCtx, noiseNode, filterNode, engineGain;

function initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    // Create White Noise
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;

    // Filter to make it sound like an engine
    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'bandpass';
    filterNode.frequency.setValueAtTime(100, audioCtx.currentTime);
    filterNode.Q.setValueAtTime(10, audioCtx.currentTime);

    engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

    noiseNode.connect(filterNode);
    filterNode.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    noiseNode.start();
}

function playBeep(frequency, duration, type="sine") {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
}

// --- 3. THREE.JS ENVIRONMENT ---
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
scene.add(dirLight);

// --- 4. TRACK & GATES ---
const trackPoints = [
    new THREE.Vector3(0, 0, -150), new THREE.Vector3(80, 0, -150), new THREE.Vector3(150, 0, -80),
    new THREE.Vector3(150, 0, 0), new THREE.Vector3(80, 0, 50), new THREE.Vector3(0, 0, 30),
    new THREE.Vector3(-50, 0, 80), new THREE.Vector3(-150, 0, 80), new THREE.Vector3(-150, 0, -80),
    new THREE.Vector3(-80, 0, -150), new THREE.Vector3(0, 0, -150)
];
const trackCurve = new THREE.CatmullRomCurve3(trackPoints);
trackCurve.closed = true;

const roadGeo = new THREE.TubeGeometry(trackCurve, 300, 13, 8, true);
const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }));
road.scale.set(1, 0.02, 1);
road.position.y = 0.1; scene.add(road);

// FIXED: Invisible wide gates instead of points
const gates = [];
for (let i = 0; i < 20; i++) {
    const pt = trackCurve.getPointAt(i / 20);
    const tangent = trackCurve.getTangentAt(i / 20);
    // Create a wide box that spans the road width
    const gateGeo = new THREE.BoxGeometry(30, 20, 2);
    const gate = new THREE.Mesh(gateGeo, new THREE.MeshBasicMaterial({ visible: false }));
    gate.position.set(pt.x, 0, pt.z);
    gate.lookAt(pt.x + tangent.x, 0, pt.z + tangent.z);
    scene.add(gate);
    gates.push(gate);
}

// --- 5. GAME LOGIC ---
// [NOTE: Re-use the F1 Generator, Minimap, and Ably logic from previous step here]
// ... (Insert createF1Car, drawMinimap, and broadcastPosition functions from the last snippet) ...

// Collision Physics: Updated for consistency
function checkCollisions() {
    for (const id in players) {
        const opp = players[id].mesh;
        const dist = myCar.position.distanceTo(opp.position);
        if (dist < 4) {
            const angle = Math.atan2(myCar.position.z - opp.position.z, myCar.position.x - opp.position.x);
            myCar.position.x += Math.cos(angle) * 0.8;
            myCar.position.z += Math.sin(angle) * 0.8;
            speed *= 0.3;
            playBeep(100, 0.1, "square");
        }
    }
}

// --- 6. ANIMATE LOOP ---
function animate() {
    requestAnimationFrame(animate);

    if (gameState === 2) {
        // ... (Physics and steering logic same as last step) ...

        // Updated Gate Logic
        const gate = gates[nextCheckpointIndex];
        if (myCar.position.distanceTo(gate.position) < 20) {
            playBeep(600, 0.1, "sine");
            nextCheckpointIndex = (nextCheckpointIndex + 1) % gates.length;
            if (nextCheckpointIndex === 0) {
                currentLap++;
                // ... (Lap completion UI update) ...
            }
        }

        // Engine Audio
        if(audioCtx && filterNode) {
            const targetFreq = 100 + (Math.abs(speed) / maxSpeed) * 800;
            filterNode.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);
        }
    }

    renderer.render(scene, camera);
}
animate();
