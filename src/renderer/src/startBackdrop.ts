import { backdropState, type BackdropState } from "./startBackdropState";

export interface StartBackdrop {
  mode: "webgl" | "canvas" | "css";
  resize(width: number, height: number): void;
  draw(time: number): void;
  dispose(): void;
}
const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv;
uniform vec2 resolution;
uniform vec3 colorA,colorB;
uniform vec4 shape;
uniform vec3 motion;
void main(){
  float t=motion.x;
  vec2 p=(uv-.5)*vec2(resolution.x/resolution.y,1.)*3.4;
  float c=cos(motion.y),s=sin(motion.y);
  p=mat2(c,-s,s,c)*p*shape.x;
  vec2 q=p;
  for(int i=0;i<3;i++){
    float k=float(i);
    q+=shape.y*.24*sin(vec2(q.y*1.45+t*.24+k*1.8,q.x*1.6-t*.19+k*2.1));
  }
  float f=sin(q.x*shape.z+.45*sin(t*.31))*sin(q.y*shape.w)-sin(q.x*shape.w)*sin(q.y*shape.z+.4*cos(t*.23));
  float flow=sin(q.x*1.4+q.y*.6+t*.31)+cos(q.y*2.1-q.x*.4-t*.26);
  float band=exp(-abs(f)*4.4);
  float fringe=pow(.5+.5*cos(f*10.+flow*.8),16.);
  float hue=.5+.5*sin(flow*.85+t*.17);
  vec3 ink=mix(colorA,colorB,hue);
  vec3 col=mix(colorA,colorB,.5+.5*sin(flow))*.12;
  col+=ink*(band*.48+fringe*.11);
  col+=vec3(.72,.86,1.)*pow(band,7.)*.28;
  col*=.8+.2*cos(length(p)*.6);
  gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(.92)),1.);
}`;
const rgb = (c: number[], alpha = 1) =>
  `rgba(${c.map((v) => Math.round(v * 255)).join(",")},${alpha})`;

function canvasBackdrop(canvas: HTMLCanvasElement): StartBackdrop {
  const ctx = canvas.getContext("2d");
  let w = 1,
    h = 1;
  const css = (state: BackdropState) => {
    canvas.style.background = `radial-gradient(ellipse at ${50 + 30 * Math.sin(state.time * 0.13)}% ${50 + 30 * Math.cos(state.time * 0.16)}%,${rgb(state.a, 0.6)},transparent 80%),linear-gradient(${state.rotation * 100 + 120}deg,${rgb(state.b, 0.6)},#091322)`;
  };
  return {
    mode: ctx ? "canvas" : "css",
    resize(width, height) {
      w = Math.max(1, width);
      h = Math.max(1, height);
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
    },
    draw(time) {
      const state = backdropState(time);
      if (!ctx) {
        css(state);
        return;
      }
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, rgb(state.a.map((v) => v * 0.2)));
      gradient.addColorStop(1, rgb(state.b.map((v) => v * 0.2)));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      ctx.lineCap = "round";
      for (let line = -5; line < 16; line++) {
        ctx.beginPath();
        for (let step = 0; step <= 80; step++) {
          const x = (step / 80) * w,
            u = (step / 80) * 6;
          const y =
            (line / 10 +
              0.18 * Math.sin(u * state.zoom + time * 0.22 + line * 0.36) +
              0.09 * state.warp * Math.sin(u * 1.8 - time * 0.31)) *
            h;
          step ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = rgb(line % 2 ? state.a : state.b, 0.22);
        ctx.lineWidth = h * 0.035;
        ctx.stroke();
        ctx.strokeStyle = rgb([0.8, 0.9, 1], 0.2);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    },
    dispose() {
      canvas.width = canvas.height = 1;
    },
  };
}
/** One small, original shader; the renderer is independent of the desktop host. */
export function createStartBackdrop(
  canvas: HTMLCanvasElement,
  preferWebGL = true,
): StartBackdrop {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = preferWebGL
      ? canvas.getContext("webgl", {
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        })
      : null;
  } catch {
    /* Canvas compatibility path below. */
  }
  if (!gl) return canvasBackdrop(canvas);
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null,
    shaders: WebGLShader[] = [],
    lost = false,
    w = 1,
    h = 1;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  const setup = () => {
    program = gl.createProgram();
    if (!program) throw Error("No shader program");
    for (let index = 0; index < 2; index++) {
      const shader = gl.createShader(
        index ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER,
      );
      if (!shader) throw Error("No shader");
      shaders.push(shader);
      gl.shaderSource(shader, index ? fragment : vertex);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error("Shader unavailable");
      gl.attachShader(program!, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error("Shader link unavailable");
    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw Error("No shader buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    uniforms = Object.fromEntries(
      ["resolution", "colorA", "colorB", "shape", "motion"].map((name) => [
        name,
        gl.getUniformLocation(program!, name),
      ]),
    );
  };
  const release = () => {
    for (const shader of shaders) gl.deleteShader(shader);
    shaders = [];
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    buffer = null;
    program = null;
  };
  try {
    setup();
  } catch {
    release();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return canvasBackdrop(canvas);
  }
  let lastTime = 0;
  const draw = (time: number) => {
    lastTime = time;
    if (lost || !program) return;
    const state = backdropState(time);
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, w, h);
    gl.uniform3fv(uniforms.colorA, state.a);
    gl.uniform3fv(uniforms.colorB, state.b);
    gl.uniform4f(uniforms.shape, state.zoom, state.warp, state.n, state.m);
    gl.uniform3f(uniforms.motion, time, state.rotation, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    shaders = [];
    program = null;
    buffer = null;
    try {
      setup();
      gl.viewport(0, 0, w, h);
      lost = false;
      draw(lastTime);
    } catch {
      release();
      lost = true;
    }
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  return {
    mode: "webgl",
    resize(width, height) {
      const scale = Math.min(1, 1280 / Math.max(width, height));
      w = Math.max(1, Math.round(width * scale));
      h = Math.max(1, Math.round(height * scale));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    draw,
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      release();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
