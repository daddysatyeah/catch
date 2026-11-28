import { useEffect, useRef, useState, type RefObject } from 'react'

export type CorePhase = 'idle' | 'pending'
const density = 1300
const goldenAngle = Math.PI * (3 - Math.sqrt(5))

export function PrivacyCore({ phase, artwork }: { phase: CorePhase; artwork: RefObject<HTMLCanvasElement | null> }) {
  const motion = useRef(phase)
  const aim = useRef({ x: 0, y: 0 })
  const [drawn, setDrawn] = useState(false)
  useEffect(() => { motion.current = phase }, [phase])
  useEffect(() => {
    const canvas = artwork.current
    const context = canvas?.getContext('2d', { alpha: true })
    if (!canvas || !context) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4
    const count = lowPower ? 860 : density
    const points = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + .5)) / count
      const ring = Math.sqrt(1 - y * y)
      points[i * 3] = Math.cos(i * goldenAngle) * ring
      points[i * 3 + 1] = y
      points[i * 3 + 2] = Math.sin(i * goldenAngle) * ring
    }
    const palette = ['#a7b9cb61', '#a1b9cf83', '#8faec7a2', '#80a8c6b6', '#619dc4c7', '#518ab8e0', '#3079a9', '#17638e', '#10456b']
    let width = 0, height = 0, px = 0, py = 0, compact = 0, frame = 0, last = 0, time = 0, onScreen = true
    let first = true
    const staticMode = () => reduced.matches || document.documentElement.dataset.reduce === 'true'

    function paint(timestamp: number) {
      frame = 0
      if (document.hidden || !onScreen || !width || !height) return
      const still = staticMode()
      const delta = last ? Math.min((timestamp - last) / 1000, .033) : 0
      last = timestamp
      if (!still) {
        time += delta
        const follow = 1 - Math.exp(-delta * 5.2)
        px += (aim.current.x - px) * follow
        py += (aim.current.y - py) * follow
        compact += ((motion.current === 'pending' ? 1 : 0) - compact) * follow
      }
      const radius = Math.min(width, height) * .318 * (1 - compact * .13)
      const cx = width / 2, cy = height / 2
      context!.clearRect(0, 0, width, height)
      context!.lineWidth = .65
      context!.beginPath()
      context!.ellipse(cx, cy + 2, radius * 1.24, radius * .28, -.33 + px * .06, 0, Math.PI * 2)
      context!.strokeStyle = '#83b5d04e'
      context!.stroke()
      context!.beginPath()
      context!.ellipse(cx, cy, radius * 1.154, radius * .73, .57, 0, Math.PI * 2)
      context!.strokeStyle = '#a5bed12f'
      context!.stroke()

      const angle = time * .19 - .31 + px * .53
      const pitch = .21 - py * .39
      const a = Math.cos(angle), b = Math.sin(angle), c = Math.cos(pitch), d = Math.sin(pitch)
      const buckets = palette.map(() => new Path2D())
      for (let i = 0; i < count; i++) {
        const x0 = points[i * 3], y0 = points[i * 3 + 1], z0 = points[i * 3 + 2]
        const x = x0 * a + z0 * b
        const tilt = -x0 * b + z0 * a
        const y = y0 * c - tilt * d
        const z = y0 * d + tilt * c
        const energy = !still && motion.current === 'pending' ? .031 * Math.max(0, (compact - .45) / .55) * Math.sin(y * 14 - time * 7) : 0
        const swell = 1 + (still ? 0 : .019 * Math.sin(x0 * 8 + y0 * 5 + time * 1.8) + .021 * (px * x - py * y) + energy)
        const lens = (4.3 / (4.3 - z)) * radius * swell
        const depth = (z + 1) * .5
        const size = (.54 + depth * 1.29) * Math.min(1.42, radius / 119)
        const path = buckets[Math.max(0, Math.min(palette.length - 1, Math.floor(depth * palette.length)))]
        const left = cx + x * lens, top = cy + y * lens
        path.moveTo(left + size, top)
        path.arc(left, top, size, 0, Math.PI * 2)
      }
      buckets.forEach((path, index) => { context!.fillStyle = palette[index]; context!.fill(path) })
      if (first) { first = false; setDrawn(true) }
      if (!still) frame = requestAnimationFrame(paint)
    }

    function restart() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0; last = 0
      if (!document.hidden && onScreen) frame = requestAnimationFrame(paint)
    }
    function sizeCanvas() {
      const rect = canvas!.getBoundingClientRect()
      width = rect.width; height = rect.height
      const scale = Math.min(devicePixelRatio || 1, lowPower ? 1.2 : 1.65)
      canvas!.width = Math.round(width * scale)
      canvas!.height = Math.round(height * scale)
      context!.setTransform(scale, 0, 0, scale, 0, 0)
      restart()
    }
    const resize = new ResizeObserver(sizeCanvas)
    const visible = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; restart() })
    resize.observe(canvas); visible.observe(canvas)
    reduced.addEventListener('change', restart)
    const preferences = new MutationObserver(restart)
    preferences.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduce'] })
    document.addEventListener('visibilitychange', restart)
    sizeCanvas()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      resize.disconnect(); visible.disconnect(); preferences.disconnect()
      reduced.removeEventListener('change', restart)
      document.removeEventListener('visibilitychange', restart)
    }
  }, [artwork])

  return <div className="privacy-core" data-drawn={drawn} aria-hidden="true" onPointerMove={event => {
    const bounds = event.currentTarget.getBoundingClientRect()
    aim.current = { x: (event.clientX - bounds.left) / bounds.width * 2 - 1, y: (event.clientY - bounds.top) / bounds.height * 2 - 1 }
  }} onPointerLeave={() => { aim.current = { x: 0, y: 0 } }} onPointerUp={event => {
    if (event.pointerType !== 'mouse') aim.current = { x: 0, y: 0 }
  }} onPointerCancel={() => { aim.current = { x: 0, y: 0 } }}>
    <canvas ref={artwork}/>
  </div>
}
