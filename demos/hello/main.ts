/**
 * hello — Phase 0 smoke demo. Proves the toolchain (Vite dev server, synthesized
 * demo pages, TS strict mode, three.js) end to end. Nothing mathematical here;
 * delete this demo when the first real one lands.
 */

import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7f5f0);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

const light = new THREE.DirectionalLight(0xffffff, 2.5);
light.position.set(3, 4, 5);
scene.add(light, new THREE.AmbientLight(0xffffff, 0.6));

const icosahedron = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.2),
  new THREE.MeshStandardMaterial({ color: 0x4477aa, flatShading: true }),
);
scene.add(icosahedron);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop((time) => {
  icosahedron.rotation.set(time / 3100, time / 1900, 0);
  renderer.render(scene, camera);
});
