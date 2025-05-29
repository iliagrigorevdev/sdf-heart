precision highp float; // highp for more precision in distance calculations

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraLookAt;
uniform float u_cameraZoom; // Effectively FOV control

// Heart equation:
// (x^2 + 9/4*y^2 + z^2 - 1)^3 - x^2*z^3 - 9/80*y^2*z^3
float eqHeart(vec3 p) {
  float x2 = p.x * p.x;
  float y2 = p.y * p.y;
  float z2 = p.z * p.z;
  float z3 = z2 * p.z; // p.z*p.z*p.z or pow(p.z, 3.0)

  // Term 1: (x^2 + 9/4*y^2 + z^2 - 1)^3
  // (9.0/4.0) is 2.25
  float term1_base = x2 + 2.25 * y2 + z2 - 1.0;
  float term1 = term1_base * term1_base * term1_base;

  // Term 2: -x^2*z^3
  float term2 = x2 * z3;

  // Term 3: -9/80*y^2*z^3
  // (9.0/80.0) is 0.1125
  float term3 = 0.1125 * y2 * z3;

  return term1 - term2 - term3;
}

// Heart gradient:
// (
//   6*x*(x^2 + 9/4*y^2 + z^2 - 1)^2 - 2*x*z^3,
//   27/2*y*(x^2 + 9/4*y^2 + z^2 - 1)^2 - 9/40*y*z^3,
//   6*z*(x^2 + 9/4*y^2 + z^2 - 1)^2 - 3*x^2*z^2 - 27/80*y^2*z^2
// )
vec3 gradHeart(vec3 p) {
  float x = p.x;
  float y = p.y;
  float z = p.z;

  // Calculate powers efficiently
  float x_sq = x * x; // x^2
  float y_sq = y * y; // y^2
  float z_sq = z * z; // z^2
  float z_cub = z_sq * z; // z^3

  // Common term: (x^2 + 9/4*y^2 + z^2 - 1)
  // 9.0/4.0 = 2.25
  float common_term_base = x_sq + 9.0 / 4.0 * y_sq + z_sq - 1.0;
  float common_term_sq = common_term_base * common_term_base; // (common_term_base)^2

  // Partial derivative with respect to x:
  // 6.0 * x * common_term_sq - 2.0 * x * z_cub
  float df_dx = 6.0 * x * common_term_sq - 2.0 * x * z_cub;

  // Partial derivative with respect to y:
  // (27.0/2.0) * y * common_term_sq - (9.0/40.0) * y * z_cub
  // 27.0/2.0 = 13.5
  // 9.0/40.0 = 0.225
  float df_dy = 27.0 / 2.0 * y * common_term_sq - 9.0 / 40.0 * y * z_cub;
  // Alternative using decimals:
  // float df_dy = 13.5 * y * common_term_sq - 0.225 * y * z_cub;

  // Partial derivative with respect to z:
  // 6.0 * z * common_term_sq - 3.0 * x_sq * z_sq - (27.0/80.0) * y_sq * z_sq
  // 27.0/80.0 = 0.3375
  float df_dz =
    6.0 * z * common_term_sq - 3.0 * x_sq * z_sq - 27.0 / 80.0 * y_sq * z_sq;
  // Alternative using decimals:
  // float df_dz = 6.0 * z * common_term_sq - 3.0 * x_sq * z_sq - 0.3375 * y_sq * z_sq;

  return vec3(df_dx, df_dy, df_dz);
}

// Heart SDF (Signed Distance Function)
// Modified to support anisotropic scaling for animation.
// p_def_coord: Point in the heart's definition coordinate system.
//              (This means it's p_world transformed to heart local, swizzled, AND divided by animation scales)
// anim_scales: The (sx, sy, sz) animation scales applied to the heart's x, y, z axes (relative to eqHeart's coord system).
float sdHeart(vec3 p_def_coord, vec3 anim_scales) {
  float eq_val = eqHeart(p_def_coord);
  vec3 grad_val = gradHeart(p_def_coord); // Gradient w.r.t. p_def_coord

  // The true SDF for an anisotropically scaled implicit surface F(p_def_coord) = 0,
  // where p_def_coord = p_local_scaled_space / anim_scales, is:
  // F(p_def_coord) / length( grad_wrt_p_def_coord(F) / anim_scales )
  return eq_val / (length(grad_val / anim_scales) + 1e-9); // Increased epsilon slightly from 1e-6 for stability with scales
}

