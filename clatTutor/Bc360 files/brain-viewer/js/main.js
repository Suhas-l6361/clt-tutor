// Import Three.js and addons as ES modules
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Global variables
let scene, camera, renderer, controls, brainModel;
let isLoading = true;
let raycaster, mouse;
let brainParts = {};
let currentHighlightedPart = null;
let numberLabels = [];
let clickableObjects = [];

// Initialize the 3D scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    
    // Camera setup - Professional settings
    camera = new THREE.PerspectiveCamera(
        75, // FOV - wider for better overview
        window.innerWidth / window.innerHeight,
        0.1, // Near plane
        1000 // Far plane
    );
    
    // Position camera for optimal brain viewing - much further back
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup with high quality settings
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('brainCanvas'),
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
    
    // Professional lighting setup
    setupLighting();
    
    // Setup controls with Blender-like behavior
    setupControls();
    
    // Setup raycasting for mouse interactions
    setupRaycasting();
    
    // Load the brain model
    loadBrainModel();
    
    // Setup brain part interactions
    setupBrainPartInteractions();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Add touch event listeners for mobile
    setupTouchControls();
    
    // Start animation loop
    animate();
}

function setupLighting() {
    // Ambient light for overall illumination - more natural for brain
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
    
    // Keep orbit controls enabled for mouse users on mobile
    // Touch controls will work alongside mouse controls
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

function loadBrainModel() {
    const loader = new GLTFLoader();
    
    loader.load('brain.glb', function(gltf) {
        brainModel = gltf.scene;
        
        // Scale and position the model - much smaller for better view
        brainModel.scale.setScalar(0.3);
        
        // Center the model
        const box = new THREE.Box3().setFromObject(brainModel);
        const center = box.getCenter(new THREE.Vector3());
        brainModel.position.sub(center);
        
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
        controls.minDistance = maxDim * 0.5;
        controls.maxDistance = maxDim * 10;
        
        // Enable shadows and setup brain parts
        brainModel.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Completely replace the material with realistic brain material
                const brainMaterial = new THREE.MeshPhongMaterial({
                    color: 0xe8a5a5, // Realistic pinkish-red brain color
                    shininess: 5, // Very low shininess for organic tissue
                    roughness: 0.9, // Very high roughness for realistic texture
                    transparent: false,
                    side: THREE.DoubleSide
                });
                
                // Replace the material completely
                child.material = brainMaterial;
                
                // Store original material for highlighting
                child.userData.originalMaterial = child.material.clone();
                child.userData.isHighlighted = false;
            }
        });
        
        // Force override all textures and materials
        forceOverrideMaterials();
        
        // Separate left and right brain hemispheres with different colors
        separateBrainHemispheres();
        
        // Add numbered labels on the brain
        addNumberLabelsOnBrain();
        
        scene.add(brainModel);
        
        // Hide loading and show controls
        document.getElementById('loading').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
        document.getElementById('info-panel').style.display = 'block';
        document.getElementById('brain-parts').style.display = 'none'; // Hide buttons, use brain marks instead
        isLoading = false;
        
        console.log('✅ Brain model loaded successfully!');
        
    }, function(progress) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        document.getElementById('loading').textContent = `Loading 3D Brain Model... ${percent}%`;
    }, function(error) {
        console.error('❌ Error loading brain model:', error);
        document.getElementById('loading').textContent = 'Error loading brain model. Please check console.';
    });
}

function setupRaycasting() {
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
}

function forceOverrideMaterials() {
    if (!brainModel) return;
    
    // Force override ALL materials to remove texture interference
    brainModel.traverse(function(child) {
        if (child.isMesh) {
            // Create completely new material without any textures
            const newMaterial = new THREE.MeshPhongMaterial({
                color: 0xe8a5a5, // Realistic pinkish-red brain color
                shininess: 5,
                roughness: 0.9,
                transparent: false,
                side: THREE.DoubleSide,
                // Explicitly remove all textures
                map: null,
                normalMap: null,
                bumpMap: null,
                specularMap: null,
                emissiveMap: null,
                aoMap: null,
                displacementMap: null,
                metalnessMap: null,
                roughnessMap: null
            });
            
            // Force replace the material
            child.material = newMaterial;
            child.material.needsUpdate = true;
            
            // Clear any existing textures
            if (child.material.map) child.material.map = null;
            if (child.material.normalMap) child.material.normalMap = null;
            if (child.material.bumpMap) child.material.bumpMap = null;
        }
    });
}

