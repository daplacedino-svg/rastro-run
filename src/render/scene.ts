import type { CameraPath } from '../map/camera';
import { applyPose } from '../map/camera';
import { renderNow, type RastroMap } from '../map/create-map';
import type { Route } from '../track/route';
import type { Compositor } from './compositor';

/** Tudo o que é preciso para desenhar qualquer quadro do vídeo. */
export interface Scene {
  rmap: RastroMap;
  route: Route;
  path: CameraPath;
  compositor: Compositor;
}

/** Posiciona mapa e trajeto no quadro `i` (sem desenhar). */
export function setFrame(scene: Scene, i: number): void {
  const pose = scene.path.frames[i];
  scene.rmap.setProgress(pose.progress);
  applyPose(scene.rmap.map, pose);
}

/** Desenha o quadro `i` completo, esperando todos os tiles. Usado na exportação. */
export async function renderFrameExact(scene: Scene, i: number): Promise<void> {
  setFrame(scene, i);
  await renderNow(scene.rmap.map);
  scene.compositor.draw(scene.path, scene.route, i);
}

/** Desenha o quadro `i` com o que já estiver carregado (tempo real). */
export function renderFrameFast(scene: Scene, i: number): void {
  setFrame(scene, i);
  scene.rmap.map.redraw();
  scene.compositor.draw(scene.path, scene.route, i);
}
