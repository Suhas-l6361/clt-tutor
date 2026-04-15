// Import Three.js and addons as ES modules
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Global variables
let scene, camera, renderer, controls, eyeModel;
let isLoading = true;

// Initialize the 3D scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    
    // Position camera for optimal eye viewing
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('eyeCanvas'),
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    
    // Setup lighting
    setupLighting();
    
    // Setup controls
    setupControls();
    
    // Load the eye model
    loadEyeModel();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation loop
    animate();
}

function setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xf5f5f5, 0.7);
    scene.add(ambientLight);
    
    // Main directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-10, 5, -5);
    scene.add(fillLight);
}

function setupControls() {
    controls = new OrbitControls(camera, renderer.domElement);
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    controls.enableDamping = true;
    controls.dampingFactor = isMobile ? 0.1 : 0.05;
    controls.screenSpacePanning = false;
    controls.enabled = true;
    
    // Zoom settings
    controls.minDistance = 2;
    controls.maxDistance = 50;
    controls.zoomSpeed = isMobile ? 0.5 : 1.0;
    
    // Rotation settings
    controls.enableRotate = true;
    controls.rotateSpeed = isMobile ? 0.5 : 1.0;
    controls.maxPolarAngle = Math.PI;
    
    // Pan settings
    controls.enablePan = true;
    controls.panSpeed = isMobile ? 0.5 : 1.0;
    
    controls.target.set(0, 0, 0);
    controls.update();
}

function loadEyeModel() {
    const loader = new GLTFLoader();
    
    loader.load('eyeball.glb', function(gltf) {
        eyeModel = gltf.scene;
        
        // Scale the model for better viewing
        eyeModel.scale.setScalar(3.0);
        
        // Center the model
        const box = new THREE.Box3().setFromObject(eyeModel);
        const center = box.getCenter(new THREE.Vector3());
        eyeModel.position.sub(center);
        
        // Adjust camera for optimal eye viewing
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.8; // Closer view for eye details
        
        camera.position.set(0, 0, cameraZ);
        controls.target.set(0, 0, 0);
        controls.update();
        
        // Update zoom limits for eye viewing
        controls.minDistance = maxDim * 0.3;
        controls.maxDistance = maxDim * 8;
        
        // Preserve original GLB textures and materials
        preserveOriginalTextures();
        
        scene.add(eyeModel);
        
        // Hide loading and show controls
        document.getElementById('loading').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
        isLoading = false;
        
        console.log('✅ Realistic eye model loaded successfully!');
        
    }, function(progress) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        document.getElementById('loading').textContent = `Loading 3D Eye Model... ${percent}%`;
    }, function(error) {
        console.error('❌ Error loading eye model:', error);
        document.getElementById('loading').textContent = 'Error loading eye model. Please check console.';
    });
}

function preserveOriginalTextures() {
    if (!eyeModel) return;
    
    // Preserve the original GLB textures and materials
    eyeModel.traverse(function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Keep the original material from the GLB file
            if (child.material) {
                child.material.needsUpdate = true;
            }
        }
    });
}


function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    renderer.render(scene, camera);
}

// Initialize the application
init();
