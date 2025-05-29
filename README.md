# WebGL Animated 3D Heart with PBR Raymarching

An interactive WebGL demonstration showcasing a beating 3D heart rendered using raymarching with Signed Distance Fields (SDFs) and shaded with a Physically Based Rendering (PBR) pipeline. The scene includes an animated point light and a procedural sky background, with interactive camera controls.

**Live Demo:** [Try it live!](https://iliagrigorevdev.github.io/sdf-heart/)

## Overview

This project renders a dynamically animated 3D heart shape directly in the browser using WebGL. Instead of traditional polygon meshes, the heart's geometry is defined mathematically by an implicit equation. This equation is used to create a Signed Distance Field (SDF), which is then utilized by a raymarching algorithm to render the shape.

The visual realism is enhanced by a Physically Based Rendering (PBR) model (Cook-Torrance BRDF), which simulates how light interacts with the heart's surface. The scene is lit by an animated point light and features a simple procedural sky for the background. Users can interact with the scene by orbiting the camera around the heart and zooming in or out.

## Features

*   **3D Heart Shape via SDF:**
    *   Heart geometry defined by the implicit mathematical equation: `(x^2 + 9/4*y^2 + z^2 - 1)^3 - x^2*z^3 - 9/80*y^2*z^3 = 0`.
    *   Signed Distance Function (`sdHeart`) derived using the equation and its analytical gradient (`gradHeart`) for efficient raymarching and accurate normals.
*   **Raymarching Rendering:**
    *   The scene is rendered by casting rays from the camera for each pixel.
    *   The `raymarch` function iteratively steps along rays, querying the scene's SDF (`map`) to find intersections.
*   **Physically Based Rendering (PBR):**
    *   Cook-Torrance BRDF for realistic surface shading.
    *   Includes:
        *   Normal Distribution Function (NDF): Trowbridge-Reitz GGX (`D_GGX`).
        *   Geometry Function: Smith's method with Schlick-GGX (`G_Smith`, `G_SchlickGGX`).
        *   Fresnel Equation: Schlick's approximation (`F_Schlick`).
    *   Heart material properties: Red albedo, low metallic, configurable roughness.
*   **Dynamic Lighting & Animation:**
    *   **Beating Heart:** The heart animates with a rhythmic pulse, achieved by anisotropically scaling its definition space over time.
    *   **Animated Point Light:** A single point light source orbits horizontally, contributing to PBR calculations.
    *   **Procedural Sky:** A gradient sky (deep blue zenith to vibrant blue horizon) for rays that don't hit any objects.
*   **Interactive Camera Controls:**
    *   **Orbit:** Click and drag the mouse to rotate the camera (azimuth and elevation).
    *   **Zoom:** Use the mouse wheel to adjust the camera's distance.
*   **Post-Processing:**
    *   **Reinhard Tonemapping:** Maps HDR lighting values to LDR for display.
    *   **Gamma Correction:** Applied to the final color for sRGB displays.

## Technical Stack

*   **Languages:** HTML5, JavaScript (ES6+), GLSL (OpenGL Shading Language)
*   **API:** WebGL 1.0
*   **Rendering Techniques:**
    *   Raymarching
    *   Signed Distance Fields (SDFs)
    *   Physically Based Rendering (PBR) - Cook-Torrance BRDF
    *   Procedural Sky Generation
    *   Tonemapping & Gamma Correction

## How It Works

The rendering process involves a JavaScript-driven setup and a GLSL-powered pixel-by-pixel computation:

1.  **Initialization (`script.js`):**
    *   Acquires the WebGL context from the HTML `<canvas>` element.
    *   Asynchronously loads the vertex (`shader.vert`) and fragment (`shader.frag`) shader source code using `fetch`.
    *   Compiles these shaders and links them into a WebGL program.
    *   Sets up a full-screen quad (composed of two triangles) by creating a vertex buffer.
    *   Attaches mouse event listeners (`mousedown`, `mouseup`, `mousemove`, `wheel`) for camera interaction.

2.  **Render Loop (`render` function in `script.js`):**
    *   This function is called repeatedly via `requestAnimationFrame`.
    *   Updates the `u_time` uniform for animations.
    *   Calculates the camera's 3D position based on user-controlled azimuth, elevation, and distance, orbiting around a `lookAt` point.
    *   Passes essential data as uniforms to the shaders: canvas resolution, current time, camera position, camera look-at point, and camera zoom/FOV factor.
    *   Instructs WebGL to draw the full-screen quad.

3.  **Vertex Shader (`shader.vert`):**
    *   A minimal shader responsible for positioning the vertices of the full-screen quad. It essentially passes through the vertex positions so that the fragment shader runs for every pixel on the screen.

4.  **Fragment Shader (`shader.frag`):**
    *   This is where the core rendering logic for each pixel resides:
        *   **Ray Generation:** For the current pixel's screen coordinates (`gl_FragCoord`), a 3D ray is cast from the `u_cameraPos` in the direction computed by `getRayDirection`.
        *   **Raymarching (`raymarch`):**
            *   The ray iteratively steps through the 3D scene.
            *   In each step, the `map` function is called. `map` determines the shortest distance to any object in the scene by evaluating their SDFs (currently, only `sdHeart`).
            *   The ray advances by this distance. If the distance is below a small `HIT_THRESHOLD`, an intersection (hit) is registered. The process stops if a hit occurs or if the ray travels beyond `MAX_DIST` or exceeds `MAX_STEPS`.
        *   **Surface Interaction & Shading:**
            *   If a surface is hit:
                *   The hit point `p_surf` is calculated.
                *   The surface normal `N_surf` is computed using `calcNormal`. For the heart, this uses its analytical gradient (`gradHeart`) for high precision, transformed by the current animation scales.
                *   The view vector `V_eye` (from surface to camera) is determined.
                *   The `getSurfaceColor` function retrieves material properties (albedo, metallic, roughness) for the hit material (ID 1.0 for the heart).
                *   `PBRShading` calculates the final color using the PBR model, incorporating contributions from the animated point light and a basic ambient term.
                *   The resulting High Dynamic Range (HDR) color is tonemapped (Reinhard) and gamma-corrected (to sRGB).
            *   If no surface is hit (ray escapes to the "sky"):
                *   A procedural sky color is computed based on the ray's vertical direction, creating a blue gradient.
                *   This sky color is also gamma-corrected.
        *   **Output:** The final computed `vec4` color is assigned to `gl_FragColor`.

## Key GLSL Components in `shader.frag`

*   **Heart Geometry & Animation:**
    *   `eqHeart(vec3 p)`: Defines the implicit surface equation of the heart.
    *   `gradHeart(vec3 p)`: Computes the analytical gradient of `eqHeart`, crucial for `sdHeart` and `calcNormal`.
    *   `sdHeart(vec3 p_def_coord, vec3 anim_scales)`: The Signed Distance Function for the heart, incorporating animation scales.
    *   `getHeartAnimationScales()`: Generates time-varying anisotropic scaling factors for the heart's beating animation.
    *   `getHeartTransformDataForPoint(vec3 p_world)`: Transforms world-space points to the heart's animated definition space.
*   **Scene Definition & Raymarching:**
    *   `map(vec3 p)`: The main scene SDF; returns the distance to the closest surface (the heart) and its material ID.
    *   `raymarch(vec3 ro, vec3 rd)`: Implements the core raymarching loop.
*   **Normals & Camera:**
    *   `calcNormal(vec3 p, float materialID)`: Calculates the surface normal at a given point.
    *   `getRayDirection(vec2 uv, vec3 camPos, vec3 lookAt, float zoom)`: Generates camera rays based on pixel coordinates and camera parameters.
*   **PBR Shading:**
    *   `D_GGX(float NdotH, float roughness)`: GGX Normal Distribution Function.
    *   `G_SchlickGGX(float NdotVal, float roughness)` & `G_Smith(float NdotV, float NdotL, float roughness)`: Geometry functions.
    *   `F_Schlick(float cosTheta, vec3 F0)`: Fresnel equation (Schlick's approximation).
    *   `PBRShading(...)`: Combines PBR terms for final lighting calculation.
    *   `getSurfaceColor(...)`: Orchestrates material property lookup and calls `PBRShading`.

## Setup and Running Locally

To run this project, you need to serve the files through a local web server because modern browsers restrict loading files (like shaders via `fetch`) directly from the local file system (`file:///`) due to security policies (CORS).

1.  **Clone the repository (or download the files):**
    ```bash
    git clone https://your-repository-link.git
    cd your-project-directory
    ```
    (If you're just using the provided files, save `index.html`, `script.js`, `shader.vert`, and `shader.frag` into a directory.)

2.  **Start a local web server** in the project directory. Here are a few common ways:
    *   **Using Python 3:**
        ```bash
        python -m http.server
        ```
    *   **Using Python 2:**
        ```bash
        python -m SimpleHTTPServer
        ```
    *   **Using Node.js (with `npx` and `serve`):**
        ```bash
        npx serve
        ```
        (If you don't have `serve` installed, `npx` can fetch it temporarily. Or install it globally: `npm install -g serve`, then run `serve`.)
    *   **Using VS Code Live Server extension.**

3.  **Open in your browser:**
    Navigate to `http://localhost:8000` (or the port specified by your web server, e.g., `http://localhost:5000` for `npx serve` by default).

## Controls

*   **Orbit Camera:** Click and drag the left mouse button on the canvas.
*   **Zoom Camera:** Use the mouse scroll wheel.

## Acknowledgements

This project code was almost entirely generated by Gemini 2.5 Pro Preview 05-06 using dozens of promts.