// --- Scene Definition ---
// This function returns vec2(signed_distance, material_id)
vec2 map(vec3 p) {
  float sceneDist = 1e10; // Large number (effectively infinity)
  float materialID = 0.0; // 0: default, 1: heart

  // --- Heart Definition & Animation ---
  vec3 heartPos = vec3(0.0, 0.0, 0.0); // Center of the heart in world space

  // Transform world point p to heart's local, swizzled coordinate system (before animation scaling)
  // This swizzle orients the heart:
  // eqHeart's x-axis maps to world X (width)
  // eqHeart's y-axis maps to world Z (depth)
  // eqHeart's z-axis maps to world Y (height)
  vec3 p_local_swizzled = (p - heartPos).xzy;

  // Animation parameters for heartbeat
  float beat_amplitude = 0.02; // Max contraction/expansion
  float beat_bpm = 30.0; // Beats per minute for the animation
  float beat_freq_rad_per_sec = 2.0 * 3.1415926535 * (beat_bpm / 60.0); // Convert BPM to angular frequency

  float beat_phase = u_time * beat_freq_rad_per_sec;
  // beat_cycle modulates from 0 (representing max contraction) to 1 (representing max relaxation/base size)
  float beat_cycle = (cos(beat_phase) + 1.0) * 0.5;

  // s_beat is the scale factor for width (eqHeart.x) and depth (eqHeart.y)
  // It ranges from (1.0 - beat_amplitude) during contraction, up to 1.0 during relaxation.
  float s_beat = 1.0 - beat_amplitude * (1.0 - beat_cycle);

  // Define animation scales for each axis of the eqHeart coordinate system
  float scale_heart_eqX = s_beat; // Scales eqHeart.x (world X / width)
  float scale_heart_eqY = s_beat; // Scales eqHeart.y (world Z / depth)

  // scale_heart_eqZ scales eqHeart.z (world Y / height), and compensates to preserve volume.
  // Volume preservation: sx * sy * sz = 1  => sz = 1 / (sx * sy)
  // Add a small epsilon to denominator to prevent division by zero if sx*sy is ever zero (though logic prevents s_beat=0).
  float scale_heart_eqZ = 1.0 / (scale_heart_eqX * scale_heart_eqY + 1e-7);

  vec3 heart_animation_scales = vec3(
    scale_heart_eqX,
    scale_heart_eqY,
    scale_heart_eqZ
  );

  // Transform the local, swizzled point into the heart's *definition* space by dividing by animation scales.
  // This p_heart_definition_coords is what eqHeart and gradHeart expect.
  vec3 p_heart_definition_coords = p_local_swizzled / heart_animation_scales;

  float heartDist = sdHeart(p_heart_definition_coords, heart_animation_scales);

  if (heartDist < sceneDist) {
    sceneDist = heartDist;
    materialID = 1.0;
  }

  return vec2(sceneDist, materialID);
}

// --- Normal Calculation ---
vec3 calcNormal(vec3 p) {
  const float epsilon = 0.001;
  vec2 e = vec2(epsilon, 0.0);

  vec3 normal = vec3(
    map(p + e.xyy).x - map(p - e.xyy).x,
    map(p + e.yxy).x - map(p - e.yxy).x,
    map(p + e.yyx).x - map(p - e.yyx).x
  );
  return normalize(normal);
}

// --- Raymarching ---
const int MAX_STEPS = 100;
const float MAX_DIST = 100.0;
const float HIT_THRESHOLD = 0.001;

vec2 raymarch(vec3 ro, vec3 rd) {
  float t = 0.0;
  float currentMaterialID = -1.0;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p_current = ro + t * rd;
    vec2 map_result = map(p_current);
    float dist_to_surface = map_result.x;

    if (dist_to_surface < HIT_THRESHOLD) {
      currentMaterialID = map_result.y;
      return vec2(t, currentMaterialID);
    }

    t += dist_to_surface;
    if (t > MAX_DIST) {
      break;
    }
  }
  return vec2(MAX_DIST, -1.0); // Missed
}

// --- Camera Ray Generation ---
vec3 getRayDirection(vec2 uv, vec3 camPos, vec3 lookAt, float zoom) {
  vec3 f = normalize(lookAt - camPos);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f)); // Right vector
  vec3 u = cross(f, r); // Up vector (corrected)

  return normalize(f * zoom + uv.x * r + uv.y * u);
}

// --- Lighting ---
vec3 applyLighting(vec3 p, vec3 normal, vec3 rayDir, float materialID) {
  // Light position animated from left to right and back
  float light_x_amplitude = 7.0; // How far left/right it moves from center (e.g., from -7.0 to 7.0)
  float light_speed = 0.5; // Speed of the oscillation (adjust for desired pace)
  float light_x = sin(u_time * light_speed) * light_x_amplitude;
  float light_y = 5.0; // Keep Y constant (height of the light)
  float light_z = 3.0; // Keep Z constant (depth of the light, can be adjusted)

  vec3 lightPos = vec3(light_x, light_y, light_z);

  vec3 lightDir = normalize(lightPos - p);
  vec3 viewDir = -rayDir;

  vec3 materialColor = vec3(0.6); // Default color
  if (materialID == 1.0) materialColor = vec3(0.9, 0.15, 0.4); // Heart: deep pink/magenta

  // Ambient light
  float ambientStrength = 0.2;
  vec3 ambient = ambientStrength * materialColor;

  // Diffuse light
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = diff * materialColor;

  // Specular light
  float specularStrength = 0.8;
  vec3 reflectDir = reflect(-lightDir, normal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0); // Shininess
  vec3 specular = specularStrength * spec * vec3(1.0); // White highlights

  return ambient + (diffuse + specular);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  vec3 rayOrigin = u_cameraPos;
  vec3 rayDirection = getRayDirection(
    uv,
    u_cameraPos,
    u_cameraLookAt,
    u_cameraZoom
  );

  vec2 hitResult = raymarch(rayOrigin, rayDirection);
  float distToSurface = hitResult.x;
  float materialID_hit = hitResult.y;

  vec3 color;
  if (materialID_hit > -0.5) {
    // If an object was hit (materialID is not -1.0)
    vec3 hitPoint = rayOrigin + rayDirection * distToSurface;
    vec3 normal = calcNormal(hitPoint);
    color = applyLighting(hitPoint, normal, rayDirection, materialID_hit);

    // Fog effect: color blends towards fogColor based on distance
    float fogAmount = smoothstep(10.0, 30.0, distToSurface); // Start fog at 10 units, full fog at 30 units
    vec3 fogColor = vec3(0.5, 0.6, 0.7); // Bluish-grey fog
    color = mix(color, fogColor, fogAmount);
  } else {
    // Background color (sky)
    vec3 skyColor = vec3(0.5, 0.6, 0.7); // Base sky color
    // Make sky slightly brighter towards top
    color = skyColor - max(rayDirection.y, 0.0) * 0.2;
  }

  gl_FragColor = vec4(color, 1.0);
}
