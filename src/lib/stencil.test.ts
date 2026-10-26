import { describe, expect, it } from "vitest";
import { densityCurve } from "./halftone";
import { buildToneLut, INVERT_CURVES } from "./curve";
import { rgbToLab, hexToRgb, luminance } from "./color";
import {
  buildLightnessTable,
  coverageForLightness,
  forwardBlackPoint,
  highlightRolloff,
  computeInkDensities,
  type ImageDataLike,
  type StencilOptions,
} from "./stencil";

const CREAM = { r: 245, g: 240, b: 232 };
const BLACK_PAPER = { r: 26, g: 26, b: 26 };

/** 描画パラメータの既定値（分解だけ見たいので網点系は固定） */
function options(overrides: Partial<StencilOptions> = {}): StencilOptions {
  return {
    colors: [
      { name: "Fl. Pink", color: "#F0409A" },
      { name: "Mid Blue", color: "#3255A4" },
    ],
    dotSize: 3,
    misregistration: 0,
    grain: 0,
    density: 1,
    inkOpacity: 0.85,
    paperColor: "#f5f0e8",
    halftoneMode: "am",
    separation: 0,
    blackGeneration: 0.7,
    highlightCutoff: 0,
    noise: 0,
    transparentBg: false,
    renderScale: 1,
    paperTexture: "none",
    paperTextureAmount: 0,
    ...overrides,
  };
}

const WARM_TRIO = [
  { name: "Green", color: "#4BA663" },
  { name: "Pink", color: "#EB57AD" },
  { name: "Orange", color: "#ED7542" },
];
const TRICOLOR = [
  { name: "Blue", color: "#0078BF" },
  { name: "Bright Red", color: "#E93A28" },
  { name: "Yellow", color: "#FFE800" },
];

/** 色相を 1° 刻みで一周する 360x1 の入力（彩度・明度は一定） */
function hueRamp(): ImageDataLike {
  const data = new Uint8ClampedArray(360 * 4);
  const s = 0.8;
  const l = 0.55;
  const a = s * Math.min(l, 1 - l);
  for (let h = 0; h < 360; h++) {
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    };
    data.set([f(0), f(8), f(4), 255], h * 4);
  }
  return { data, width: 360, height: 1 };
}

/** 3x1 の固定入力（暖色の肌 / 中間グレー / ほぼ黒） */
function fixture(): ImageDataLike {
  const data = new Uint8ClampedArray([
    232, 178, 142, 255,
    128, 128, 128, 255,
    20, 18, 24, 255,
  ]);
  return { data, width: 3, height: 1 };
}

