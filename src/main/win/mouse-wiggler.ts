// Linux edition: the self test cannot move the real pointer here, so the
// wiggler is inert and the test relies on whatever movement happens.

export function mouseWiggler(): () => void {
  return () => {}
}
