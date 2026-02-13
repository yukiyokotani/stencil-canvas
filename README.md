# Stencil Canvas

Multi-color stencil print simulator built with React + TypeScript + Canvas API.

**Demo:** https://yukiyokotani.github.io/stencil-canvas/

## Features

- Upload any image to apply stencil-style processing
- Choose from 60+ ink colors
- Adjustable halftone dot size, misregistration (plate offset), and grain noise
- NNLS-based color decomposition for accurate multi-color separation
- Subtractive color mixing via multiply blending
- Preset color combinations (Classic, Warm, Cool, Fluorescent, etc.)
- Download processed image as PNG
- Dark mode support
- Fully client-side — no images are uploaded to any server

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## License

MIT &copy; yukiyokotani
