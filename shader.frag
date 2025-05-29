precision highp float; // highp for more precision in distance calculations

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraLookAt;
uniform float u_cameraZoom; // Effectively FOV control

const float PI = 3.141592653589793;

// --- Helper struct and function for heart coordinate transformations ---
struct HeartTransformData {
  vec3 p_definition_space; // Point in heart's definition space (transformed for eqHeart)
  vec3 animation_scales; // Animation scales (sx, sy, sz for eqHeart axes)
};

// Heart equation:
// (x^2 + 9/4*y^2 + z^2 - 1)^3 - x^2*z^3 - 9/80*y^2*z^3
float eqHeart(vec3 p) {
  float x2 = p.x * p.x;
  float y2 = p.y * p.y;
  float z2 = p.z * p.z;
  float z3 = z2 * p.z;

  float term1_base = x2 + 2.25 * y2 + z2 - 1.0;
  float term1 = term1_base * term1_base * term1_base;
  float term2 = x2 * z3;
  float term3 = 0.1125 * y2 * z3;

  return term1 - term2 - term3;
}

// Heart gradient:
vec3 gradHeart(vec3 p) {
  float x = p.x;
  float y = p.y;
  float z = p.z;

  float x_sq = x * x;
  float y_sq = y * y;
  float z_sq = z * z;
  float z_cub = z_sq * z;

  float common_term_base = x_sq + 2.25 * y_sq + z_sq - 1.0;
  float common_term_sq = common_term_base * common_term_base;

  float df_dx = 6.0 * x * common_term_sq - 2.0 * x * z_cub;
  float df_dy = 13.5 * y * common_term_sq - 0.225 * y * z_cub;
  float df_dz =
    6.0 * z * common_term_sq - 3.0 * x_sq * z_sq - 0.3375 * y_sq * z_sq;

  return vec3(df_dx, df_dy, df_dz);
}

// Heart SDF (Signed Distance Function)
float sdHeart(vec3 p_def_coord, vec3 anim_scales) {
  float eq_val = eqHeart(p_def_coord);
  vec3 grad_val = gradHeart(p_def_coord);
  return eq_val / (length(grad_val / anim_scales) + 1e-9);
}

// Calculates the anisotropic scaling factors for the heart animation.
vec3 getHeartAnimationScales() {
  float beat_amplitude = 0.02;
  float beat_bpm = 30.0;
  float beat_freq_rad_per_sec = 2.0 * PI * (beat_bpm / 60.0);

  float beat_phase = u_time * beat_freq_rad_per_sec;
  float beat_cycle = (cos(beat_phase) + 1.0) * 0.5;
  float s_beat = 1.0 - beat_amplitude * (1.0 - beat_cycle);

  float scale_heart_eqX = s_beat;
  float scale_heart_eqY = s_beat;
  float scale_heart_eqZ = 1.0 / (scale_heart_eqX * scale_heart_eqY + 1e-7);

  return vec3(scale_heart_eqX, scale_heart_eqY, scale_heart_eqZ);
}

HeartTransformData getHeartTransformDataForPoint(vec3 p_world) {
  HeartTransformData data;
  vec3 heartPos = vec3(0.0, 0.0, 0.0);
  vec3 p_local_swizzled = (p_world - heartPos).xzy;
  data.animation_scales = getHeartAnimationScales();
  data.p_definition_space = p_local_swizzled / data.animation_scales;
  return data;
}

// --- Scene Definition ---
vec2 map(vec3 p) {
  float sceneDist = 1e10;
  float materialID = 0.0;

  HeartTransformData heart_data = getHeartTransformDataForPoint(p);
  float heartDist = sdHeart(
    heart_data.p_definition_space,
    heart_data.animation_scales
  );

  if (heartDist < sceneDist) {
    sceneDist = heartDist;
    materialID = 1.0;
  }
  return vec2(sceneDist, materialID);
}

