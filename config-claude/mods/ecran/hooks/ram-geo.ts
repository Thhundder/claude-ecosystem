export type Zone = [number, boolean] | null

export function zone(fractions: readonly number[], cols: number, rangs: number) {
  const rx = cols / 2 - 0.5
  const ry = rangs
  const ep = Math.max(2, Math.round(rangs / 3))
  const bornes: number[] = []
  let cumul = 0
  for (const f of fractions) bornes.push((cumul += f))
  const part = (dx: number, dy: number) => {
    let a = Math.atan2(dy, dx) / (2 * Math.PI) + 0.25
    if (a < 0) a += 1
    const i = bornes.findIndex(b => a < b)
    return i < 0 ? fractions.length - 1 : i
  }
  return (x: number, y: number): Zone => {
    const dx = (x - cols / 2) / rx
    const dessus = (y - ry) / ry
    if (dx * dx + dessus * dessus <= 1) return [part(dx, dessus), false]
    if (y <= ry) return null
    for (let e = 1; e <= ep; e++) {
      const dy = (y - e - ry) / ry
      if (dx * dx + dy * dy <= 1) return [part(dx, dy), true]
    }
    return null
  }
}

export const hauteurRond = (rangs: number) => Math.ceil((2 * rangs + Math.max(2, Math.round(rangs / 3))) / 2) + 1

export function camembert(fractions: readonly number[], cols: number, rangs: number) {
  const z = zone(fractions, cols, rangs)
  return Array.from({ length: hauteurRond(rangs) }, (_, r) =>
    Array.from({ length: cols }, (_, x) => [z(x + 0.5, 2 * r + 0.5), z(x + 0.5, 2 * r + 1.5)] as const),
  )
}

export const assombrir = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * 0.55))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
}
