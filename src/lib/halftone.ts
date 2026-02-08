/**
 * ハーフトーン（網点）パターン生成
 *
 * 指定された角度でドットパターンを生成し、
 * 濃度マップに基づいてドットサイズを変化させる。
 */

export interface HalftoneOptions {
  /** ドットの基本サイズ (px) */
  dotSize: number;
  /** スクリーン角度 (度) */
  angle: number;
}

/**
 * 濃度値 (0-1) をハーフトーンのドット有無に変換する。
 * 指定角度で回転したグリッド上の位置から、
 * そのピクセルがドット内に含まれるかを判定する。
 *
 * @returns 0-1 の値（ドットの不透明度）
 */
export function halftoneAt(
  x: number,
  y: number,
  density: number,
  options: HalftoneOptions
): number {
  const { dotSize, angle } = options;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // 回転座標系に変換
  const rx = x * cos + y * sin;
  const ry = -x * sin + y * cos;

  // グリッドセル内での相対位置 (-0.5 ~ 0.5)
  const cellX = (rx / dotSize) % 1;
  const cellY = (ry / dotSize) % 1;
  const cx = cellX - Math.round(cellX);
  const cy = cellY - Math.round(cellY);

  // セル中心からの距離（0 ~ ~0.707）
  const dist = Math.sqrt(cx * cx + cy * cy);

  // 濃度に応じたドット半径（最大 0.5 = セル半分）
  const radius = Math.sqrt(density) * 0.5;

  // ドットの縁をわずかにアンチエイリアス
  const edge = 0.5 / dotSize;
  if (dist < radius - edge) return 1;
  if (dist > radius + edge) return 0;
  return 1 - (dist - (radius - edge)) / (2 * edge);
}

/**
 * ImageData の濃度マップにハーフトーンを適用し、
 * 結果の不透明度配列 (Float32Array, 0-1) を返す。
 */
export function applyHalftone(
  densityMap: Float32Array,
  width: number,
  height: number,
  options: HalftoneOptions
): Float32Array {
  const result = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const density = densityMap[i];
      result[i] = halftoneAt(x, y, density, options);
    }
  }
  return result;
}
