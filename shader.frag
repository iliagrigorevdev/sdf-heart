precision highp float; // highp for more precision in distance calculations

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraLookAt;
uniform float u_cameraZoom; // Effectively FOV control

// --- SDF Primitives ---
float sdSphere(vec3 p, float s) {
  return length(p) - s;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, vec2 t) {
  // t.x = major radius, t.y = minor radius
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

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
  return abs(eqHeart(p, a, b)) / length(gradHeart(p, a, b));
}

// --- SDF Operations ---
float opUnion(float d1, float d2) {
  return min(d1, d2);
}
float opSubtraction(float d1, float d2) {
  return max(d1, -d2);
}
float opIntersection(float d1, float d2) {
  return max(d1, d2);
}

// Smooth minimum (for smooth union)
float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// --- Scene Definition ---
// This function returns vec2(signed_distance, material_id)
vec2 map(vec3 p) {
  float sceneDist = 1e10; // Large number (effectively infinity)
  float materialID = 0.0; // 0: default/ground, 1: sphere, 2: box, 3: torus, 4: heart

  // Pulsating sphere
  float sphereRadius = 0.8 + 0.2 * sin(u_time * 2.0);
  vec3 spherePos = vec3(0.0, sphereRadius, 0.0);
  float sphereDist = sdSphere(p - spherePos, sphereRadius);
  if (sphereDist < sceneDist) {
    sceneDist = sphereDist;
    materialID = 1.0;
  }

  // Rotating Box
  vec3 boxPos = vec3(2.5, 0.5, 0.0);
  vec3 boxSize = vec3(0.5, 0.5, 0.5);
  float boxAngle = u_time * 0.5;
  mat2 rotY_box = mat2(
    cos(boxAngle),
    -sin(boxAngle),
    sin(boxAngle),
    cos(boxAngle)
  );
  vec3 pBox = p - boxPos;
  pBox.xz = rotY_box * pBox.xz;
  float boxDist = sdBox(pBox, boxSize);
  if (boxDist < sceneDist) {
    sceneDist = boxDist;
    materialID = 2.0;
  }

  // Torus
  vec3 torusPos = vec3(-2.0, 0.6, 0.5);
  vec2 torusRadii = vec2(0.8, 0.25);
  float torusDist = sdTorus(p - torusPos, torusRadii);
  if (torusDist < sceneDist) {
    sceneDist = torusDist;
    materialID = 3.0;
  }

  // Heart
  vec3 heartPos = vec3(0.0, 1.0, -2.0);
  float heartDist = sdHeart((p - heartPos).xzy, 9.0 / 4.0, 9.0 / 200.0);
  if (heartDist < sceneDist) {
    sceneDist = heartDist;
    materialID = 4.0;
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
  float currentMaterialID = -1.0; // Use a local var for material ID during march

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
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  vec3 u = cross(f, r);

  return normalize(f * zoom + uv.x * r + uv.y * u);
}

// --- Lighting ---
vec3 applyLighting(vec3 p, vec3 normal, vec3 rayDir, float materialID) {
  vec3 lightPos = vec3(5.0 * cos(u_time * 0.3), 5.0, 5.0 * sin(u_time * 0.3));
  vec3 lightDir = normalize(lightPos - p);
  vec3 viewDir = -rayDir;

  vec3 materialColor = vec3(0.6);
  if (materialID == 0.0) materialColor = vec3(0.4, 0.5, 0.3);
  if (materialID == 1.0) materialColor = vec3(0.8, 0.2, 0.2);
  if (materialID == 2.0) materialColor = vec3(0.2, 0.2, 0.8);
  if (materialID == 3.0) materialColor = vec3(0.8, 0.8, 0.2);
  if (materialID == 4.0) materialColor = vec3(0.9, 0.15, 0.4); // Heart: deep pink/magenta

  float ambientStrength = 0.2;
  vec3 ambient = ambientStrength * materialColor;

  float diff = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = diff * materialColor;

  float specularStrength = 0.8;
  vec3 reflectDir = reflect(-lightDir, normal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
  vec3 specular = specularStrength * spec * vec3(1.0);

  float shadow = 1.0;
  vec3 shadowRayOrigin = p + normal * (HIT_THRESHOLD * 10.0);
  vec2 shadowRes = raymarch(shadowRayOrigin, lightDir);
  if (shadowRes.x < length(lightPos - shadowRayOrigin) && shadowRes.y > -0.5) {
    shadow = 0.3;
  }

  return ambient + (diffuse + specular) * shadow;
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
  float materialID_hit = hitResult.y; // Renamed to avoid conflict with map's materialID

  vec3 color;
  if (materialID_hit > -0.5) {
    vec3 hitPoint = rayOrigin + rayDirection * distToSurface;
    vec3 normal = calcNormal(hitPoint);
    color = applyLighting(hitPoint, normal, rayDirection, materialID_hit);

    float fogAmount = smoothstep(10.0, 30.0, distToSurface);
    color = mix(color, vec3(0.5, 0.6, 0.7), fogAmount);

  } else {
    color = vec3(0.5, 0.6, 0.7) - max(rayDirection.y, 0.0) * 0.2;
  }

  gl_FragColor = vec4(color, 1.0);
}