// --- Normal Calculation ---
vec3 calcNormal(vec3 p, float materialID) {
  if (materialID == 1.0) {
    HeartTransformData heart_data = getHeartTransformDataForPoint(p);
    vec3 grad_def_space = gradHeart(heart_data.p_definition_space);
    vec3 grad_local_swizzled_space =
      grad_def_space / heart_data.animation_scales;
    vec3 n = vec3(
      grad_local_swizzled_space.x,
      grad_local_swizzled_space.z,
      grad_local_swizzled_space.y
    );
    return normalize(n);
  } else {
    const float epsilon = 0.001;
    vec2 e = vec2(epsilon, 0.0);
    vec3 normal = vec3(
      map(p + e.xyy).x - map(p - e.xyy).x,
      map(p + e.yxy).x - map(p - e.yxy).x,
      map(p + e.yyx).x - map(p - e.yyx).x
    );
    return normalize(normal);
  }
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
    if (t > MAX_DIST) break;
  }
  return vec2(MAX_DIST, -1.0);
}

// --- Camera Ray Generation ---
vec3 getRayDirection(vec2 uv, vec3 camPos, vec3 lookAt, float zoom) {
  vec3 f = normalize(lookAt - camPos);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  vec3 u = cross(f, r);
  return normalize(f * zoom + uv.x * r + uv.y * u);
}

// --- PBR Helper Functions ---
// Normal Distribution Function (Trowbridge-Reitz GGX)
float D_GGX(float NdotH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH2 = NdotH * NdotH;
  float denom = NdotH2 * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom);
}

// Geometry Function (Smith's method with Schlick-GGX for direct lighting)
float G_SchlickGGX(float NdotVal, float roughness) {
  float r = roughness + 1.0;
  float k = r * r / 8.0; // k_direct
  return NdotVal / (NdotVal * (1.0 - k) + k);
}

float G_Smith(float NdotV, float NdotL, float roughness) {
  float ggx_v = G_SchlickGGX(NdotV, roughness);
  float ggx_l = G_SchlickGGX(NdotL, roughness);
  return ggx_v * ggx_l;
}

