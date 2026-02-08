export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** hex文字列 (#RRGGBB) を RGB オブジェクトに変換 */
export function hexToRgb(hex: string): RGB {
  const cleaned = hex.replace("#", "");
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

/** RGB を hex 文字列に変換 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** ITU-R BT.709 輝度計算 (0-255) */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 2色の multiply ブレンド (各チャンネル 0-255) */
export function multiplyBlend(a: RGB, b: RGB): RGB {
  return {
    r: (a.r * b.r) / 255,
    g: (a.g * b.g) / 255,
    b: (a.b * b.b) / 255,
  };
}
