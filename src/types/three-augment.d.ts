import "three";

declare module "three" {
  interface WebGLRenderer {
    physicallyCorrectLights?: boolean;
  }
}
