var container;
var scene, camera, renderer, controls, stats, raycaster;
var sphere, mesh, material;

var radius = 270;

var hq = false;
var _panoLoader = new GSVPANO.PanoLoader({ zoom: hq ? 3 : 1 });
var _depthLoader = new GSVPANO.PanoDepthLoader();

var drawPoints = false;

const WIDTH = 512 / 4;
const HEIGHT = 256 / 4;

// need to unload these with renderer.deallocateTexture(texture);
var panoramas = [];
var depthMaps = [];
var info = [];

var markers = [];

var currentLoaded = 0;
var currentSphere = 0;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
};

assert = function (cond, text) {
    console.assert(cond, text);
    return cond;
};

function hasVR() {
    return ('getVRDisplays' in navigator);
}

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, radius * 3);
    
    controls = new THREE.PointerLockControls(camera);
    scene.add(controls.getObject());

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    
    stats = new Stats();
    container.appendChild(stats.dom);
    
    raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0));

    // Hardcoded width/height since we always get the same sized depth map, assert in updating geo
    // Using a place since it is easy to make and has the UVs I am looking for
    sphere = new THREE.PlaneGeometry(50, 50, WIDTH - 1, HEIGHT - 1);
    material = new THREE.MeshPhongMaterial({ side: THREE.DoubleSide });
    
    mesh = new THREE.Mesh(
        sphere,
        material
    );
    
    // Rotate the mesh (since I don't math)
    mesh.rotation.x = (Math.PI / 2);
    scene.add(mesh);
    
    var light = new THREE.AmbientLight(0xffffff);
    scene.add(light);
    
    var origin = new THREE.Mesh(
        new THREE.SphereGeometry(5, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0x555555 })
    );
    origin.position.y = -256;
    scene.add(origin);
    
    if (hasVR()) {
        document.body.appendChild(WEBVR.createButton(renderer));
        renderer.vr.enabled = true;
    }
    
    controls.enabled = true;
    document.addEventListener('click', function (event) {
        // Ask the browser to lock the pointer
        document.body.requestPointerLock();
    }, false);
    
    window.addEventListener('resize', onWindowResize, false);
    document.onkeydown = checkKey;
    
    initListeners();

    loadIndex(currentLoaded);
}

function initListeners() {

    _panoLoader.onPanoramaLoad = function () {
        // Start loading depth map immediately
        _depthLoader.load(this.panoId);

        // cache the lat/long
        info[this.panoId] = {
            "lat": this.lat,
            "lng": this.lng,
            "rot": this.rotation
        };

        // Connect the image to the Texture
        var texture = new THREE.Texture();

        // cache the texture
        panoramas[this.panoId] = texture;

        var image = new Image();
        image.onload = function () {
            texture.image = image;
            texture.minFilter = THREE.LinearFilter;
            texture.needsUpdate = true;
        };

        image.src = this.canvas.toDataURL();
    };


    _depthLoader.onDepthLoad = function () {
        // cache the depth map
        depthMaps[this.depthMap.panoId] = this.depthMap;

        if (currentLoaded < road.length - 1) {
            if (currentLoaded == 0) {
                // Start rendering
                animate();

                // show 1st sphere
                updateSphere(getId(currentSphere));

                // hide the loading message
                document.getElementById("loading").style.display = "none";
            }

            currentLoaded++;
            document.getElementById("progress").style.width = ((currentLoaded / (road.length - 1)) * 100) + "%";
            loadIndex(currentLoaded);
        } else {
            if (!assert(Object.keys(panoramas).length == Object.keys(depthMaps).length, { "message": "panoramas and depthMaps have different lengths",
                "panoramas.length": Object.keys(panoramas).length, "depthMaps.length": Object.keys(depthMaps).length })) return;
            
            // update markers after everything has loaded
            updateMarkers();

            // Hide loading message
            document.getElementById("progress").style.display = "none";
        }
    };
}

function getId(index) {
    if (!assert(index < Object.keys(panoramas).length, { "message": "index greater than panoramas.length", "index": index,
        "panoramas.length": Object.keys(panoramas).length })) return;
    if (!assert(index < Object.keys(depthMaps).length, { "message": "index greater than deptMaths.length", "index": index,
        "depthMaps.length": Object.keys(depthMaps).length })) return;
        
    return Object.keys(depthMaps)[index];
}