describe("densityCurve", () => {
  it("density=1 は恒等（既存の出力を変えない）", () => {
    for (const d of [0, 0.13, 0.5, 0.87, 1]) {
      expect(densityCurve(d, 1)).toBeCloseTo(d, 12);
    }
  });

  it("density<1 は一律スケール", () => {
    expect(densityCurve(0.4, 0.5)).toBeCloseTo(0.2, 12);
    expect(densityCurve(1, 0.5)).toBeCloseTo(0.5, 12);
  });

  it("density>1 は単調増加で 0/1 を保ち、天井に張り付かない", () => {
    expect(densityCurve(0, 1.8)).toBe(0);
    expect(densityCurve(1, 1.8)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = densityCurve(i / 20, 1.8);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    // 一律スケールならクリップされる領域が、漸近して区別を保つ
    expect(densityCurve(0.75, 1.8)).toBeLessThan(1);
    expect(densityCurve(0.9, 1.8)).toBeLessThan(1);
    expect(densityCurve(0.9, 1.8)).toBeGreaterThan(densityCurve(0.75, 1.8));
  });

  it("薄い側は従来の一律スケールとほぼ同じ濃さ（白っぽくならない）", () => {
    for (const d of [0.05, 0.1, 0.2]) {
      expect(densityCurve(d, 1.5)).toBeCloseTo(Math.min(d * 1.5, 1), 1);
    }
  });
});

describe("highlightRolloff", () => {
  it("cutoff=0 は何もしない", () => {
    for (const d of [0, 0.05, 0.5, 1]) {
      expect(highlightRolloff(d, 0)).toBe(d);
    }
  });

  it("薄い階調を 0 に切り捨てず、小さい値として残す", () => {
    // 従来は d <= cutoff を一律 0 にしていた（点が丸ごと消えていた）
    for (const d of [0.05, 0.15, 0.29]) {
      const v = highlightRolloff(d, 0.3);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(d); // ハイライトは飛ぶ（薄くなる）
    }
  });

  it("薄いほど強く絞られる（単調で、順序が保たれる）", () => {
    let prev = -1;
    for (let i = 0; i <= 40; i++) {
      const v = highlightRolloff(i / 40, 0.3);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // 相対的な減り方は薄い側ほど大きい
    const faint = highlightRolloff(0.05, 0.3) / 0.05;
    const mid = highlightRolloff(0.25, 0.3) / 0.25;
    expect(faint).toBeLessThan(mid);
  });

  it("cutoff の 2 倍以上では従来の式と一致する", () => {
    const cutoff = 0.3;
    for (const d of [0.6, 0.8, 1]) {
      expect(highlightRolloff(d, cutoff)).toBeCloseTo((d - cutoff) / (1 - cutoff), 12);
    }
  });

  it("0 と 1 の端は保たれる", () => {
    expect(highlightRolloff(0, 0.3)).toBe(0);
    expect(highlightRolloff(1, 0.3)).toBeCloseTo(1, 12);
  });
});

describe("coverageForLightness", () => {
  it("紙より暗いインク（クリーム紙×黒）は明度を下げるほど被覆が増える", () => {
    const table = buildLightnessTable({ r: 0, g: 0, b: 0 }, CREAM, 0.85);
    expect(coverageForLightness(table, 95)).toBeCloseTo(0, 2);
    const mid = coverageForLightness(table, 50);
    const dark = coverageForLightness(table, 20);
    expect(mid).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(mid);
  });

  it("紙より明るいインク（黒紙×黄）でも被覆が出る（暗い紙で消えない）", () => {
    const table = buildLightnessTable({ r: 255, g: 232, b: 0 }, BLACK_PAPER, 0.85);
    // 表は増加向き。明るい目標ほどインクが必要。
    expect(table[table.length - 1]).toBeGreaterThan(table[0]);
    const dim = coverageForLightness(table, 20);
    const bright = coverageForLightness(table, 75);
    expect(dim).toBeGreaterThan(0);
    expect(bright).toBeGreaterThan(dim);
  });

  it("届かない明度は 0 / 1 に収まる", () => {
    const table = buildLightnessTable({ r: 0, g: 0, b: 0 }, CREAM, 0.85);
    expect(coverageForLightness(table, 200)).toBe(0);
    expect(coverageForLightness(table, -50)).toBe(1);
  });
});

describe("forwardBlackPoint", () => {
  it("白っぽい紙では、全インクの重ねと同じ輝度の紙より暗いグレーを返す", () => {
    const k = forwardBlackPoint(WARM_TRIO.map((c) => hexToRgb(c.color)), CREAM, 0.85);
    expect(k).not.toBeNull();
    expect(k!).toBeGreaterThan(0);
    expect(k!).toBeLessThan(232 / 255);
  });

  it("暗い紙に明るいインク（重ねても紙より暗くならない）では補償しない", () => {
    const inks = [{ r: 255, g: 232, b: 0 }, { r: 240, g: 240, b: 240 }];
    expect(forwardBlackPoint(inks, BLACK_PAPER, 0.85)).toBeNull();
  });
});

describe("computeInkDensities", () => {
  it("2色 Natural は暗部で両インクを使い、密度は 0..1 に収まる", () => {
    const { densityMaps, inkRgbs } = computeInkDensities(fixture(), options());
    expect(densityMaps).toHaveLength(2);
    expect(inkRgbs).toHaveLength(2);
    for (const map of densityMaps) {
      for (const v of map) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    // 3 画素目（ほぼ黒）は 2 色の重ねで作る
    expect(densityMaps[0][2]).toBeGreaterThan(0.5);
    expect(densityMaps[1][2]).toBeGreaterThan(0.5);
  });

  it("3色 Natural も黒を全インクの重ねで作る（1 色だけ薄い暗部にならない）", () => {
    const { densityMaps } = computeInkDensities(
      fixture(),
      options({ colors: WARM_TRIO })
    );
    for (const map of densityMaps) {
      expect(map[2]).toBeGreaterThan(0.3);
    }
  });

  it("全インクの重ねより暗い色も潰さず、暗さの順に階調が残る（黒点補償）", () => {
    // 黒 / 濃いグレー / 中間グレー
    const wedge: ImageDataLike = {
      data: new Uint8ClampedArray([0, 0, 0, 255, 30, 30, 30, 255, 70, 70, 70, 255]),
      width: 3,
      height: 1,
    };
    for (const colors of [options().colors, WARM_TRIO]) {
      const { densityMaps } = computeInkDensities(wedge, options({ colors }));
      const total = (p: number) => densityMaps.reduce((sum, map) => sum + map[p], 0);
      expect(total(0) - total(1)).toBeGreaterThan(0.1);
      expect(total(1) - total(2)).toBeGreaterThan(0.1);
    }
  });

  it("3色でも色相の連続した変化で密度が跳ばない（ハードな色境界が出ない）", () => {
    const ramp = hueRamp();
    for (const colors of [WARM_TRIO, TRICOLOR]) {
      const { densityMaps } = computeInkDensities(ramp, options({ colors }));
      for (const map of densityMaps) {
        for (let i = 1; i < map.length; i++) {
          expect(Math.abs(map[i] - map[i - 1])).toBeLessThan(0.15);
        }
      }
    }
  });

  it("単色はインク色によらず輝度のモノクローム（暗いほど濃い）", () => {
    for (const color of ["#000000", "#E93A28", "#0078BF"]) {
      const { densityMaps } = computeInkDensities(
        fixture(),
        options({ colors: [{ name: "solo", color }] })
      );
      const [light, mid, dark] = densityMaps[0];
      expect(light).toBeLessThan(mid);
      expect(mid).toBeLessThan(dark);
    }
  });

  it("スクリーン角度は暗い順に 45/75/… を割り当てる", () => {
    const { angles } = computeInkDensities(
      fixture(),
      options({
        colors: [
          { name: "Yellow", color: "#FFE800" },
          { name: "Black", color: "#000000" },
        ],
      })
    );
    // 黒（暗い）が 45°、黄が 75°
    expect(angles[1]).toBe(45);
    expect(angles[0]).toBe(75);
  });

  it("反転カーブは明暗を入れ替える（旧 invert 相当）", () => {
    const normal = computeInkDensities(
      fixture(),
      options({ colors: [{ name: "k", color: "#000000" }] })
    );
    const inverted = computeInkDensities(
      fixture(),
      options({
        colors: [{ name: "k", color: "#000000" }],
        toneLut: buildToneLut(INVERT_CURVES),
      })
    );
    expect(normal.densityMaps[0][0]).toBeLessThan(normal.densityMaps[0][2]);
    expect(inverted.densityMaps[0][0]).toBeGreaterThan(inverted.densityMaps[0][2]);
  });
});

describe("color helpers", () => {
  it("hexToRgb", () => {
    expect(hexToRgb("#F0409A")).toEqual({ r: 240, g: 64, b: 154 });
  });

  it("rgbToLab の基準値", () => {
    const [wl, wa, wb] = rgbToLab(255, 255, 255);
    expect(wl).toBeCloseTo(100, 3);
    expect(wa).toBeCloseTo(0, 3);
    expect(wb).toBeCloseTo(0, 3);
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 6);
  });

  it("luminance は緑に最も重みを置く", () => {
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(255, 0, 0));
    expect(luminance(255, 0, 0)).toBeGreaterThan(luminance(0, 0, 255));
  });
});
