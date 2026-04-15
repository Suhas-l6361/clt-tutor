// Import Three.js and addons as ES modules
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Global variables
let scene, camera, renderer, controls, bodyModel;
let isLoading = true;
let highlightedParts = new Map();

// Initialize the 3D scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe9ecef);
    
    // Camera setup - Professional settings for anatomy viewing
    camera = new THREE.PerspectiveCamera(
        60, // FOV - slightly narrower for detailed anatomy viewing
        window.innerWidth / window.innerHeight,
        0.1, // Near plane
        1000 // Far plane
    );
    
    // Position camera for optimal body anatomy viewing
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup with high quality settings
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('bodyCanvas'),
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
    renderer.toneMappingExposure = 1.0; // Slightly lower for anatomical accuracy
    
    // Setup lighting
    setupLighting();
    
    // Setup controls
    setupControls();
    
    // Load the human body model
    loadBodyModel();
    
    // Setup event listeners
    setupEventListeners();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation loop
    animate();
}

function setupLighting() {
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Main directional light - natural white light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(15, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);
    
    // Fill light from the opposite side
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-15, 10, -10);
    scene.add(fillLight);
    
    // Rim light for edge definition
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, -15, -15);
    scene.add(rimLight);
    
    // Point light for additional detail
    const pointLight = new THREE.PointLight(0xffffff, 0.6, 150);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);
    
    // Additional point light for better anatomical detail
    const detailLight = new THREE.PointLight(0xffffff, 0.4, 100);
    detailLight.position.set(10, 0, 5);
    scene.add(detailLight);
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
    
    // Zoom settings - responsive range for anatomy viewing
    controls.minDistance = 5;
    controls.maxDistance = 150;
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

function loadBodyModel() {
    const loader = new GLTFLoader();
    
    loader.load('front_body_anatomy.glb', function(gltf) {
        bodyModel = gltf.scene;
        
        // Scale the model appropriately for anatomy viewing
        bodyModel.scale.setScalar(1.0);
        
        // Center the model
        const box = new THREE.Box3().setFromObject(bodyModel);
        const center = box.getCenter(new THREE.Vector3());
        bodyModel.position.sub(center);
        
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
        controls.minDistance = maxDim * 0.5;
        controls.maxDistance = maxDim * 10;
        
        // Preserve original GLB textures and materials
        preserveOriginalTextures();
        
        // Setup body part highlighting
        setupBodyPartHighlighting();
        
        scene.add(bodyModel);
        
        // Hide loading and show controls
        document.getElementById('loading').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
        document.getElementById('info-panel').style.display = 'block';
        document.getElementById('body-parts').style.display = 'flex';
        isLoading = false;
        
        console.log('✅ Human body anatomy model loaded successfully!');
        
    }, function(progress) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        document.getElementById('loading').textContent = `Loading 3D Human Body Anatomy... ${percent}%`;
    }, function(error) {
        console.error('❌ Error loading human body model:', error);
        document.getElementById('loading').textContent = 'Error loading human body model. Please check console.';
    });
}

function preserveOriginalTextures() {
    if (!bodyModel) return;
    
    // Preserve original GLB textures and materials
    bodyModel.traverse(function(child) {
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

function setupBodyPartHighlighting() {
    // Setup body part buttons
    const bodyPartButtons = document.querySelectorAll('.body-part-btn');
    
    bodyPartButtons.forEach(button => {
        button.addEventListener('click', function() {
            const partName = this.getAttribute('data-part');
            highlightBodyPart(partName);
            
            // Update button states
            bodyPartButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function highlightBodyPart(partName) {
    // Reset all highlights first
    resetHighlights();
    
    if (!bodyModel) return;
    
    // Define body part highlighting logic
    const highlightColor = new THREE.Color(0xff6b6b); // Red highlight
    
    bodyModel.traverse(function(child) {
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
    // Simple mapping logic - can be enhanced with more sophisticated anatomy detection
    const mappings = {
        'heart': ['heart', 'cardiac', 'atrium', 'ventricle'],
        'lungs': ['lung', 'pulmonary', 'bronchi', 'trachea'],
        'liver': ['liver', 'hepatic'],
        'stomach': ['stomach', 'gastric'],
        'intestines': ['intestine', 'bowel', 'colon', 'small', 'large'],
        'kidneys': ['kidney', 'renal']
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
    document.querySelectorAll('.body-part-btn').forEach(btn => {
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
    if (!bodyModel) return;
    
    const box = new THREE.Box3().setFromObject(bodyModel);
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
    if (!bodyModel) return;
    
    const box = new THREE.Box3().setFromObject(bodyModel);
    const center = box.getCenter(new THREE.Vector3());
    
    camera.position.copy(center);
    camera.position.z += 15;
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
