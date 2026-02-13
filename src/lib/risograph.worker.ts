import { computeRisograph, type RisographOptions } from "./risograph";

interface WorkerInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  options: RisographOptions;
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { data, width, height, options } = e.data;
  const pixels = computeRisograph({ data, width, height }, options);
  postMessage(pixels, { transfer: [pixels.buffer] });
};
