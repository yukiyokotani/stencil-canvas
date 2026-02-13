import { computeStencil, type StencilOptions } from "./stencil";

interface WorkerInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  options: StencilOptions;
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { data, width, height, options } = e.data;
  const pixels = computeStencil({ data, width, height }, options);
  postMessage(pixels, { transfer: [pixels.buffer] });
};
