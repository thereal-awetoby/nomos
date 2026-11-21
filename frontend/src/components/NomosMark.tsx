// The Nomos mark from the app icon: a five-by-five pixel N over a green bar.
const PIXELS: [number, number][] = [
  [0, 0], [4, 0],
  [0, 1], [1, 1], [4, 1],
  [0, 2], [2, 2], [4, 2],
  [0, 3], [3, 3], [4, 3],
  [0, 4], [4, 4],
]

export default function NomosMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 5 6" shapeRendering="crispEdges" aria-hidden="true">
      {PIXELS.map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />)}
      <rect x="0" y="5.55" width="5" height="0.45" fill="#0ac18e" />
    </svg>
  )
}
