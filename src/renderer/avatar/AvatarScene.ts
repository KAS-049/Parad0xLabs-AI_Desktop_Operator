import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { CharacterDisplaySettings } from "../../shared/contracts";

interface LoadResult {
  ok: boolean;
  error: string | null;
}

export class AvatarScene {
  private static readonly MAX_PRESENTATION_ROTATION = Math.PI * 0.42;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private readonly clock = new THREE.Clock();
  private readonly controls: OrbitControls;
  private avatar: VRM | null = null;
  private fbxAvatar: THREE.Group | null = null;
  private imageAvatar: THREE.Sprite | null = null;
  private fallback: THREE.Mesh;
  private mouthOpen = 0;
  private avatarError: string | null = null;
  private presentationRotationOffset = 0;
  private targetPresentationRotationOffset = 0;
  private pointerInside = false;
  private compactMode = true;

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.mount.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 1.15, 3.85);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.target.set(0, 1.05, 0);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222244, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(1.5, 2.5, 2.5);
    this.scene.add(key);

    this.fallback = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x7be0ff, emissive: 0x133040, metalness: 0.2, roughness: 0.25 })
    );
    this.fallback.position.y = 1.02;
    this.scene.add(this.fallback);

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.animate();
  }

  async loadCharacter(fileUrl: string | null, displaySettings?: CharacterDisplaySettings): Promise<LoadResult> {
    if (!fileUrl) {
      this.clearLoadedCharacter();
      this.fallback.visible = true;
      this.avatarError = null;
      return { ok: true, error: null };
    }

    this.clearLoadedCharacter();

    try {
      if (fileUrl.toLowerCase().endsWith(".fbx")) {
        const loader = new FBXLoader();
        const object = await loader.loadAsync(fileUrl);
        const wrapped = new THREE.Group();
        wrapped.add(object);
        this.normalizeDisplayModel(wrapped, displaySettings);
        this.frameDisplayModel(wrapped);
        this.fbxAvatar = wrapped;
        this.scene.add(wrapped);
        this.fallback.visible = false;
        this.avatarError = null;
        return { ok: true, error: null };
      }

      if (!fileUrl.toLowerCase().endsWith(".vrm")) {
        const texture = await new THREE.TextureLoader().loadAsync(fileUrl);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.55, 1.55, 1);
        sprite.position.set(0, 1.08, 0);
        this.resetDefaultCamera();
        this.imageAvatar = sprite;
        this.scene.add(sprite);
        this.fallback.visible = false;
        this.avatarError = null;
        return { ok: true, error: null };
      }

      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(fileUrl);
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm?.humanoid) {
        throw new Error("VRM is missing a humanoid rig.");
      }

      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.removeUnnecessaryJoints(gltf.scene);

      this.avatar = vrm;
      this.avatar.scene.rotation.y = Math.PI;
      this.frameDisplayModel(this.avatar.scene);
      this.scene.add(vrm.scene);
      this.fallback.visible = false;
      this.avatarError = null;
      return { ok: true, error: null };
    } catch (error) {
      this.avatarError = error instanceof Error ? error.message : "Could not load the avatar.";
      this.clearLoadedCharacter();
      this.fallback.visible = false;
      return { ok: false, error: this.avatarError };
    }
  }

  setMouthOpen(value: number) {
    this.mouthOpen = Math.min(1, Math.max(0, value));
  }

  setCompactMode(compact: boolean) {
    this.compactMode = compact;
    if (this.avatar) {
      this.frameDisplayModel(this.avatar.scene);
    } else if (this.fbxAvatar) {
      this.frameDisplayModel(this.fbxAvatar);
    } else if (this.imageAvatar) {
      this.resetDefaultCamera();
    } else {
      this.resetDefaultCamera();
    }
  }

  setPresentationPointer(active: boolean) {
    if (!this.fbxAvatar) {
      this.pointerInside = false;
      this.targetPresentationRotationOffset = 0;
      return;
    }

    if (!active) {
      this.pointerInside = false;
      this.targetPresentationRotationOffset = 0;
      return;
    }

    this.pointerInside = true;
  }

  nudgePresentationRotation(deltaX: number) {
    if (!this.fbxAvatar) {
      return;
    }

    this.pointerInside = true;
    this.targetPresentationRotationOffset += deltaX * 0.015;
  }

  setPresentationPointerHorizontal(normalizedX: number) {
    if (!this.fbxAvatar) {
      this.pointerInside = false;
      this.targetPresentationRotationOffset = 0;
      return;
    }

    this.pointerInside = true;
    const clamped = THREE.MathUtils.clamp(normalizedX, -1, 1);
    this.targetPresentationRotationOffset = clamped * AvatarScene.MAX_PRESENTATION_ROTATION;
  }

  getAvatarError() {
    return this.avatarError;
  }

  private resize() {
    const width = this.mount.clientWidth || 1;
    const height = this.mount.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    this.presentationRotationOffset = THREE.MathUtils.damp(
      this.presentationRotationOffset,
      this.targetPresentationRotationOffset,
      this.pointerInside ? 8 : 3.2,
      delta
    );

    if (this.avatar) {
      this.avatar.update(delta);
      const blendShape = this.avatar.expressionManager;
      if (blendShape) {
        blendShape.setValue("aa", this.mouthOpen);
      }
      this.avatar.scene.rotation.y = Math.PI + Math.sin(performance.now() / 3000) * 0.08;
      this.avatar.scene.position.y = Math.sin(performance.now() / 1800) * 0.03;
    } else if (this.fbxAvatar) {
      const baseRotationY = (this.fbxAvatar.userData.baseRotationY as number) ?? Math.PI;
      const baseY = (this.fbxAvatar.userData.baseY as number) ?? 0;
      const baseScale = (this.fbxAvatar.userData.baseScale as number) ?? 1;
      this.fbxAvatar.rotation.y = baseRotationY + this.presentationRotationOffset + Math.sin(performance.now() / 3200) * 0.05;
      this.fbxAvatar.position.y = baseY + Math.sin(performance.now() / 1800) * 0.03;
      const speakingScale = baseScale * (1 + this.mouthOpen * 0.03);
      this.fbxAvatar.scale.setScalar(speakingScale);
    } else if (this.imageAvatar) {
      this.imageAvatar.material.rotation = Math.sin(performance.now() / 2600) * 0.025;
      this.imageAvatar.scale.setScalar(1.55 + this.mouthOpen * 0.1 + Math.sin(performance.now() / 2100) * 0.03);
    } else {
      this.fallback.rotation.y += delta * 0.35;
      const idlePulse = Math.sin(performance.now() / 1700) * 0.04;
      this.fallback.scale.setScalar(1 + idlePulse);
      this.fallback.scale.y = 1 + idlePulse + this.mouthOpen * 0.08;
    }

    this.renderer.render(this.scene, this.camera);
  };

  private clearLoadedCharacter() {
    if (this.avatar) {
      this.scene.remove(this.avatar.scene);
      this.avatar = null;
    }

    if (this.fbxAvatar) {
      this.scene.remove(this.fbxAvatar);
      this.fbxAvatar.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else {
          material?.dispose?.();
        }
      });
      this.fbxAvatar = null;
    }

    this.presentationRotationOffset = 0;
    this.targetPresentationRotationOffset = 0;
    this.pointerInside = false;

    if (this.imageAvatar) {
      this.scene.remove(this.imageAvatar);
      this.imageAvatar.material.dispose();
      this.imageAvatar = null;
    }
  }

  private normalizeDisplayModel(group: THREE.Group, displaySettings?: CharacterDisplaySettings) {
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    if (size.lengthSq() === 0) {
      throw new Error("FBX model loaded but has no visible geometry.");
    }

    let meshCount = 0;
    group.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        meshCount += 1;
      }
    });
    if (meshCount === 0) {
      throw new Error("FBX model loaded but no mesh surfaces were found.");
    }

    group.position.sub(center);
    group.position.y -= box.min.y;

    const targetHeight = 2.1;
    const autoScale = targetHeight / Math.max(size.y, 0.001);
    const requestedScale = displaySettings?.scale;
    const requestedHeight = typeof requestedScale === "number" ? size.y * requestedScale : 0;
    const baseScale =
      typeof requestedScale === "number" &&
      Number.isFinite(requestedScale) &&
      requestedScale > 0 &&
      requestedHeight >= 0.5 &&
      requestedHeight <= 6
        ? requestedScale
        : autoScale;
    group.scale.setScalar(baseScale);
    const baseRotationY = displaySettings?.rotationY ?? Math.PI;
    group.rotation.y = baseRotationY;
    group.position.y += displaySettings?.yOffset ?? 0;
    group.userData.baseScale = baseScale;
    group.userData.baseRotationY = baseRotationY;
    group.userData.baseY = group.position.y;

    group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if ("castShadow" in mesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
  }

  private frameDisplayModel(object: THREE.Object3D) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitHeightDistance = maxDimension / (2 * Math.tan(fov / 2));
    const fitWidthDistance = fitHeightDistance / Math.max(this.camera.aspect, 0.65);
    const modeMultiplier = this.compactMode ? 1.45 : 1.35;
    const distance = Math.max(fitHeightDistance, fitWidthDistance) * modeMultiplier;

    this.controls.target.set(center.x, center.y + size.y * 0.08, center.z);
    const compactYOffset = this.compactMode ? size.y * 0.14 : size.y * 0.14;
    this.camera.position.set(center.x, center.y + compactYOffset, center.z + distance);
    this.camera.lookAt(this.controls.target);
  }

  private resetDefaultCamera() {
    this.controls.target.set(0, 1.05, 0);
    this.camera.position.set(0, 1.15, 3.85);
    this.camera.lookAt(this.controls.target);
  }
}
