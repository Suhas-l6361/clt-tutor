// Import Three.js and addons as ES modules
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Global variables
let scene, camera, renderer, controls, stomachModel;
let isLoading = true;
let highlightedParts = new Map();

// Initialize the 3D scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    
    // Camera setup - Professional settings for stomach viewing
    camera = new THREE.PerspectiveCamera(
        75, // FOV - wider for detailed stomach viewing
        window.innerWidth / window.innerHeight,
        0.1, // Near plane
        1000 // Far plane
    );
    
    // Position camera for optimal stomach viewing
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup with high quality settings
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('stomachCanvas'),
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
    
    // Load the stomach model
    loadStomachModel();
    
    // Setup event listeners
    setupEventListeners();
    
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
    
    // Professional controls with mobile optimization
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
    
    // Zoom settings - responsive range for stomach viewing
    controls.minDistance = 2;
    controls.maxDistance = 50;
    controls.zoomSpeed = isMobile ? 0.5 : 1.0;
    
    // Rotation settings - mobile optimized
    controls.enableRotate = true;
    controls.rotateSpeed = isMobile ? 0.5 : 1.0;
    controls.maxPolarAngle = Math.PI; // Allow full rotation
    
    // Pan settings - mobile optimized
    controls.enablePan = true;
    controls.panSpeed = isMobile ? 0.5 : 1.0;
    controls.keyPanSpeed = 7.0;
    
    // Auto-rotate (disabled for anatomy study)
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    
    // Target (what the camera looks at)
    controls.target.set(0, 0, 0);
    controls.update();
}

function loadStomachModel() {
    const loader = new GLTFLoader();
    
    loader.load('realistic_human_stomach.glb', function(gltf) {
        stomachModel = gltf.scene;
        
        // Scale the model appropriately for stomach viewing
        stomachModel.scale.setScalar(3.0);
        
        // Center the model
        const box = new THREE.Box3().setFromObject(stomachModel);
        const center = box.getCenter(new THREE.Vector3());
        stomachModel.position.sub(center);
        
        // Adjust camera to fit the model properly
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.8; // Add margin for better view
        
        camera.position.set(0, 0, cameraZ);
        controls.target.set(0, 0, 0);
        controls.update();
        
        // Update zoom limits based on model size
        controls.minDistance = maxDim * 0.3;
        controls.maxDistance = maxDim * 8;
        
        // Preserve original GLB textures and materials
        preserveOriginalTextures();
        
        // Setup stomach part highlighting
        setupStomachPartHighlighting();
        
        scene.add(stomachModel);
        
        // Hide loading and show controls
        document.getElementById('loading').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
        document.getElementById('info-panel').style.display = 'block';
        document.getElementById('stomach-parts').style.display = 'flex';
        isLoading = false;
        
        console.log('✅ Human stomach model loaded successfully!');
        
    }, function(progress) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        document.getElementById('loading').textContent = `Loading 3D Human Stomach... ${percent}%`;
    }, function(error) {
        console.error('❌ Error loading stomach model:', error);
        document.getElementById('loading').textContent = 'Error loading stomach model. Please check console.';
    });
}

function preserveOriginalTextures() {
    if (!stomachModel) return;
    
    // Preserve original GLB textures and materials
    stomachModel.traverse(function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Store original material for potential highlighting
            child.userData.originalMaterial = child.material.clone();
            child.userData.isHighlighted = false;
            
            // Ensure material updates properly
            child.material.needsUpdate = true;
            
            // Add click event for interactive anatomy
            child.userData.clickable = true;
        }
    });
}

function setupStomachPartHighlighting() {
    // Setup stomach part buttons
    const stomachPartButtons = document.querySelectorAll('.stomach-part-btn');
    
    stomachPartButtons.forEach(button => {
        button.addEventListener('click', function() {
            const partName = this.getAttribute('data-part');
            highlightStomachPart(partName);
            
            // Update button states
            stomachPartButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function highlightStomachPart(partName) {
    // Reset all highlights first
    resetHighlights();
    
    if (!stomachModel) return;
    
    // Define stomach part highlighting logic
    const highlightColor = new THREE.Color(0xff6b6b); // Red highlight
    
    stomachModel.traverse(function(child) {
        if (child.isMesh && child.userData.clickable) {
            // Simple name-based highlighting (can be enhanced with more sophisticated logic)
            const meshName = child.name.toLowerCase();
            
            if (shouldHighlightMesh(meshName, partName)) {
                // Create highlight material
                const highlightMaterial = child.userData.originalMaterial.clone();
                highlightMaterial.emissive = highlightColor;
                highlightMaterial.emissiveIntensity = 0.3;
                
                child.material = highlightMaterial;
                child.userData.isHighlighted = true;
                highlightedParts.set(child.uuid, child);
            }
        }
    });
}

function shouldHighlightMesh(meshName, partName) {
    // Simple mapping logic for stomach anatomy
    const mappings = {
        'fundus': ['fundus', 'upper', 'top'],
        'body': ['body', 'corpus', 'main'],
        'antrum': ['antrum', 'lower', 'distal'],
        'pylorus': ['pylorus', 'pyloric', 'outlet'],
        'cardia': ['cardia', 'cardiac', 'entrance'],
        'rugae': ['rugae', 'folds', 'ridges', 'internal']
    };
    
    const keywords = mappings[partName] || [];
    return keywords.some(keyword => meshName.includes(keyword));
}

function resetHighlights() {
    highlightedParts.forEach((mesh, uuid) => {
        if (mesh.userData.originalMaterial) {
            mesh.material = mesh.userData.originalMaterial;
            mesh.userData.isHighlighted = false;
        }
    });
    highlightedParts.clear();
    
    // Reset button states
    document.querySelectorAll('.stomach-part-btn').forEach(btn => {
        btn.classList.remove('active');
    });
}

function setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        if (isLoading) return;
        
        switch(event.key.toLowerCase()) {
            case 'r':
                // Reset view
                resetView();
                break;
            case 'f':
                // Focus on model
                focusOnModel();
                break;
            case 'h':
                // Reset highlights
                resetHighlights();
                break;
        }
    });
}

function resetView() {
    if (!stomachModel) return;
    
    const box = new THREE.Box3().setFromObject(stomachModel);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.8;
    
    camera.position.set(0, 0, cameraZ);
    controls.target.set(0, 0, 0);
    controls.update();
}

function focusOnModel() {
    if (!stomachModel) return;
    
    const box = new THREE.Box3().setFromObject(stomachModel);
    const center = box.getCenter(new THREE.Vector3());
    
    camera.position.copy(center);
    camera.position.z += 8;
    controls.target.copy(center);
    controls.update();
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