function separateBrainHemispheres() {
    if (!brainModel) return;
    
    // Force override all materials with realistic brain color
    brainModel.traverse(function(child) {
        if (child.isMesh) {
            // Create realistic human brain material
            const brainMaterial = new THREE.MeshPhongMaterial({
                color: 0xe8a5a5, // Realistic pinkish-red brain color
                shininess: 5, // Very low shininess for organic tissue
                roughness: 0.9, // Very high roughness for realistic texture
                transparent: false,
                side: THREE.DoubleSide
            });
            
            // Force replace the material
            child.material = brainMaterial;
            child.material.needsUpdate = true;
            child.userData.hemisphere = 'brain';
            
            // Store original material
            child.userData.originalMaterial = child.material.clone();
        }
    });
    
    // Add blood vessels and circulatory system
    addBloodVessels();
}

function addBloodVessels() {
    if (!brainModel) return;
    
    // Get brain bounding box
    const box = new THREE.Box3().setFromObject(brainModel);
    const size = box.getSize(new THREE.Vector3());
    
    // Create blood vessel geometry - smaller for realistic look
    const vesselGeometry = new THREE.CylinderGeometry(0.01, 0.01, 1, 6);
    const vesselMaterial = new THREE.MeshPhongMaterial({
        color: 0xff6b6b, // Light red for blood vessels
        shininess: 30,
        roughness: 0.2,
        emissive: 0x220000, // Subtle glow
        emissiveIntensity: 0.1
    });
    
    const vessels = [];
    
    // Add blood vessels following brain curves and grooves
    addCurvedVessels(vessels, vesselGeometry, vesselMaterial, size);
    
    // Add major arteries
    addMajorArteries(vessels, vesselGeometry, vesselMaterial, size);
    
    // Add surface capillaries
    addSurfaceCapillaries(vessels, vesselGeometry, vesselMaterial, size);
    
    // Store vessels for potential cleanup
    brainModel.userData.bloodVessels = vessels;
}

function addCurvedVessels(vessels, geometry, material, size) {
    // Add vessels that follow the natural curves of the brain
    const curvePoints = [
        // Frontal lobe curves
        { pos: [size.x * 0.2, size.y * 0.4, size.z * 0.3], rot: [0, 0, Math.PI/4], scale: [0.8, 0.6, 0.8] },
        { pos: [-size.x * 0.2, size.y * 0.4, size.z * 0.3], rot: [0, 0, -Math.PI/4], scale: [0.8, 0.6, 0.8] },
        
        // Parietal lobe curves
        { pos: [size.x * 0.3, size.y * 0.5, 0], rot: [0, Math.PI/6, 0], scale: [0.7, 0.5, 0.7] },
        { pos: [-size.x * 0.3, size.y * 0.5, 0], rot: [0, -Math.PI/6, 0], scale: [0.7, 0.5, 0.7] },
        
        // Temporal lobe curves
        { pos: [size.x * 0.4, size.y * 0.1, 0], rot: [0, 0, Math.PI/3], scale: [0.6, 0.4, 0.6] },
        { pos: [-size.x * 0.4, size.y * 0.1, 0], rot: [0, 0, -Math.PI/3], scale: [0.6, 0.4, 0.6] },
        
        // Occipital lobe curves
        { pos: [0, size.y * 0.2, -size.z * 0.4], rot: [Math.PI/4, 0, 0], scale: [0.5, 0.3, 0.5] },
        
        // Cerebellum curves
        { pos: [size.x * 0.2, -size.y * 0.3, 0], rot: [0, Math.PI/4, Math.PI/6], scale: [0.4, 0.2, 0.4] },
        { pos: [-size.x * 0.2, -size.y * 0.3, 0], rot: [0, -Math.PI/4, -Math.PI/6], scale: [0.4, 0.2, 0.4] }
    ];
    
    curvePoints.forEach(point => {
        const vessel = new THREE.Mesh(geometry, material);
        vessel.position.set(point.pos[0], point.pos[1], point.pos[2]);
        vessel.rotation.set(point.rot[0], point.rot[1], point.rot[2]);
        vessel.scale.set(point.scale[0], point.scale[1], point.scale[2]);
        scene.add(vessel);
        vessels.push(vessel);
    });
}

