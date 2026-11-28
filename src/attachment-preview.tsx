import { useEffect, useRef, useState } from 'react'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { rasterType } from './content'
import type { Attachment } from './model'

export const isPdf = (file: Attachment) => file.blob.type === 'application/pdf' || /\.pdf$/i.test(file.name)
export const canPreview = (file: Attachment) => rasterType.test(file.blob.type) || isPdf(file)

function PdfPreview({ file, className, width, alt }: { file: Attachment; className?: string; width: number; alt: string }) {
  const element = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'pending' | 'ready' | 'failed'>('pending')

  useEffect(() => {
    const canvas = element.current
    if (!canvas) return
    let stopped = false
    let dispose: (() => void) | undefined
    let cancelRender: (() => void) | undefined
    setState('pending')
    async function render(target: HTMLCanvasElement) {
      const [pdfjs, bytes] = await Promise.all([import('pdfjs-dist'), file.blob.arrayBuffer()])
      if (stopped) return
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(pdfWorker, location.href).href
      const task = pdfjs.getDocument({ data: bytes, useWorkerFetch: false, maxImageSize: 14_000_000, enableXfa: false })
      dispose = () => { void task.destroy().catch(() => undefined) }
      const pdf = await task.promise
      const page = await pdf.getPage(1)
      if (stopped) return
      const natural = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / Math.max(natural.width, natural.height * .62) })
      target.width = Math.max(1, Math.floor(viewport.width))
      target.height = Math.max(1, Math.floor(viewport.height))
      const painting = page.render({ canvas: target, viewport })
      cancelRender = () => painting.cancel()
      await painting.promise
      if (!stopped) setState('ready')
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      void render(canvas).catch(() => { if (!stopped) setState('failed') })
        .finally(() => { dispose?.(); dispose = undefined })
    }, { rootMargin: '60px' })
    observer.observe(canvas)
    return () => { stopped = true; observer.disconnect(); cancelRender?.(); dispose?.(); dispose = undefined }
  }, [file.blob, width])

  return <canvas ref={element} className={className} role={alt ? 'img' : undefined} aria-label={alt || undefined}
    aria-hidden={state !== 'ready' || !alt} data-preview-state={state}/>
}

export function AttachmentPreview({ file, className, width = 420, alt = '' }: { file: Attachment; className?: string; width?: number; alt?: string }) {
  const [url, setUrl] = useState('')
  const pdf = isPdf(file)
  useEffect(() => {
    if (pdf) return
    const source = URL.createObjectURL(file.blob)
    setUrl(source)
    return () => URL.revokeObjectURL(source)
  }, [file.blob, pdf])
  return pdf ? <PdfPreview file={file} className={className} width={width} alt={alt}/> :
    url && <img className={className} loading="lazy" decoding="async" alt={alt} src={url}/>
}
