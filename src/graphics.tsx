import { useId, type ReactNode } from 'react'

const paths = {
  inbox: <><path d="M4 5h16l2 9v5H2v-5l2-9Z"/><path d="M2 14h6l1.5 2h5l1.5-2h6"/></>,
  pin: <><path d="m15 3 6 6-3 1-3 3v4l-2 2-8-8 2-2h4l3-3 1-3Z"/><path d="m9 15-6 6"/></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M9 3h6l.6 2.4 2.2 1.3 2.4-.7 2 3.5-1.7 1.8v2l1.7 1.8-2 3.5-2.4-.7-2.2 1.3L15 21H9l-.6-2.4-2.2-1.3-2.4.7-2-3.5 1.7-1.8v-2L1.8 9.5l2-3.5 2.4.7 2.2-1.3L9 3Z"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.2"/><path d="m16 16 4 4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
  text: <path d="M4 6h16M4 10h16M4 14h12M4 18h8"/>,
  link: <><path d="m10 14 4-4m-6-2 2-2a5 5 0 0 1 7 7l-2 2m1 1-2 2a5 5 0 0 1-7-7l2-2" transform="rotate(-10 12 12)"/></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9" r="1.3"/><path d="m4 16 4-3 3 2 4-4 5 5"/></>,
  file: <><path d="M6 3h8l4 4v14H6Zm8 0v5h4M9 12h6m-6 4h6"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  down: <path d="m6 9 6 6 6-6"/>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
  external: <path d="M13 4h7v7m0-7-9 9m7 0v7H4V6h7"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  clipboard: <><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H5v16h14V5h-3m-7 7h6m-6 4h6"/></>,
  upload: <path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>,
  download: <path d="M12 4v12m-5-5 5 5 5-5M4 17v3h16v-3"/>,
  trash: <path d="M4 6h16m-10-3h4m4 3-1 15H7L6 6m4 4v7m4-7v7"/>,
  check: <path d="m5 12 5 5L20 7"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19m0-14-1.5 1.5m-11 11L5 19"/></>,
  moon: <path d="M20.5 14a8.7 8.7 0 0 1-10.5-10.5A8.8 8.8 0 1 0 20.5 14Z"/>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  edit: <><path d="m15 5 4 4M4 20l4-.8L20 7l-3-3L5 16Z"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
  sort: <path d="M5 7h14M7 12h10m-7 5h4"/>,
  play: <path d="m9 5 11 7-11 7Z"/>,
  review: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.5 2.5L16 9"/></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/></>,
  history: <><path d="M4 10a8 8 0 1 1 2 8M4 4v6h6m2-3v5l3 2"/></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths
export const assetUrl = (name: string) => import.meta.env.BASE_URL + name

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

const matrix = [
  '01110 01110 11111 01110 10001',
  '10001 10001 00100 10001 10001',
  '10000 10001 00100 10000 10001',
  '10000 11111 00100 10000 11111',
  '10000 10001 00100 10000 10001',
  '10001 10001 00100 10001 10001',
  '01110 10001 00100 01110 10001',
]

export function Wordmark() {
  return <svg aria-hidden="true" viewBox="0 0 88 23" width="88" height="23" fill="currentColor">
    {matrix.flatMap((row, y) => [...row].map((cell, x) => cell === '1' && <circle key={x + ',' + y} cx={1.5 + x * 3} cy={2.5 + y * 3} r="1.13"/>))}
  </svg>
}

const field = Array.from({ length: 47 * 21 }, (_, i) => {
  const x = i % 47
  const y = Math.floor(i / 47)
  const dx = x - 23
  const dy = (y - 10) * 1.23
  const angle = Math.atan2(dy, dx)
  const distance = Math.hypot(dx, dy)
  const ripple = 8.1 + 2.25 * Math.sin(angle * 2 + 0.5) + 1.4 * Math.cos(angle * 3 - 0.4)
  const highlight = Math.abs(distance - ripple) < 2.5 || Math.abs(distance - ripple - 5.4) < 1.25
  if (highlight) return { x, y, radius: Math.abs(distance - ripple) < 1.2 ? 1.85 : 1.26, color: angle > 0.64 && angle < 2.36 ? '#f36543' : '#efeee9', opacity: 0.93 - distance * 0.014 }
}).filter(dot => dot !== undefined)

export function MatrixArt() {
  const pattern = useId()
  return <svg aria-hidden="true" className="matrix-art" viewBox="0 0 460 153" preserveAspectRatio="xMidYMid slice">
    <defs><pattern id={pattern} x="-5" y="0.5" width="10" height="9" patternUnits="userSpaceOnUse"><circle cx="5" cy="4.5" r=".58" fill="#efeee9" opacity=".13"/></pattern></defs>
    <rect width="460" height="153" fill="#20201f"/>
    <rect width="460" height="153" fill={`url(#${pattern})`}/>
    {field.map(({ x, y, radius, color, opacity }) => <circle key={x + ',' + y} cx={x * 10} cy={y * 9 - 13} r={radius} fill={color} opacity={opacity}/>)}
  </svg>
}

export function Aperture() {
  return <div className="aperture" aria-hidden="true">
    <div className="aperture-orbit"/>
    <div className="aperture-shadow"/>
    <img src={assetUrl('catch-aperture.webp')} width="800" height="738" alt="" draggable="false"/>
    <span className="reticle reticle-top"/><span className="reticle reticle-bottom"/>
  </div>
}