function addMajorArteries(vessels, geometry, material, size) {
    // Middle cerebral artery
    const mca = new THREE.Mesh(geometry, material);
    mca.position.set(size.x * 0.3, size.y * 0.2, 0);
    mca.rotation.z = Math.PI / 4;
    mca.scale.set(1.2, 1.0, 1.2);
    scene.add(mca);
    vessels.push(mca);
    
    // Anterior cerebral artery
    const aca = new THREE.Mesh(geometry, material);
    aca.position.set(0, size.y * 0.4, size.z * 0.2);
    aca.rotation.x = Math.PI / 6;
    aca.scale.set(1.0, 0.8, 1.0);
    scene.add(aca);
    vessels.push(aca);
    
    // Posterior cerebral artery
    const pca = new THREE.Mesh(geometry, material);
    pca.position.set(0, size.y * 0.1, -size.z * 0.3);
    pca.rotation.x = -Math.PI / 6;
    pca.scale.set(0.8, 0.6, 0.8);
    scene.add(pca);
    vessels.push(pca);
}

function addSurfaceCapillaries(vessels, geometry, material, size) {
    // Add small capillaries on the brain surface
    for (let i = 0; i < 20; i++) {
        const capillary = new THREE.Mesh(geometry, material);
        capillary.scale.set(0.3, 0.2, 0.3);
        
        // Position on brain surface following curves
        const angle = (i / 20) * Math.PI * 2;
        const radius = size.x * 0.4;
        capillary.position.set(
            Math.cos(angle) * radius * (0.5 + Math.random() * 0.5),
            (Math.random() - 0.5) * size.y * 0.8,
            Math.sin(angle) * radius * (0.5 + Math.random() * 0.5)
        );
        
        capillary.rotation.set(
            Math.random() * Math.PI * 0.5,
            Math.random() * Math.PI * 0.5,
            Math.random() * Math.PI * 0.5
        );
        
        scene.add(capillary);
        vessels.push(capillary);
    }
}