function updateSphere(panoId) {
    if (!assert(panoramas[panoId] !== undefined, { "message": "panorama not defined for given panoId", "panoId": panoId })) return;
    if (!assert(depthMaps[panoId] !== undefined, { "message": "depth map not defined for given panoId", "panoId": panoId })) return;

    this.depthMap = depthMaps[panoId];

    var w = this.depthMap.width;
    var h = this.depthMap.height;
    
    w /= 4;
    h /= 4;
    
    if (!assert(w === WIDTH, { "message": "width not equal " + WIDTH, "w": w })) return;
    if (!assert(h === HEIGHT, { "message": "height not eqaul " + HEIGHT, "h": h })) return;

    for (var y = 0; y < h; ++y) {
        for (var x = 0; x < w; ++x) {
            c = this.depthMap.depthMap[y * w + x] / 50 * 255;
            c = clamp(c, 0, 256);

            var xnormalize = (w - x - 1) / (w - 1);
            var ynormalize = (h - y - 1) / (h - 1);
            var theta = xnormalize * (2 * Math.PI);
            var phi = ynormalize * Math.PI;

            var tmpX = c * Math.sin(phi) * Math.cos(theta);
            var tmpY = c * Math.sin(phi) * Math.sin(theta);
            var tmpZ = c * Math.cos(phi);

            sphere.vertices[y * w + x].set(tmpX, tmpY, tmpZ);
        }
    }
    
    mesh.geometry.verticesNeedUpdate = true;

    material.map = panoramas[panoId];
    material.needsUpdate = true;
    material.map.needsUpdate = true;

    // careful since this one is made every time this is called
    if (drawPoints) {
        var points = new THREE.Points(
            sphere,
            new THREE.PointsMaterial()
        );

        // Rotate the mesh (since I don't math)
        points.rotation.x = (Math.PI / 2);
        scene.add(points);
    }

    // See if the ray from the camera into the world hits one of our meshes
    var intersects = raycaster.intersectObject(mesh);
    // Toggle rotation bool for meshes that we clicked
    if (intersects.length > 0) {
        camera.position.y = (radius * 0.7) + intersects[0].point.y;
        camera.updateProjectionMatrix();
    }


    // update markers
    updateMarkers();

    // material.wireframe = true;
    // material.wireframeLinewidth = 5;
}

function updateMarkers() {
    if (markers.length == 0 || markers.length != Object.keys(info).length) {
        for (var i = 0; i < markers.length; i++) {
            renderer.dispose(markers[i]);
        }

        markers = [];

        var size = 8;
        var marker = new THREE.BoxGeometry(size, size, size);
        var material = new THREE.MeshPhongMaterial( {side: THREE.DoubleSide} );

        for (var i = 0; i < Object.keys(info).length; i++) {
            var mesh = new THREE.Mesh(marker, material);
            markers[i] = mesh;
            scene.add(mesh);
        }
    }

    var baseLat = info[getId(currentSphere)].lat;
    var baseLng = info[getId(currentSphere)].lng;
    for (var i = 0; i < markers.length; i++) {
        var markerLat = info[getId(i)].lat;
        var markerLng = info[getId(i)].lng;

        var length = measure(baseLat, baseLng, markerLat, markerLng);
        
        var diffLat = baseLat - markerLat;
        var diffLng = baseLng - markerLng;
        
        tmpVec.set(diffLat, diffLng, 0).normalize();

        console.log("measure: " + length);

        markers[i].position.x = length * tmpVec.x;
        markers[i].position.z = length * tmpVec.y;

        console.log("x: " + markers[i].position.x + ", z: " + markers[i].position.z);
    }
}

function measure(lat1, lon1, lat2, lon2) {  // generally used geo measurement function
    var R = 6378.137; // Radius of earth in KM
    var dLat = lat2 * Math.PI / 180 - lat1 * Math.PI / 180;
    var dLon = lon2 * Math.PI / 180 - lon1 * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d * 1000; // meters
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.animate(render);
}

function render() {
    stats.update();
    renderer.render(scene, camera);
}

function loadIndex(i) {
    var lat = road[i].latitude;
    var long = road[i].longitude;

    _panoLoader.load(new google.maps.LatLng(lat, long));
}


init();