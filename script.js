let gl;
let program;
let positionBuffer;
let resolutionUniformLocation;
let timeUniformLocation;
let cameraPosUniformLocation;
let cameraLookAtUniformLocation;
let cameraZoomUniformLocation;

// For unrelated improvement: store positionAttributeLocation globally or pass it
let positionAttributeLocation; // Added for consistency

let camera = {
  azimuth: 0,
  elevation: Math.PI / 12,
  distance: 6.0,
  lookAt: [0, 0.2, 0],
  zoom: 2.0, // This zoom is currently passed to shader but not interactive
};

let mouse = {
  lastX: 0,
  lastY: 0,
  dragging: false, // For single touch/mouse orbit
  lastPinchDistance: 0, // For two-finger pinch
  pinching: false, // To indicate pinch gesture is active
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

  // Store attribute location
  positionAttributeLocation = gl.getAttribLocation(program, "a_position");
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

  // Mouse Listeners
  canvas.addEventListener("mousedown", (e) => {
    mouse.dragging = true;
    mouse.lastX = e.clientX;
    mouse.lastY = e.clientY;
    mouse.pinching = false; // Ensure pinching is off if mouse is used
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
        -Math.PI / 2 + 0.01, // Prevents looking straight up or down
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

  // Touch Listeners
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault(); // Important to prevent default touch actions (e.g., scrolling)
      if (e.touches.length === 1) {
        mouse.dragging = true;
        mouse.lastX = e.touches[0].clientX;
        mouse.lastY = e.touches[0].clientY;
        mouse.pinching = false;
      } else if (e.touches.length === 2) {
        mouse.dragging = false; // Stop dragging if two fingers are down
        mouse.pinching = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        mouse.lastPinchDistance = Math.sqrt(dx * dx + dy * dy);
      }
    },
    { passive: false },
  ); // passive: false allows preventDefault

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (mouse.dragging && e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = (touch.clientX - mouse.lastX) * 0.01;
        const dy = (touch.clientY - mouse.lastY) * 0.01;

        camera.azimuth -= dx;
        camera.elevation -= dy;
        camera.elevation = Math.max(
          -Math.PI / 2 + 0.01,
          Math.min(Math.PI / 2 - 0.01, camera.elevation),
        );

        mouse.lastX = touch.clientX;
        mouse.lastY = touch.clientY;
      } else if (mouse.pinching && e.touches.length === 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        const currentPinchDistance = Math.sqrt(dx * dx + dy * dy);
        const deltaDistance = currentPinchDistance - mouse.lastPinchDistance;

        // Pinch apart = zoom in (decrease distance)
        // Pinch together = zoom out (increase distance)
        camera.distance -= deltaDistance * 0.05; // Adjust sensitivity as needed
        camera.distance = Math.max(1.0, Math.min(50.0, camera.distance));

        mouse.lastPinchDistance = currentPinchDistance;
      }
    },
    { passive: false },
  );

  canvas.addEventListener("touchend", (e) => {
    // e.preventDefault(); // Usually not strictly needed for touchend
    if (e.touches.length === 0) {
      mouse.dragging = false;
      mouse.pinching = false;
    } else if (e.touches.length === 1) {
      // If one finger is lifted (was pinching), switch to dragging with the remaining finger
      mouse.pinching = false;
      mouse.dragging = true;
      mouse.lastX = e.touches[0].clientX;
      mouse.lastY = e.touches[0].clientY;
    }
  });

  canvas.addEventListener("touchcancel", (e) => {
    // Treat cancel like touchend with no remaining touches
    mouse.dragging = false;
    mouse.pinching = false;
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

  // Use the stored positionAttributeLocation
  gl.enableVertexAttribArray(positionAttributeLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(
    positionAttributeLocation, // Use the stored location
    2, // 2 components per iteration
    gl.FLOAT, // type is FLOAT
    false, // don't normalize
    0, // 0 = move forward size * sizeof(type) each iteration
    0, // 0 = offset from the beginning of the buffer
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