function addNumberLabelsOnBrain() {
    if (!brainModel) return;
    
    // Get brain bounding box to position labels correctly
    const box = new THREE.Box3().setFromObject(brainModel);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    // Define positions for each brain part number
    const labelPositions = {
        1: { x: 0, y: size.y * 0.3, z: size.z * 0.4 }, // Frontal Lobe - front top
        2: { x: 0, y: size.y * 0.5, z: 0 }, // Parietal Lobe - top center
        3: { x: size.x * 0.4, y: 0, z: 0 }, // Temporal Lobe - right side
        4: { x: 0, y: size.y * 0.2, z: -size.z * 0.4 }, // Occipital Lobe - back
        5: { x: 0, y: -size.y * 0.3, z: 0 }, // Cerebellum - bottom
        6: { x: 0, y: -size.y * 0.5, z: 0 } // Brain Stem - very bottom
    };
    
    // Create number labels
    Object.keys(labelPositions).forEach(partNumber => {
        const pos = labelPositions[partNumber];
        
        // Create responsive sphere size based on screen size - larger for mobile
        const isMobile = window.innerWidth <= 768;
        const isSmallMobile = window.innerWidth <= 480;
        const sphereRadius = isSmallMobile ? 1.2 : (isMobile ? 1.0 : 0.6);
        const geometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
        const material = new THREE.MeshPhongMaterial({
            color: 0xffff00, // Bright yellow
            emissive: 0xffff00,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.9
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(pos.x, pos.y, pos.z);
        sphere.userData.partNumber = partNumber;
        sphere.userData.isClickable = true;
        
        // Make the sphere always face the camera for better visibility
        sphere.lookAt = function() {
            this.lookAt(camera.position);
        };
        
        // Create responsive text sprite with better background and size
        const canvasSize = isSmallMobile ? 320 : (isMobile ? 288 : 256);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        
        // Draw responsive background circle
        const centerX = canvasSize / 2;
        const centerY = canvasSize / 2;
        const radius = canvasSize * 0.45;
        
        context.fillStyle = '#000000'; // Black background
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        context.fill();
        
        // Draw white border with responsive thickness
        const borderWidth = isSmallMobile ? 12 : (isMobile ? 10 : 8);
        context.strokeStyle = '#ffffff';
        context.lineWidth = borderWidth;
        context.stroke();
        
        // Draw the number with responsive font size
        const fontSize = isSmallMobile ? 180 : (isMobile ? 160 : 144);
        context.fillStyle = '#ffff00'; // Bright yellow text
        context.font = `bold ${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(partNumber, centerX, centerY);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            alphaTest: 0.1
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Responsive sprite scaling
        const spriteScale = isSmallMobile ? 2.5 : (isMobile ? 2.0 : 1.5);
        sprite.scale.set(spriteScale, spriteScale, 1);
        sprite.position.copy(sphere.position);
        sprite.position.y += 0.5; // Higher above the sphere
        
        // Add to scene
        scene.add(sphere);
        scene.add(sprite);
        
        // Add a pulsing animation to make numbers more visible
        const pulseAnimation = () => {
            const time = Date.now() * 0.003;
            const scale = 1 + Math.sin(time) * 0.3;
            sphere.scale.setScalar(scale);
            sprite.scale.set(1.5 * scale, 1.5 * scale, 1);
        };
        
        // Store references
        numberLabels.push({ sphere, sprite, partNumber, pulseAnimation });
        clickableObjects.push(sphere);
    });
    
    // Add mouse click handler with higher priority
    document.addEventListener('click', onMouseClick, true);
    document.addEventListener('dblclick', onMouseClick, true);
    
    // Add mouse move handler for cursor changes
    document.addEventListener('mousemove', onMouseMove);
    
    // Add touch event listeners for mobile click detection
    document.addEventListener('touchend', onMouseClick, true);
    
    // Add additional touch event for better mobile support
    document.addEventListener('touchstart', (event) => {
        if (event.touches.length === 1) {
            // Store touch position for potential click detection
            const touch = event.touches[0];
            window.lastTouchPosition = {
                x: touch.clientX,
                y: touch.clientY,
                time: Date.now()
            };
        }
    }, { passive: true });
    
    // Add debug logging for mobile
    if (window.innerWidth <= 768) {
        console.log('Mobile device detected - touch controls enabled');
        console.log('Number of clickable objects:', clickableObjects.length);
        console.log('Both mouse and touch controls are active');
    }
    
    // Add visual feedback that numbers are clickable
    setTimeout(() => {
        if (window.innerWidth <= 768) {
            // Show a brief message that numbers are clickable
            const message = document.createElement('div');
            message.innerHTML = '📱 Tap or click the numbered marks on the brain!';
            message.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 15px 20px;
                border-radius: 10px;
                font-size: 14px;
                z-index: 1000;
                text-align: center;
                backdrop-filter: blur(10px);
            `;
            document.body.appendChild(message);
            
            // Remove message after 3 seconds
            setTimeout(() => {
                if (message.parentNode) {
                    message.parentNode.removeChild(message);
                }
            }, 3000);
        }
    }, 2000);
}

function onMouseMove(event) {
    if (isLoading) return;
    
    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update the picking ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Calculate objects intersecting the picking ray
    const intersects = raycaster.intersectObjects(clickableObjects);
    
    // Change cursor based on hover
    if (intersects.length > 0) {
        document.body.style.cursor = 'pointer';
        
        // Don't disable controls on mobile - let both work together
        const isMobile = window.innerWidth <= 768;
        if (!isMobile) {
            // Temporarily disable controls when hovering over numbers on desktop
            controls.enabled = false;
        }
    } else {
        document.body.style.cursor = 'default';
        // Re-enable controls when not hovering over numbers
        controls.enabled = true;
    }
}

function onMouseClick(event) {
    if (isLoading) return;
    
    // Handle both mouse and touch events
    let clientX, clientY;
    
    if (event.type === 'touchend' && event.changedTouches && event.changedTouches.length > 0) {
        // Touch event
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
    } else {
        // Mouse event
        clientX = event.clientX;
        clientY = event.clientY;
    }
    
    // Calculate mouse position in normalized device coordinates
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    
    // Update the picking ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Calculate objects intersecting the picking ray
    const intersects = raycaster.intersectObjects(clickableObjects);
    
    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        const partNumber = clickedObject.userData.partNumber;
        
        if (partNumber) {
            console.log('Clicked on part:', partNumber);
            showBrainPartInfo(partNumber);
            
            // Add visual feedback for mobile
            if (window.innerWidth <= 768) {
                // Add a brief highlight effect
                const originalColor = clickedObject.material.color.getHex();
                clickedObject.material.color.setHex(0xff0000);
                setTimeout(() => {
                    clickedObject.material.color.setHex(originalColor);
                }, 200);
            }
            
            // Prevent default behavior and stop propagation
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return false;
        }
    }
    
    // If no number was clicked, let the controls handle the click
}

