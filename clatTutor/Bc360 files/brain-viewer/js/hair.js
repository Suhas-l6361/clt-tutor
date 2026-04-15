// Import Three.js and addons as ES modules
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Global variables
let scene, camera, renderer, controls, hairModel;
let isLoading = true;

// Initialize the 3D scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1976d2);
    
    // Camera setup - Professional settings
    camera = new THREE.PerspectiveCamera(
        75, // FOV - wider for better overview
        window.innerWidth / window.innerHeight,
        0.1, // Near plane
        1000 // Far plane
    );
    
    // Position camera for optimal hair viewing
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup with high quality settings
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('hairCanvas'),
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    
    // Setup lighting
    setupLighting();
    
    // Setup controls
    setupControls();
    
    // Load the hair model
    loadHairModel();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation loop
    animate();
}

function setupLighting() {
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xf5f5f5, 0.7);
    scene.add(ambientLight);
    
    // Main directional light - natural white light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    scene.add(directionalLight);
    
    // Fill light from the opposite side
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-10, 5, -5);
    scene.add(fillLight);
    
    // Rim light for edge definition
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, -10, -10);
    scene.add(rimLight);
    
    // Point light for additional detail
    const pointLight = new THREE.PointLight(0xffffff, 0.8, 100);
    pointLight.position.set(0, 5, 5);
    scene.add(pointLight);
}

function setupControls() {
    controls = new OrbitControls(camera, renderer.domElement);
    
    // Detect if device is mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    // Blender-like controls with mobile optimization
    controls.enableDamping = true;
    controls.dampingFactor = isMobile ? 0.1 : 0.05;
    controls.screenSpacePanning = false;
    
    // Keep orbit controls enabled
    controls.enabled = true;
    
    // Keyboard controls (desktop only)
    if (!isMobile) {
        controls.enableKeys = true;
        controls.keys = {
            LEFT: 'ArrowLeft',
            UP: 'ArrowUp', 
            RIGHT: 'ArrowRight',
            BOTTOM: 'ArrowDown'
        };
    }
    
    // Zoom settings - responsive range
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.zoomSpeed = isMobile ? 0.5 : 1.0;
    
    // Rotation settings - mobile optimized
    controls.enableRotate = true;
    controls.rotateSpeed = isMobile ? 0.5 : 1.0;
    controls.maxPolarAngle = Math.PI; // Allow full rotation
    
    // Pan settings - mobile optimized
    controls.enablePan = true;
    controls.panSpeed = isMobile ? 0.5 : 1.0;
    controls.keyPanSpeed = 7.0;
    
    // Auto-rotate (optional - can be toggled)
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    
    // Target (what the camera looks at)
    controls.target.set(0, 0, 0);
    controls.update();
}

function loadHairModel() {
    const loader = new GLTFLoader();
    
    loader.load('hair.glb', function(gltf) {
        hairModel = gltf.scene;
        
        // Scale and position the model
        hairModel.scale.setScalar(1.0);
        
        // Center the model
        const box = new THREE.Box3().setFromObject(hairModel);
        const center = box.getCenter(new THREE.Vector3());
        hairModel.position.sub(center);
        
        // Adjust camera to fit the model properly
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Add margin for better view
        
        camera.position.set(0, 0, cameraZ);
        controls.target.set(0, 0, 0);
        controls.update();
        
        // Update zoom limits based on model size
        controls.minDistance = maxDim * 0.3;
        controls.maxDistance = maxDim * 8;
        
        // Preserve original GLB textures and materials
        preserveOriginalTextures();
        
        scene.add(hairModel);
        
        // Hide loading and show controls
        document.getElementById('loading').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
        isLoading = false;
        
        console.log('✅ Hair model loaded successfully!');
        
    }, function(progress) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        document.getElementById('loading').textContent = `Loading 3D Hair Model... ${percent}%`;
    }, function(error) {
        console.error('❌ Error loading hair model:', error);
        document.getElementById('loading').textContent = 'Error loading hair model. Please check console.';
    });
}

function preserveOriginalTextures() {
    if (!hairModel) return;
    
    // Preserve original GLB textures and materials
    hairModel.traverse(function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Store original material for potential highlighting
            child.userData.originalMaterial = child.material.clone();
            child.userData.isHighlighted = false;
            
            // Ensure material updates properly
            child.material.needsUpdate = true;
        }
    });
}

function onWindowResize() {
    // Update camera aspect ratio
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    // Update renderer size
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
