/**
 * リソグラフ効果のコアロジック
 *
 * 画像を複数のスポットカラーに色分解し、
 * ハーフトーン処理を施して合成する。
 */

import { hexToRgb, luminance, type RGB } from "./color";
import { applyHalftone } from "./halftone";

export interface RisographColor {
  /** 色の名前 */
  name: string;
  /** hex カラーコード (#RRGGBB) */
  color: string;
  /** ハーフトーンスクリーン角度（度）。省略時は自動割当 */
  angle?: number;
}

export interface RisographOptions {
  /** スポットカラーの配列 */
  colors: RisographColor[];
  /** ハーフトーンのドットサイズ (px) */
  dotSize: number;
  /** 版ずれのピクセル量 */
  misregistration: number;
  /** グレイン（ノイズ）の強度 0-1 */
  grain: number;
}

/** 色ごとのデフォルトスクリーン角度 */
const DEFAULT_ANGLES = [15, 75, 0, 45, 30, 60, 90, 105];

/**
 * ソース画像データから各色チャンネルの濃度マップを生成する。
 * 各ピクセルの輝度を反転（暗い部分＝インクが濃い）して濃度とする。
 */
function extractDensityMap(
  imageData: ImageData,
  _color: RGB,
  _colorIndex: number,
  _totalColors: number
): Float32Array {
  const { data, width, height } = imageData;
  const map = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3] / 255;

    // 輝度を反転して濃度に（暗い＝濃い）
    const lum = luminance(r, g, b) / 255;
    map[i] = (1 - lum) * a;
  }

  return map;
}

/**
 * メインのリソグラフ処理。
 * ソースの ImageData を受け取り、リソグラフ風に加工した ImageData を返す。
 */
export function processRisograph(
  sourceData: ImageData,
  canvas: HTMLCanvasElement,
  options: RisographOptions
): void {
  const { colors, dotSize, misregistration, grain } = options;
  const { width, height } = sourceData;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;

  // 背景を白（紙の色）で塗りつぶし
  ctx.fillStyle = "#f5f0e8";
  ctx.fillRect(0, 0, width, height);

  // 各色レイヤーを処理
  for (let ci = 0; ci < colors.length; ci++) {
    const colorDef = colors[ci];
    const rgb = hexToRgb(colorDef.color);
    const angle = colorDef.angle ?? DEFAULT_ANGLES[ci % DEFAULT_ANGLES.length];

    // 濃度マップの抽出
    const densityMap = extractDensityMap(sourceData, rgb, ci, colors.length);

    // ハーフトーンの適用
    const halftoneMap = applyHalftone(densityMap, width, height, {
      dotSize,
      angle,
    });

    // このレイヤー用のオフスクリーンキャンバスを作成
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = width;
    layerCanvas.height = height;
    const layerCtx = layerCanvas.getContext("2d")!;
    const layerData = layerCtx.createImageData(width, height);

    for (let i = 0; i < width * height; i++) {
      const offset = i * 4;
      let opacity = halftoneMap[i];

      // グレインノイズの追加
      if (grain > 0) {
        const noise = (Math.random() - 0.5) * grain;
        opacity = Math.max(0, Math.min(1, opacity + noise));
      }

      layerData.data[offset] = rgb.r;
      layerData.data[offset + 1] = rgb.g;
      layerData.data[offset + 2] = rgb.b;
      layerData.data[offset + 3] = Math.round(opacity * 255);
    }

    layerCtx.putImageData(layerData, 0, 0);

    // 版ずれ（misregistration）オフセット
    const offsetX =
      misregistration > 0
        ? (Math.random() - 0.5) * 2 * misregistration
        : 0;
    const offsetY =
      misregistration > 0
        ? (Math.random() - 0.5) * 2 * misregistration
        : 0;

    // multiply ブレンドで合成
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(layerCanvas, offsetX, offsetY);
  }

  // 合成モードをリセット
  ctx.globalCompositeOperation = "source-over";
}

/**
 * 画像を読み込んで ImageData を取得する
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * HTMLImageElement から ImageData を取得する
 */
export function getImageData(
  img: HTMLImageElement,
  width?: number,
  height?: number
): ImageData {
  const w = width ?? img.naturalWidth;
  const h = height ?? img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