function showBrainPartInfo(partNumber) {
    // Brain part information
    const brainPartInfo = {
        1: {
            name: "Frontal Lobe",
            description: "The frontal lobe is responsible for executive functions, decision-making, problem-solving, and motor control. It's the largest lobe and controls personality, behavior, and emotions."
        },
        2: {
            name: "Parietal Lobe", 
            description: "The parietal lobe processes sensory information, spatial awareness, and language comprehension. It helps you understand where your body is in space and integrates sensory input."
        },
        3: {
            name: "Temporal Lobe",
            description: "The temporal lobe is crucial for memory formation, language processing, and auditory perception. It contains the hippocampus, which is essential for learning and memory."
        },
        4: {
            name: "Occipital Lobe",
            description: "The occipital lobe is the visual processing center of the brain. It interprets visual information from the eyes and helps you recognize shapes, colors, and movement."
        },
        5: {
            name: "Cerebellum",
            description: "The cerebellum coordinates voluntary movements, balance, and posture. It's often called the 'little brain' and is essential for motor learning and fine motor control."
        },
        6: {
            name: "Brain Stem",
            description: "The brain stem controls vital functions like breathing, heart rate, and blood pressure. It connects the brain to the spinal cord and regulates consciousness and sleep."
        }
    };
    
    const info = brainPartInfo[partNumber];
    if (info) {
        // Update info panel
        document.getElementById('part-title').textContent = `${partNumber}. ${info.name}`;
        document.getElementById('part-description').textContent = info.description;
        
        // Highlight the brain part
        highlightBrainPart(partNumber);
        
        // Highlight the clicked number
        highlightNumberLabel(partNumber);
    }
}

function highlightNumberLabel(partNumber) {
    // Reset all number labels
    numberLabels.forEach(label => {
        label.sphere.material.color.setHex(0xffff00); // Bright yellow
        label.sphere.material.emissive.setHex(0xffff00);
    });
    
    // Highlight the selected number
    const selectedLabel = numberLabels.find(label => label.partNumber === partNumber);
    if (selectedLabel) {
        selectedLabel.sphere.material.color.setHex(0xff0000); // Bright red when selected
        selectedLabel.sphere.material.emissive.setHex(0xff0000);
    }
}

function setupBrainPartInteractions() {
    // This function is now handled by addNumberLabelsOnBrain and onMouseClick
}

