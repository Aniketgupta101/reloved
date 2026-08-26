// Standalone worker process for background removal. Must NEVER require
// "sharp" — sharp's native libvips addon and @imgly/background-removal-node's
// onnxruntime-node addon segfault Node when loaded in the same process
// (confirmed: reproducible crash, not a usage bug). Runs as a short-lived
// child process instead, spawned from bgRemoval.ts, so the two never share
// memory space. Reads the input image path and writes the cutout PNG to the
// output path given on argv.

const fs = require("fs")
const { removeBackground } = require("@imgly/background-removal-node")

async function main() {
  const [, , inputPath, outputPath, mimeType] = process.argv
  if (!inputPath || !outputPath) {
    console.error("usage: bgRemovalWorker.cjs <inputPath> <outputPath> <mimeType>")
    process.exit(1)
  }

  const buffer = fs.readFileSync(inputPath)
  const blob = new Blob([buffer], { type: mimeType || "image/jpeg" })
  // "medium" — no dollar cost either way (this runs a local ONNX model, not
  // an API), so the tradeoff is pure speed vs. accuracy. "large" is
  // meaningfully slower for marginal quality gain at bulk-upload scale;
  // "small" (the library default) is visibly worse on real product photos.
  const model = process.env.BG_REMOVAL_MODEL || "medium"
  const result = await removeBackground(blob, { model })
  const out = Buffer.from(await result.arrayBuffer())
  fs.writeFileSync(outputPath, out)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
