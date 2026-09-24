/** A quiet press, with no overshoot or idle motion. Scale around the fingertip
 * (0, 0), never translate it: click targets stay exact at any render rate. */
export function handPressAt(age: number) {
  const amount = Number.isFinite(age) && age >= 0 && age < 0.28
    ? Math.sin(Math.PI * age / 0.28) ** 2
    : 0
  return { scaleX: 1 + 0.025 * amount, scaleY: 1 - 0.08 * amount }
}
