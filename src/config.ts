// Parâmetros centrais do rodagem.run. Ajuste aqui antes de mexer no resto do código.

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** bits por segundo do H.264 — satélite tem muito detalhe, então não economize demais */
  bitrate: 8_000_000,
} as const;

/**
 * Duração do vídeo pela distância: base + k·√km, com piso e teto.
 * Cresce devagar (dobrar a distância não dobra o vídeo): 3 km ≈ 16 s, 10 km ≈ 20 s, 42 km ≈ 30 s.
 * (base 11 s = 10 s originais + 1 s de fechamento para ler o cartão de dados)
 */
export const DURATION = {
  baseSec: 11,
  perSqrtKmSec: 3,
  minSec: 12,
  maxSec: 35,
} as const;

export function videoDurationSec(distanceMeters: number): number {
  const sec = DURATION.baseSec + DURATION.perSqrtKmSec * Math.sqrt(Math.max(0, distanceMeters) / 1000);
  return Math.min(DURATION.maxSec, Math.max(DURATION.minSec, sec));
}

/** Divisão do vídeo: abertura e fechamento fixos; a corrida ocupa o resto. */
export const TIMELINE = {
  introSec: 2,
  outroSec: 5,
  /** parte do fechamento usada para a câmera afastar; o resto fica parado na visão geral */
  outroMoveSec: 2.6,
} as const;

/**
 * Cartão com os números da corrida no fechamento. Fica acima dos 20% de baixo da tela,
 * que o Reels/Stories cobrem com legenda e botões.
 */
export const END_CARD = {
  /** fração da altura onde o cartão termina (embaixo) */
  bottomFraction: 0.8,
  /** fração da altura reservada a partir de onde o cartão pode começar; o zoom-out final enquadra o trajeto acima disso */
  topFraction: 0.52,
  /** segundos depois do início do fechamento */
  appearAtSec: 0.5,
  appearDurSec: 0.6,
  /** tempo da contagem dos números até o valor final */
  countDurSec: 1.3,
} as const;

/** Marca "rodagem.run" no canto superior esquerdo, durante o vídeo todo. */
export const WATERMARK = {
  /** alinhada à margem do cartão de dados */
  x: 56,
  /** abaixo dos ~14% de cima, onde o Stories mostra as barrinhas e o nome do perfil */
  topFraction: 0.145,
  sizePx: 38,
  opacity: 0.8,
} as const;

/** O mapa é renderizado em CSS px e multiplicado por este fator para chegar em 1080×1920. */
export const MAP_PIXEL_RATIO = 2;
export const MAP_CSS_WIDTH = VIDEO.width / MAP_PIXEL_RATIO;
export const MAP_CSS_HEIGHT = VIDEO.height / MAP_PIXEL_RATIO;

/** Câmera de ângulo fixo: orientação do eixo maior do trajeto, segue o corredor sem girar. */
export const CAMERA = {
  pitch: 60,
  /** suavização do centro da câmera (desvio-padrão em segundos de vídeo) */
  centerSmoothSec: 0.9,
  /** velocidade desejada do chão na tela, em larguras de tela por segundo — define o zoom automático */
  screenWidthsPerSec: 0.28,
  minZoom: 11.5,
  maxZoom: 16.8,
  /** abertura: começa mais alto e menos inclinado, e desce até a câmera de corrida */
  introZoomDelta: -1.6,
  introPitch: 25,
  introBearingDelta: -35,
  /** fechamento: visão geral do trajeto inteiro */
  outroPitch: 40,
  /** margem de segurança (fração da tela) ao enquadrar o trajeto inteiro */
  // em cima, deixa livre a faixa da marca d'água (WATERMARK)
  outroPadding: { top: 0.2, bottom: 1 - END_CARD.topFraction + 0.02, side: 0.1 },
  /** desloca o ponto seguido para baixo do centro (fração da altura) — mostra mais do caminho à frente */
  followOffsetY: 0.06,
} as const;

export const STYLE = {
  routeColor: '#ff5a1f',
  routeCasing: '#ffffff',
  routeWidth: 6,
  runnerColor: '#ff5a1f',
  runnerShade: '#c73c0c',
  runnerOutline: '#ffffff',
  /** altura do bonequinho no vídeo final, em px */
  runnerHeightPx: 150,
  /** passadas por segundo de vídeo (independe da distância) */
  strideHz: 2.4,
  pillBg: 'rgba(14, 18, 28, 0.88)',
  pillText: '#ffffff',
  font: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

/** Pré-carregamento: lista os tiles da câmera a cada N quadros e baixa todos em paralelo. */
export const PRELOAD_EVERY_N_FRAMES = 2;