// Fresnel Equation (Schlick's approximation)
vec3 F_Schlick(float cosTheta, vec3 F0) {
  return F0 + (vec3(1.0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// --- PBR Shading Function ---
vec3 PBRShading(
  vec3 p_surf,
  vec3 N_surf,
  vec3 V_eye,
  vec3 albedo_col,
  float metallic_val,
  float roughness_val,
  float ao_val,
  vec3 light_pos,
  vec3 light_intensity
) {
  vec3 L_light = normalize(light_pos - p_surf); // Light direction
  vec3 H_half = normalize(V_eye + L_light); // Halfway vector

  // Dot products (clamped to avoid issues below surface or at grazing angles)
  float NdotL = max(dot(N_surf, L_light), 0.0);
  float NdotV = max(dot(N_surf, V_eye), 0.001); // Epsilon to avoid division by zero if V is parallel
  float NdotH = max(dot(N_surf, H_half), 0.0);
  float VdotH = max(dot(V_eye, H_half), 0.0); // Or LdotH, for Schlick Fresnel

  // Attenuation for point light
  float dist_light_sq = dot(light_pos - p_surf, light_pos - p_surf);
  float attenuation = 1.0 / (dist_light_sq + 1.0); // Add 1.0 to denominator to prevent extreme values
  vec3 radiance = light_intensity * attenuation; // Attenuated light intensity

  // PBR terms
  float D = D_GGX(NdotH, roughness_val);
  float G = G_Smith(NdotV, NdotL, roughness_val);

  vec3 F0 = vec3(0.04); // Base reflectivity for dielectrics (e.g., plastic)
  F0 = mix(F0, albedo_col, metallic_val); // Metals use their albedo color for F0
  vec3 F = F_Schlick(VdotH, F0); // Fresnel reflectance term

  // Specular BRDF (Cook-Torrance)
  vec3 spec_numerator = D * G * F;
  float spec_denominator = 4.0 * NdotV * NdotL + 0.001; // Epsilon for stability
  vec3 specular_contrib = spec_numerator / spec_denominator;

  // Diffuse BRDF (Lambertian, with energy conservation from Fresnel)
  vec3 kS = F; // Amount of light reflected specularly
  vec3 kD = vec3(1.0) - kS; // Amount of light available for diffuse
  kD *= 1.0 - metallic_val; // Metals have no (or very little) diffuse reflection

  vec3 diffuse_contrib = kD * albedo_col / PI;

  // Total direct lighting from one light source
  vec3 direct_lighting =
    (diffuse_contrib + specular_contrib) * radiance * NdotL;

  // Ambient lighting (a very simple placeholder for Image-Based Lighting)
  // Modified to use a blueish tint derived from the sky
  vec3 ambient_sky_tint = vec3(0.05, 0.15, 0.4); // Corresponds to a deep blue (e.g., zenith)
  float ambient_intensity_factor = 0.5; // Adjust overall strength of ambient light
  vec3 ambient_contrib =
    ambient_sky_tint * ambient_intensity_factor * albedo_col * ao_val;

  return ambient_contrib + direct_lighting;
}

// --- Surface Color Calculation (using PBR) ---
vec3 getSurfaceColor(vec3 p, vec3 normal, vec3 V, float materialID) {
  // Default PBR Material properties (if no specific materialID matches)
  vec3 albedo = vec3(0.7);
  float metallic = 0.0;
  float roughness = 0.7;
  float ao = 1.0; // Ambient Occlusion factor (1.0 means no occlusion)

  if (materialID == 1.0) {
    // Heart material
    albedo = vec3(1.0, 0.0, 0.0);
    metallic = 0.1;
    roughness = 0.4;
  }
  // Add other material definitions here with `else if (materialID == X.X)`

  // Light properties for the single animated point light
  float light_x_amplitude = 7.0;
  float light_speed = 0.5;
  float light_x = sin(u_time * light_speed) * light_x_amplitude;
  float light_y = 5.0;
  float light_z = 3.0;
  vec3 lightPos = vec3(light_x, light_y, light_z);

  // Light intensity/color. Tuned higher due to attenuation.
  // Adjust this value if the heart is too bright or too dim.
  vec3 lightRadiance = vec3(200.0);

  return PBRShading(
    p,
    normal,
    V,
    albedo,
    metallic,
    roughness,
    ao,
    lightPos,
    lightRadiance
  );
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
  // Sky Colors (linear space)
  vec3 horizonSkyColor = vec3(0.15, 0.45, 0.85); // Vibrant light blue for horizon
  vec3 zenithSkyColor = vec3(0.05, 0.15, 0.4); // Deeper blue for zenith

  if (materialID_hit > -0.5) {
    vec3 hitPoint = rayOrigin + rayDirection * distToSurface;
    vec3 normal = calcNormal(hitPoint, materialID_hit);
    vec3 V = normalize(rayOrigin - hitPoint); // View vector from hitPoint to camera

    color = getSurfaceColor(hitPoint, normal, V, materialID_hit);

    // Tonemapping and Gamma Correction for PBR output
    color = color / (color + vec3(1.0)); // Reinhard tonemapping (maps HDR to LDR)
    color = pow(color, vec3(1.0 / 2.2)); // Gamma correction (for sRGB display)

    // Fog effect: color blends towards fogColor based on distance
    float fogAmount = smoothstep(10.0, 30.0, distToSurface);
    vec3 fogColor = horizonSkyColor; // Fog takes on the color of the horizon sky
    color = mix(color, fogColor, fogAmount);
  } else {
    // Background color (sky gradient)
    // rayDirection.y goes from -1 (down) to 1 (up / zenith)
    // We want horizonColor at rayDirection.y = 0, zenithColor at rayDirection.y = 1 (or higher)
    // And horizonColor for rayDirection.y < 0
    float t_sky = smoothstep(0.0, 0.8, rayDirection.y); // 0 at horizon, 1 towards zenith (saturates at 0.8 up)
    color = mix(horizonSkyColor, zenithSkyColor, t_sky);

    // Gamma correct background as well for consistency
    color = pow(color, vec3(1.0 / 2.2));
  }

  gl_FragColor = vec4(color, 1.0);
}
