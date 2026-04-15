// Import Three.js and addons as ES modules
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Global variables
let scene, camera, renderer, controls, motherboardModel;
let isLoading = true;
let highlightedParts = new Map();

// Initialize the 3D scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    
    // Camera setup - Professional settings for motherboard viewing
    camera = new THREE.PerspectiveCamera(
        75, // FOV - wider for motherboard viewing
        window.innerWidth / window.innerHeight,
        0.1, // Near plane
        1000 // Far plane
    );
    
    // Position camera for optimal motherboard viewing
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup with high quality settings
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('motherboardCanvas'),
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // Disable tone mapping to preserve original colors
    renderer.toneMappingExposure = 1.0;
    
    // Setup lighting
    setupLighting();
    
    // Setup controls
    setupControls();
    
    // Load the motherboard model
    loadMotherboardModel();
    
    // Setup event listeners
    setupEventListeners();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation loop
    animate();
}

function setupLighting() {
    // Ambient light for overall illumination - neutral to preserve original colors
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    // Main directional light - neutral white light with lower intensity
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
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
    
    // Fill light from the opposite side - reduced intensity
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-10, 5, -5);
    scene.add(fillLight);
    
    // Rim light for edge definition - minimal intensity
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, -10, -10);
    scene.add(rimLight);
    
    // Point light for additional detail - reduced intensity
    const pointLight = new THREE.PointLight(0xffffff, 0.4, 100);
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
    
    // Zoom settings - responsive range for motherboard viewing
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
    
    // Auto-rotate (disabled for component study)
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    
    // Target (what the camera looks at)
    controls.target.set(0, 0, 0);
    controls.update();
}

function loadMotherboardModel() {
    const loader = new GLTFLoader();
    
    loader.load('mother_board__3d_model.glb', function(gltf) {
        motherboardModel = gltf.scene;
        
        // Scale the model appropriately for motherboard viewing
        motherboardModel.scale.setScalar(1.0);
        
        // Center the model
        const box = new THREE.Box3().setFromObject(motherboardModel);
        const center = box.getCenter(new THREE.Vector3());
        motherboardModel.position.sub(center);
        
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
        
        // Preserve original GLB textures, materials, and labels
        preserveOriginalTexturesAndLabels();
        
        // Setup motherboard part highlighting
        setupMotherboardPartHighlighting();
        
        scene.add(motherboardModel);
        
        // Hide loading and show controls
        document.getElementById('loading').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
        document.getElementById('info-panel').style.display = 'block';
        document.getElementById('motherboard-parts').style.display = 'flex';
        isLoading = false;
        
        console.log('✅ Motherboard model loaded successfully!');
        
    }, function(progress) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        document.getElementById('loading').textContent = `Loading 3D Motherboard... ${percent}%`;
    }, function(error) {
        console.error('❌ Error loading motherboard model:', error);
        document.getElementById('loading').textContent = 'Error loading motherboard model. Please check console.';
    });
}

function preserveOriginalTexturesAndLabels() {
    if (!motherboardModel) return;
    
    // Preserve original GLB textures, materials, and labels
    motherboardModel.traverse(function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Store original material for potential highlighting - DON'T modify the original
            child.userData.originalMaterial = child.material;
            child.userData.isHighlighted = false;
            
            // DON'T modify the original material - keep it exactly as it is
            // child.material.needsUpdate = true; // REMOVED - this was causing color issues
            
            // Add click event for interactive components
            child.userData.clickable = true;
            
            // Preserve any text/label materials specifically
            if (child.material && child.material.map) {
                // Ensure texture is properly loaded and displayed
                child.material.map.needsUpdate = true;
            }
            
            // Handle multiple materials (if any)
            if (child.material && child.material.materials) {
                child.material.materials.forEach(material => {
                    if (material.map) {
                        material.map.needsUpdate = true;
                    }
                });
            }
        }
        
        // Handle text/label objects specifically
        if (child.isText || child.name.toLowerCase().includes('label') || child.name.toLowerCase().includes('text')) {
            // Preserve text materials and ensure they're visible
            if (child.material) {
                child.material.needsUpdate = true;
                child.visible = true; // Ensure labels are visible
            }
        }
        
        // Handle any child objects that might be labels
        if (child.children && child.children.length > 0) {
            child.children.forEach(grandChild => {
                if (grandChild.isMesh && grandChild.material) {
                    grandChild.material.needsUpdate = true;
                    grandChild.visible = true;
                }
            });
        }
    });
    
    // Log all objects to help identify labels
    console.log('📋 All objects in motherboard model:');
    motherboardModel.traverse(function(child) {
        if (child.name) {
            console.log(`- ${child.name} (${child.type})`);
        }
    });
}

function setupMotherboardPartHighlighting() {
    // Setup motherboard part buttons
    const motherboardPartButtons = document.querySelectorAll('.motherboard-part-btn');
    
    motherboardPartButtons.forEach(button => {
        button.addEventListener('click', function() {
            const partName = this.getAttribute('data-part');
            highlightMotherboardPart(partName);
            
            // Update button states
            motherboardPartButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function highlightMotherboardPart(partName) {
    // Reset all highlights first
    resetHighlights();
    
    if (!motherboardModel) return;
    
    // Define motherboard part highlighting logic
    const highlightColor = new THREE.Color(0xff6b6b); // Red highlight
    
    motherboardModel.traverse(function(child) {
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
    // Simple mapping logic for motherboard components
    const mappings = {
        'cpu-socket': ['cpu', 'socket', 'processor', 'lga', 'pga'],
        'ram-slots': ['ram', 'memory', 'dimm', 'sodimm', 'slot'],
        'pci-slots': ['pci', 'pcie', 'expansion', 'slot', 'card'],
        'sata-ports': ['sata', 'port', 'connector', 'drive'],
        'usb-headers': ['usb', 'header', 'connector', 'port'],
        'power-connectors': ['power', 'connector', 'atx', 'eps', 'pcie']
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
    document.querySelectorAll('.motherboard-part-btn').forEach(btn => {
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
    if (!motherboardModel) return;
    
    const box = new THREE.Box3().setFromObject(motherboardModel);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5;
    
    camera.position.set(0, 0, cameraZ);
    controls.target.set(0, 0, 0);
    controls.update();
}

function focusOnModel() {
    if (!motherboardModel) return;
    
    const box = new THREE.Box3().setFromObject(motherboardModel);
    const center = box.getCenter(new THREE.Vector3());
    
    camera.position.copy(center);
    camera.position.z += 10;
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
