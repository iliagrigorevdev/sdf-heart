#version 300 es
precision highp float; // highp for more precision in distance calculations

// Declare an output variable for the fragment color
out vec4 outFragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraLookAt;
uniform float u_cameraZoom; // Effectively FOV control

// Heart equation:
// (x^2 + a*(y^2) + z^2 -1)^3 - (x^2)(z^3) -b(y^2)*(z^3)
float eqHeart(vec3 p, float a, float b) {
  float x = p.x;
  float y = p.y;
  float z = p.z;

  // Pre-calculate powers to make it cleaner
  float x2 = x * x;
  float y2 = y * y;
  float z2 = z * z;
  float z3 = z2 * z; // or pow(z, 3.0)

  // First term: (x^2 + a*(y^2) + z^2 - 1)^3
  float term1_base = x2 + a * y2 + z2 - 1.0;
  float term1 = term1_base * term1_base * term1_base; // or pow(term1_base, 3.0)

  // Second term: (x^2)(z^3)
  float term2 = x2 * z3;

  // Third term: b*(y^2)*(z^3)
  float term3 = b * y2 * z3;

  return term1 - term2 - term3;
}

// Heart gradient:
// (
//   2x [ 3(x^2 + a y^2 + z^2 - 1)^2 - z^3 ],
//   2y [ 3a(x^2 + a y^2 + z^2 - 1)^2 - b z^3 ],
//   6z(x^2 + a y^2 + z^2 - 1)^2 - 3z^2(x^2 + b y^2)
// )
vec3 gradHeart(vec3 p, float a, float b) {
  float x = p.x;
  float y = p.y;
  float z = p.z;

  // Pre-calculate some common terms for efficiency and readability
  float x_sq = x * x; // x^2
  float y_sq = y * y; // y^2
  float z_sq = z * z; // z^2
  float z_cub = z_sq * z; // z^3 (or pow(z, 3.0))

  // The term (x^2 + a*y^2 + z^2 - 1)
  float common_term = x_sq + a * y_sq + z_sq - 1.0;
  // The term (x^2 + a*y^2 + z^2 - 1)^2
  float common_term_sq = common_term * common_term; // or pow(common_term, 2.0)

  // Calculate partial derivative with respect to x:
  // df/dx = 6*x*(x^2 + a*y^2 + z^2 - 1)^2 - 2*x*z^3
  float df_dx = 6.0 * x * common_term_sq - 2.0 * x * z_cub;

  // Calculate partial derivative with respect to y:
  // df/dy = 6*a*y*(x^2 + a*y^2 + z^2 - 1)^2 - 2*b*y*z^3
  float df_dy = 6.0 * a * y * common_term_sq - 2.0 * b * y * z_cub;

  // Calculate partial derivative with respect to z:
  // df/dz = 6*z*(x^2 + a*y^2 + z^2 - 1)^2 - 3*x^2*z^2 - 3*b*y^2*z^2
  float df_dz = 6.0 * z * common_term_sq - 3.0 * z_sq * (x_sq + b * y_sq);

  return vec3(df_dx, df_dy, df_dz);
}

// Heart SDF
float sdHeart(vec3 p, float a, float b) {
  // Adding a small epsilon to length(gradHeart) to prevent division by zero if gradient is zero
  // (though unlikely for this implicit surface far from origin, it's a safeguard)
  return eqHeart(p, a, b) / (length(gradHeart(p, a, b)) + 1e-6);
}

// --- Scene Definition ---
// This function returns vec2(signed_distance, material_id)
vec2 map(vec3 p) {
  float sceneDist = 1e10; // Large number (effectively infinity)
  float materialID = 0.0; // 0: default/ground, 1: heart

  // Heart
  vec3 heartPos = vec3(0.0, 1.0, 0.0); // Center of the heart
  // The heart SDF uses (p - heartPos).xzy because the original heart formula is typically
  // aligned with Z pointing "out of the screen" or upwards in some conventions,
  // and Y being the vertical axis. Swizzling .xzy reorients it for a typical
  // Y-up world space used in the raymarcher.
  float heartDist = sdHeart((p - heartPos).xzy, 9.0 / 4.0, 9.0 / 200.0);
  if (heartDist < sceneDist) {
    sceneDist = heartDist;
    materialID = 1.0;
  }

  // Ground plane
  float planeDist = p.y + 0.0; // Plane at y = 0
  if (planeDist < sceneDist) {
    sceneDist = planeDist;
    materialID = 0.0; // Ground material
  }

  return vec2(sceneDist, materialID);
}