function highlightBrainPart(partNumber) {
    if (!brainModel) return;
    
    // Reset previous highlights
    resetHighlights();
    
    // Define realistic highlighting colors for each part
    const highlightColors = {
        1: 0xff8a80, // Light red for Frontal Lobe
        2: 0xffab91, // Light orange for Parietal Lobe
        3: 0xffcc80, // Light yellow for Temporal Lobe
        4: 0xffe082, // Light amber for Occipital Lobe
        5: 0xf8bbd9, // Light pink for Cerebellum
        6: 0xe1bee7  // Light purple for Brain Stem
    };
    
    const highlightColor = highlightColors[partNumber];
    if (!highlightColor) return;
    
    // Create realistic highlight material
    const highlightMaterial = new THREE.MeshPhongMaterial({
        color: highlightColor,
        emissive: highlightColor,
        emissiveIntensity: 0.2,
        shininess: 15, // Low shininess for organic look
        roughness: 0.7, // High roughness for realistic texture
        transparent: true,
        opacity: 0.9
    });
    
    // Apply highlighting based on part number
    brainModel.traverse(function(child) {
        if (child.isMesh) {
            // Simple highlighting based on mesh names or positions
            // This is a simplified approach - in a real application, you'd have more specific mesh identification
            let shouldHighlight = false;
            
            switch(partNumber) {
                case '1': // Frontal Lobe - front part of brain
                    shouldHighlight = child.position.z > 0;
                    break;
                case '2': // Parietal Lobe - top part
                    shouldHighlight = child.position.y > 0;
                    break;
                case '3': // Temporal Lobe - side parts
                    shouldHighlight = Math.abs(child.position.x) > 0.5;
                    break;
                case '4': // Occipital Lobe - back part
                    shouldHighlight = child.position.z < -0.5;
                    break;
                case '5': // Cerebellum - bottom part
                    shouldHighlight = child.position.y < -0.5;
                    break;
                case '6': // Brain Stem - very bottom
                    shouldHighlight = child.position.y < -1;
                    break;
            }
            
            if (shouldHighlight) {
                child.material = highlightMaterial;
                child.userData.isHighlighted = true;
            }
        }
    });
    
    currentHighlightedPart = partNumber;
}

function resetHighlights() {
    if (!brainModel) return;
    
    brainModel.traverse(function(child) {
        if (child.isMesh && child.userData.isHighlighted) {
            child.material = child.userData.originalMaterial;
            child.userData.isHighlighted = false;
        }
    });
    
    currentHighlightedPart = null;
}

function resetNumberLabels() {
    numberLabels.forEach(label => {
        label.sphere.material.color.setHex(0xffff00); // Bright yellow
        label.sphere.material.emissive.setHex(0xffff00);
    });
}

