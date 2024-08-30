import { type MutableRefObject } from "react";
import { Scene, WebGLRenderer, WebGL1Renderer, Raycaster } from "three";
import { type Material, type BufferGeometry } from "three";

/**
 * Cleanup three.js scene and renderer, removing all objects, materials and geometries
 */
export const cleanUp = (scene: Scene, renderer: WebGLRenderer) => {
  scene.traverse(function (object) {
    if ("isMesh" in object || "isSprite" in object || "isLine" in object) {
      if ("material" in object) (object.material as Material).dispose();
      if ("geometry" in object) (object.geometry as BufferGeometry).dispose();
    }
  });
  renderer.dispose();
};

/**
 * Scene setup
 */
export const setupScene = (info: {
  mountRef: MutableRefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  sortObjects: boolean;
  color: number;
  colorAlpha: number;
  width2height: number;
}) => {
  const scene = new Scene();
  const raycaster = new Raycaster();
  let renderer: WebGL1Renderer | WebGLRenderer | undefined;
  try {
    renderer = new WebGLRenderer();
  } catch (error) {
    console.error("Error creating WebGLRenderer, falling back to WebGL1Renderer");
    console.error(error);
    try {
      renderer = new WebGL1Renderer();
    } catch (error) {
      console.error("Error creating WebGL1Renderer, falling back to CanvasRenderer");
      console.error(error);
    }
  }

  if (renderer) {
    renderer.setSize(info.width, info.height);
    renderer.setClearColor(info.color, info.colorAlpha);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = false;
    renderer.sortObjects = info.sortObjects;
  }

  // Window size listener
  function handleResize() {
    if (info.mountRef.current) {
      const width = info.mountRef.current.getBoundingClientRect().width;
      const height = width * info.width2height;
      renderer?.setSize(width, height);
    }
  }
  window.addEventListener("resize", handleResize);

  // Return info
  return { scene, renderer, raycaster, handleResize };
};
