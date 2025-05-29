let gl;
let program;
let positionBuffer;
let resolutionUniformLocation;
let timeUniformLocation;
let cameraPosUniformLocation;
let cameraLookAtUniformLocation;
let cameraZoomUniformLocation;

let camera = {
  azimuth: 0,
  elevation: Math.PI / 12,
  distance: 6.0,
  lookAt: [0, 0.2, 0],
  zoom: 2.0,
};

let mouse = {
  lastX: 0,
  lastY: 0,
  dragging: false,
};

async function loadShaderSource(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load shader: ${url} (${response.status} ${response.statusText})`,
    );
  }
  return response.text();
}

async function main() {
  const canvas = document.getElementById("glcanvas");
  gl = canvas.getContext("webgl");
  if (!gl) {
    alert("WebGL not supported!");
    return;
  }

  let vertexShaderSource;
  let fragmentShaderSource;

  try {
    vertexShaderSource = await loadShaderSource("shader.vert");
    fragmentShaderSource = await loadShaderSource("shader.frag");
  } catch (error) {
    console.error("Error loading shader files:", error);
    alert("Could not load shader files. Check the console for details.");
    return;
  }

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource,
  );
  if (!vertexShader || !fragmentShader) return;

  program = createProgram(gl, vertexShader, fragmentShader);
  if (!program) return;

  const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
  resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
  timeUniformLocation = gl.getUniformLocation(program, "u_time");
  cameraPosUniformLocation = gl.getUniformLocation(program, "u_cameraPos");
  cameraLookAtUniformLocation = gl.getUniformLocation(
    program,
    "u_cameraLookAt",
  );
  cameraZoomUniformLocation = gl.getUniformLocation(program, "u_cameraZoom");

  positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  canvas.addEventListener("mousedown", (e) => {
    mouse.dragging = true;
    mouse.lastX = e.clientX;
    mouse.lastY = e.clientY;
  });
  canvas.addEventListener("mouseup", () => {
    mouse.dragging = false;
  });
  canvas.addEventListener("mousemove", (e) => {
    if (mouse.dragging) {
      const dx = (e.clientX - mouse.lastX) * 0.01;
      const dy = (e.clientY - mouse.lastY) * 0.01;

      camera.azimuth -= dx;
      camera.elevation -= dy;
      camera.elevation = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, camera.elevation),
      );

      mouse.lastX = e.clientX;
      mouse.lastY = e.clientY;
    }
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    camera.distance += e.deltaY * 0.01;
    camera.distance = Math.max(1.0, Math.min(50.0, camera.distance));
  });

  requestAnimationFrame(render);
}

function render(time) {
  time *= 0.001;

  if (resizeCanvasToDisplaySize(gl.canvas, /*window.devicePixelRatio || */ 1)) {
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  gl.enableVertexAttribArray(0); // Corresponds to a_position attribute location
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
  // 2 components per iteration
  // type is FLOAT
  // don't normalize
  // 0 = move forward size * sizeof(type) each iteration to get the next position
  // 0 = offset from the beginning of the buffer
  gl.vertexAttribPointer(
    gl.getAttribLocation(program, "a_position"),
    2,
    gl.FLOAT,
    false,
    0,
    0,
  );

  const camX =
    camera.lookAt[0] +
    camera.distance * Math.cos(camera.elevation) * Math.sin(camera.azimuth);
  const camY = camera.lookAt[1] + camera.distance * Math.sin(camera.elevation);
  const camZ =
    camera.lookAt[2] +
    camera.distance * Math.cos(camera.elevation) * Math.cos(camera.azimuth);
  const camPos = [camX, camY, camZ];

  gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
  gl.uniform1f(timeUniformLocation, time);
  gl.uniform3fv(cameraPosUniformLocation, camPos);
  gl.uniform3fv(cameraLookAtUniformLocation, camera.lookAt);
  gl.uniform1f(cameraZoomUniformLocation, camera.zoom);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  requestAnimationFrame(render);
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) {
    return shader;
  }
  console.error(
    (type === gl.VERTEX_SHADER ? "VERTEX" : "FRAGMENT") +
      " SHADER COMPILE ERROR:\n" +
      gl.getShaderInfoLog(shader) +
      "\nSource:\n" +
      source
        .split("\n")
        .map((l, i) => `${i + 1}: ${l}`)
        .join("\n"),
  );
  gl.deleteShader(shader);
  return null;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) {
    return program;
  }
  console.error("PROGRAM LINK ERROR:", gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

function resizeCanvasToDisplaySize(canvas, multiplier) {
  multiplier = multiplier || 1;
  const width = Math.floor(canvas.clientWidth * multiplier);
  const height = Math.floor(canvas.clientHeight * multiplier);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

window.onload = main;
