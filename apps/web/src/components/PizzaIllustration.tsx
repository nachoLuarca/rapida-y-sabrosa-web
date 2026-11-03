interface PizzaIllustrationProps {
  className?: string
}

const pepperoni = [
  [148, 122],
  [252, 128],
  [112, 210],
  [205, 196],
  [292, 222],
  [160, 286],
  [250, 290],
]

const olives = [
  [196, 112],
  [290, 170],
  [138, 168],
  [208, 256],
  [110, 258],
  [300, 278],
]

const basil = [
  [178, 160, -30],
  [248, 182, 40],
  [150, 236, 120],
  [262, 248, -70],
  [208, 318, 10],
]

/** Ilustración propia de una pizza, decorativa, mientras el local no entregue fotos. */
export function PizzaIllustration({ className }: PizzaIllustrationProps) {
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden="true" focusable="false">
      {/* Borde de la masa */}
      <circle cx="200" cy="200" r="194" fill="#c9792c" />
      <circle cx="200" cy="200" r="184" fill="#e9a446" />
      <circle cx="200" cy="200" r="168" fill="#f3c06a" />
      {/* Salsa */}
      <circle cx="200" cy="200" r="160" fill="#d9141b" />
      {/* Queso derretido */}
      <path
        fill="#ffc72c"
        d="M352.0 200.0 Q360.0 218.5 356.0 235.6 Q349.4 251.4 331.5 263.3 Q333.4 284.8 325.1 299.8 Q312.3 311.2 291.0 314.1 Q284.7 337.0 272.0 349.6 Q254.3 351.6 232.5 342.3 Q216.9 357.1 200.0 360.0 Q183.1 357.1 167.5 342.3 Q147.0 348.9 130.6 344.2 Q114.7 336.6 105.2 318.8 Q85.8 313.5 74.9 299.8 Q66.6 284.8 68.5 263.3 Q50.6 251.4 44.0 235.6 Q43.0 218.5 54.0 200.0 Q40.1 180.8 38.2 163.1 Q47.6 147.9 68.5 136.7 Q66.6 115.2 74.9 100.2 Q87.7 88.8 109.0 85.9 Q116.6 65.8 130.6 55.8 Q146.4 48.2 166.2 51.8 Q182.4 39.9 200.0 40.0 Q216.9 42.9 232.5 57.7 Q253.0 51.1 269.4 55.8 Q283.4 65.8 291.0 85.9 Q314.7 87.0 329.8 96.5 Q335.7 113.3 331.5 136.7 Q349.4 148.6 356.0 164.4 Q360.0 181.5 352.0 200.0Z"
      />
      <circle cx="200" cy="200" r="118" fill="#ffd75e" opacity="0.6" />
      {pepperoni.map(([cx, cy]) => (
        <g key={`p-${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="26" fill="#a00e13" />
          <circle cx={cx} cy={cy} r="21" fill="#c2181f" />
          <circle cx={cx - 7} cy={cy - 6} r="3" fill="#7d0b0f" />
          <circle cx={cx + 8} cy={cy + 2} r="2.5" fill="#7d0b0f" />
          <circle cx={cx - 1} cy={cy + 9} r="2" fill="#7d0b0f" />
        </g>
      ))}
      {olives.map(([cx, cy]) => (
        <circle key={`o-${cx}-${cy}`} cx={cx} cy={cy} r="8" fill="none" stroke="#1c1917" strokeWidth="6" />
      ))}
      {basil.map(([x, y, angle]) => (
        <path
          key={`b-${x}-${y}`}
          d="M-14 0 Q0 -11 14 0 Q0 11 -14 0Z"
          fill="#2f7d32"
          transform={`translate(${x} ${y}) rotate(${angle})`}
        />
      ))}
      {/* Cortes de la pizza */}
      <g stroke="#c9792c" strokeWidth="3" strokeLinecap="round" opacity="0.55">
        <line x1="200" y1="16" x2="200" y2="384" />
        <line x1="16" y1="200" x2="384" y2="200" />
        <line x1="70" y1="70" x2="330" y2="330" />
        <line x1="330" y1="70" x2="70" y2="330" />
      </g>
    </svg>
  )
}
