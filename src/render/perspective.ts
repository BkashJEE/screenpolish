// A single projective texture, instead of axis-switching image strips. One
// offscreen GPU surface per destination keeps preview and export independent.
import type { Rect } from '../shared/layout'
import { FOCAL_FACTOR, type Ctx2D } from './tilt'

/** Homogeneous clip coordinates preserve perspective-correct UV interpolation. */
export function perspectiveVertices(rect: Rect, tiltX: number, tiltY: number, width: number, height: number): Float32Array {
  const ay = tiltX * Math.PI / 180
  const ax = tiltY * Math.PI / 180
  const f = Math.max(rect.width, rect.height) * FOCAL_FACTOR
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const values: number[] = []
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = (u - 0.5) * rect.width
    const y = (v - 0.5) * rect.height
    // Match projectCard's projection, including its historical rotation convention.
    const w = 1 + (x * Math.sin(ay) + y * Math.sin(ax)) / f
    values.push(2 * (cx * w + x * Math.cos(ay)) / width - w,
      w - 2 * (cy * w + y * Math.cos(ax)) / height, w, u, v)
  }
  return new Float32Array(values)
}

interface Surface {
  canvas: OffscreenCanvas
  gl: WebGLRenderingContext
  program: WebGLProgram
  buffer: WebGLBuffer
  texture: WebGLTexture
}
const surfaces = new WeakMap<object, Surface | null>()

function createSurface(): Surface | null {
  if (typeof OffscreenCanvas === 'undefined') return null
  const canvas = new OffscreenCanvas(1, 1)
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true })
  if (!gl) return null
  const shaders: WebGLShader[] = []
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  const texture = gl.createTexture()
  if (!program || !buffer || !texture) {
    gl.deleteProgram(program)
    gl.deleteBuffer(buffer)
    gl.deleteTexture(texture)
    return null
  }
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, 'attribute vec3 position; attribute vec2 uv; varying vec2 tex; void main(){gl_Position=vec4(position.xy,0.0,position.z);tex=uv;}'],
      [gl.FRAGMENT_SHADER, 'precision highp float; varying vec2 tex; uniform sampler2D image; void main(){gl_FragColor=texture2D(image,tex);}']
    ] as const) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('shader unavailable')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader compilation failed')
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('shader link failed')
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    const position = gl.getAttribLocation(program, 'position')
    const uv = gl.getAttribLocation(program, 'uv')
    gl.enableVertexAttribArray(position)
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0)
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 20, 12)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    return { canvas, gl, program, buffer, texture }
  } catch {
    gl.deleteProgram(program)
    gl.deleteBuffer(buffer)
    gl.deleteTexture(texture)
    return null
  } finally {
    for (const shader of shaders) gl.deleteShader(shader)
  }
}

/** False means the caller should use its deterministic Canvas2D fallback. */
export function drawPerspective(ctx: Ctx2D, source: OffscreenCanvas, rect: Rect, tiltX: number, tiltY: number): boolean {
  let surface = surfaces.get(ctx)
  if (surface === undefined) {
    surface = createSurface()
    surfaces.set(ctx, surface)
  }
  if (!surface) return false
  const { canvas, gl } = surface
  if (gl.isContextLost()) return false
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  gl.viewport(0, 0, width, height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.bufferData(gl.ARRAY_BUFFER, perspectiveVertices(rect, tiltX, tiltY, width, height), gl.DYNAMIC_DRAW)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  if (gl.getError() !== gl.NO_ERROR) return false
  ctx.drawImage(canvas, 0, 0)
  return true
}