// --- Normal Calculation ---
vec3 calcNormal(vec3 p) {
  const float epsilon = 0.001; // Small offset for gradient calculation
  // Using vec2 for e allows for concise expression of offsets
  vec2 e = vec2(epsilon, 0.0);

  // Tetrahedral sampling for smoother normals (more robust than simple central differences)
  // This is one common way, another is just central differences:
  // map(p + e.xyy).x - map(p - e.xyy).x, etc.
  // The provided version is fine and common.
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
const float HIT_THRESHOLD = 0.001; // How close we need to be to consider it a hit

vec2 raymarch(vec3 ro, vec3 rd) {
  float t = 0.0; // Total distance marched along the ray
  float currentMaterialID = -1.0; // Default to no material hit

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p_current = ro + t * rd; // Current point along the ray
    vec2 map_result = map(p_current); // Get distance to surface and material ID
    float dist_to_surface = map_result.x;

    if (dist_to_surface < HIT_THRESHOLD) {
      currentMaterialID = map_result.y; // Surface hit, store material ID
      return vec2(t, currentMaterialID); // Return distance and material ID
    }
    t += dist_to_surface; // Advance ray by the distance to the closest surface
    if (t > MAX_DIST) {
      break; // Exceeded maximum marching distance
    }
  }
  return vec2(MAX_DIST, -1.0); // Missed (or hit beyond MAX_DIST), return max distance and no material
}

// --- Camera Ray Generation ---
vec3 getRayDirection(vec2 uv, vec3 camPos, vec3 lookAt, float zoom) {
  vec3 f = normalize(lookAt - camPos); // Forward vector
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f)); // Right vector (assuming Y-up)
  vec3 u = cross(f, r); // Up vector (recalculated for orthogonality)

  // Construct ray direction based on UV coordinates and camera orientation
  // zoom acts like a field-of-view factor (smaller zoom = wider FOV, larger zoom = narrower FOV/telephoto)
  return normalize(f * zoom + uv.x * r + uv.y * u);
}

// --- Lighting ---
vec3 applyLighting(vec3 p, vec3 normal, vec3 rayDir, float materialID) {
  vec3 lightPos = vec3(5.0 * cos(u_time * 0.3), 5.0, 5.0 * sin(u_time * 0.3)); // Animated light
  vec3 lightDir = normalize(lightPos - p); // Direction from point to light
  vec3 viewDir = -rayDir; // Direction from point to camera (viewer)

  // Define material colors based on ID
  vec3 materialColor = vec3(0.6); // Default ambient color
  if (materialID == 0.0) materialColor = vec3(0.4, 0.5, 0.3); // Ground: greenish
  if (materialID == 1.0) materialColor = vec3(0.9, 0.15, 0.4); // Heart: deep pink/magenta

  // Ambient light
  float ambientStrength = 0.2;
  vec3 ambient = ambientStrength * materialColor;

  // Diffuse light
  float diff = max(dot(normal, lightDir), 0.0); // Lambertian factor
  vec3 diffuse = diff * materialColor;

  // Specular light (Phong model)
  float specularStrength = 0.8;
  vec3 reflectDir = reflect(-lightDir, normal); // Reflected light direction
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0); // Specular highlight factor (shininess)
  vec3 specular = specularStrength * spec * vec3(1.0); // Specular color is white

  // Shadow calculation (simple hard shadows)
  float shadow = 1.0; // Assume fully lit initially
  vec3 shadowRayOrigin = p + normal * (HIT_THRESHOLD * 10.0); // Offset origin slightly to avoid self-shadowing
  vec2 shadowRes = raymarch(shadowRayOrigin, lightDir);
  // If shadow ray hits something before reaching the light source
  if (shadowRes.x < length(lightPos - shadowRayOrigin) && shadowRes.y > -0.5) {
    // shadowRes.y > -0.5 checks if a valid material was hit
    shadow = 0.3; // Point is in shadow
  }

  return ambient + (diffuse + specular) * shadow;
}

void main() {
  // Normalize fragment coordinates to UV space [-aspect, aspect] x [-1, 1] (approx)
  // u_resolution.y is used to keep aspect ratio correct
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
    // Check if a valid material was hit (materialID is not -1.0)
    vec3 hitPoint = rayOrigin + rayDirection * distToSurface;
    vec3 normal = calcNormal(hitPoint);
    color = applyLighting(hitPoint, normal, rayDirection, materialID_hit);

    // Simple distance fog
    float fogAmount = smoothstep(10.0, 30.0, distToSurface); // Fog starts at 10 units, fully opaque at 30
    color = mix(color, vec3(0.5, 0.6, 0.7), fogAmount); // Mix with fog color
  } else {
    // Background color (sky gradient)
    color = vec3(0.5, 0.6, 0.7) - max(rayDirection.y, 0.0) * 0.2; // Brighter towards horizon
  }

  // Output final color
  outFragColor = vec4(color, 1.0); // Changed 'gl_FragColor' to 'outFragColor'
}