function onWindowResize() {
    // Update camera aspect ratio
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    // Update renderer size
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Update pixel ratio for performance on different devices
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function setupTouchControls() {
    // Touch event handling for mobile devices
    let isDragging = false;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let hasMoved = false;
    
    // Touch start
    document.addEventListener('touchstart', (event) => {
        if (event.touches.length === 1) {
            isDragging = true;
            hasMoved = false;
            touchStartTime = Date.now();
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
            lastTouchX = touchStartX;
            lastTouchY = touchStartY;
        }
    }, { passive: true });
    
    // Touch move
    document.addEventListener('touchmove', (event) => {
        if (isDragging && event.touches.length === 1) {
            const touchX = event.touches[0].clientX;
            const touchY = event.touches[0].clientY;
            
            const deltaX = touchX - lastTouchX;
            const deltaY = touchY - lastTouchY;
            
            // Check if touch has moved significantly
            const moveDistance = Math.sqrt(
                Math.pow(touchX - touchStartX, 2) + 
                Math.pow(touchY - touchStartY, 2)
            );
            
            if (moveDistance > 10) {
                hasMoved = true;
            }
            
            // Only rotate if moved significantly and controls are enabled
            if (hasMoved && controls && controls.enabled) {
                controls.azimuthAngle -= deltaX * 0.005; // Reduced sensitivity
                controls.polarAngle += deltaY * 0.005;   // Reduced sensitivity
                controls.update();
            }
            
            lastTouchX = touchX;
            lastTouchY = touchY;
        }
    }, { passive: true });
    
    // Touch end - handle click detection
    document.addEventListener('touchend', (event) => {
        if (isDragging && event.touches.length === 0) {
            const touchDuration = Date.now() - touchStartTime;
            const moveDistance = Math.sqrt(
                Math.pow(lastTouchX - touchStartX, 2) + 
                Math.pow(lastTouchY - touchStartY, 2)
            );
            
            // If it's a quick tap with minimal movement, treat as click
            if (touchDuration < 300 && moveDistance < 15 && !hasMoved) {
                // Convert touch coordinates to mouse coordinates
                const touch = event.changedTouches[0];
                
                // Create a more detailed mouse event
                const mouseEvent = new MouseEvent('click', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    screenX: touch.screenX,
                    screenY: touch.screenY,
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                
                // Dispatch click event to canvas
                const canvas = document.getElementById('brainCanvas');
                canvas.dispatchEvent(mouseEvent);
                
                // Also try direct click handling
                setTimeout(() => {
                    onMouseClick(mouseEvent);
                }, 10);
            }
            
            isDragging = false;
            hasMoved = false;
        }
    }, { passive: true });
    
    // Pinch to zoom
    let initialDistance = 0;
    let initialZoom = 0;
    
    document.addEventListener('touchstart', (event) => {
        if (event.touches.length === 2) {
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            initialDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            initialZoom = camera.position.z;
        }
    }, { passive: true });
    
    document.addEventListener('touchmove', (event) => {
        if (event.touches.length === 2) {
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            const currentDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            const scale = currentDistance / initialDistance;
            let newZoom = initialZoom * scale;
            
            // Limit zoom range
            newZoom = Math.max(5, Math.min(50, newZoom));
            camera.position.z = newZoom;
        }
    }, { passive: true });
}

function animate() {
    requestAnimationFrame(animate);
    
    // Update controls
    controls.update();
    
    // Animate number labels to make them more visible
    numberLabels.forEach(label => {
        if (label.pulseAnimation) {
            label.pulseAnimation();
        }
        
        // Make numbers scale with distance to keep them visible
        const distance = camera.position.distanceTo(label.sphere.position);
        const scaleFactor = Math.max(0.5, Math.min(3.0, distance * 0.1));
        label.sprite.scale.set(1.5 * scaleFactor, 1.5 * scaleFactor, 1);
        
        // Make sprites always face the camera
        label.sprite.lookAt(camera.position);
    });
    
    // Render the scene
    renderer.render(scene, camera);
}

// Keyboard shortcuts for Blender-like experience
document.addEventListener('keydown', function(event) {
    switch(event.key.toLowerCase()) {
        case 'r':
            // Reset camera position
            if (brainModel) {
                const box = new THREE.Box3().setFromObject(brainModel);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = camera.fov * (Math.PI / 180);
                let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                cameraZ *= 1.5;
                camera.position.set(0, 0, cameraZ);
                controls.minDistance = maxDim * 0.5;
                controls.maxDistance = maxDim * 10;
            } else {
                camera.position.set(0, 0, 15);
            }
            controls.target.set(0, 0, 0);
            controls.update();
            break;
        case 'a':
            // Toggle auto-rotate
            controls.autoRotate = !controls.autoRotate;
            break;
        case 'h':
            // Reset highlights
            resetHighlights();
            resetNumberLabels();
            document.getElementById('part-title').textContent = 'Select a Brain Part';
            document.getElementById('part-description').textContent = 'Click on any numbered mark on the brain to learn about different brain regions and their functions.';
            break;
        case 'f':
            // Focus on model
            if (brainModel) {
                const box = new THREE.Box3().setFromObject(brainModel);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = camera.fov * (Math.PI / 180);
                let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                cameraZ *= 1.5; // Add margin for better view
                
                camera.position.set(0, 0, cameraZ);
                controls.target.copy(center);
                controls.minDistance = maxDim * 0.5;
                controls.maxDistance = maxDim * 10;
                controls.update();
            }
            break;
    }
});

// Initialize the application
init();