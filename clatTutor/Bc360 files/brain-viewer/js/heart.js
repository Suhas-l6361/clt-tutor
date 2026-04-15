// Import Three.js and addons as ES modules
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Global variables
let scene, camera, renderer, controls, heartModel;
let isLoading = true;

// Initialize the 3D scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    // Camera setup - Professional settings
    camera = new THREE.PerspectiveCamera(
        75, // FOV - wider for better overview
        window.innerWidth / window.innerHeight,
        0.1, // Near plane
        1000 // Far plane
    );
    
    // Position camera for optimal heart viewing - start zoomed out
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup with high quality settings
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('heartCanvas'),
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
    
    // Load the heart model
    loadHeartModel();
    
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
    
    // Zoom settings - much better range for zooming out
    controls.minDistance = 0.1;
    controls.maxDistance = 1000;
    controls.zoomSpeed = isMobile ? 1.0 : 2.0;
    
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

function loadHeartModel() {
    const loader = new GLTFLoader();
    
    loader.load('heart.glb', function(gltf) {
        heartModel = gltf.scene;
        
        // Scale and position the model - make it much larger for visibility
        heartModel.scale.setScalar(50.0); // Start with 50x bigger
        
        // Center the model
        const box = new THREE.Box3().setFromObject(heartModel);
        const center = box.getCenter(new THREE.Vector3());
        heartModel.position.sub(center);
        
        // Adjust camera to fit the model properly
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 2.5; // Much wider view for initial zoom out
        
        camera.position.set(0, 0, cameraZ);
        controls.target.set(0, 0, 0);
        controls.update();
        
        // Update zoom limits based on model size - even better zoom range
        controls.minDistance = maxDim * 0.05; // Allow very close zoom
        controls.maxDistance = maxDim * 100; // Allow much, much further zoom out
        
        // Preserve original GLB textures and materials
        preserveOriginalTextures();
        
        scene.add(heartModel);
        
        // Debug: Check if model is actually in the scene
        console.log('Models in scene:', scene.children.length);
        console.log('Heart model in scene:', scene.children.includes(heartModel));
        
        // Hide loading and show controls
        document.getElementById('loading').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
        isLoading = false;
        
        console.log('✅ Heart model loaded successfully!');
        console.log('Heart model size:', size.x, size.y, size.z);
        console.log('Max dimension:', maxDim);
        console.log('Camera position:', camera.position.x, camera.position.y, camera.position.z);
        console.log('Model position:', heartModel.position.x, heartModel.position.y, heartModel.position.z);
        console.log('Model scale:', heartModel.scale.x, heartModel.scale.y, heartModel.scale.z);
        
        // Make model MUCH bigger - the model is extremely tiny!
        console.log('Making model MUCH bigger - it was only 0.04 units!');
        heartModel.scale.setScalar(100.0); // 100x bigger!
        camera.position.set(0, 0, 5); // Much better starting position - zoomed out
        controls.target.set(0, 0, 0);
        controls.update();
        
        // Force update the camera distance
        const newBox = new THREE.Box3().setFromObject(heartModel);
        const newSize = newBox.getSize(new THREE.Vector3());
        const newMaxDim = Math.max(newSize.x, newSize.y, newSize.z);
        console.log('New model size after scaling:', newSize.x, newSize.y, newSize.z);
        console.log('New max dimension:', newMaxDim);
        
    }, function(progress) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        document.getElementById('loading').textContent = `Loading 3D Heart Model... ${percent}%`;
    }, function(error) {
        console.error('❌ Error loading heart model:', error);
        document.getElementById('loading').textContent = 'Error loading heart model. Please check console.';
    });
}

function preserveOriginalTextures() {
    if (!heartModel) return;
    
    // Preserve original GLB textures and materials
    heartModel.traverse(function(child) {
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
