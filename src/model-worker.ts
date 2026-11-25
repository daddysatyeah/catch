import { env, LogLevel, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import ortModule from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url'
import { cachedAsset, embeddingAssets, embeddingModel, embeddingRevision } from './model-assets'

function absolute(url: string) {
  return new URL(url, self.location.href).href
}

env.allowLocalModels = false
env.allowRemoteModels = true
env.remotePathTemplate = '{model}/resolve/' + embeddingRevision + '/'
env.useBrowserCache = false
env.useWasmCache = false
env.logLevel = LogLevel.ERROR
env.fetch = async input => {
  const asset = embeddingAssets.find(candidate => candidate.url === String(input))
  return (asset && await cachedAsset(asset)) || new Response(null, { status: 404 })
}
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1
  env.backends.onnx.wasm.proxy = false
  env.backends.onnx.wasm.wasmPaths = { mjs: absolute(ortModule), wasm: absolute(ortWasm) }
}

let model: Promise<FeatureExtractionPipeline> | undefined
function encoder() {
  model ??= pipeline('feature-extraction', embeddingModel, { revision: embeddingRevision, dtype: 'q8', device: 'wasm' })
    .catch(error => {
      model = undefined
      // This stage loads only fixed public model artifacts, before it receives capture text.
      console.warn('Catch model initialization:', error instanceof Error ? error.message : 'unknown error')
      throw error
    })
  return model
}

let queue = Promise.resolve()
self.addEventListener('message', event => {
  const { id, text } = event.data as { id: number; text?: string[] }
  queue = queue.then(async () => {
    try {
      const ready = await encoder()
      if (!text) { self.postMessage({ id }); return }
      const output = await ready(text, { pooling: 'mean', normalize: true })
      try {
        const vectors = output.tolist() as number[][]
        self.postMessage({ id, vectors })
      } finally { output.dispose() }
    } catch { self.postMessage({ id, error: 'Local embedding could not run. Check the model installation and retry.' }) }
  })
})
