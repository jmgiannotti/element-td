import * as Phaser from 'phaser';

const fragShader = `
precision mediump float;

uniform float time;
uniform vec2 resolution;
uniform vec2 uCenter;
uniform float uRadius;

void main(void) {
    vec2 diff = gl_FragCoord.xy - uCenter;
    float d = length(diff);
    float normD = d / max(1.0, uRadius);
    
    if (normD > 1.0) {
        discard;
    }

    float angle = atan(diff.y, diff.x);
    
    // Rotating swirling energy tendrils (vortices)
    float swirl1 = sin(angle * 3.0 + time * 3.5 - normD * 12.0);
    float swirl2 = cos(angle * 4.0 - time * 4.2 + normD * 16.0);
    float swirl = (swirl1 + swirl2) * 0.5;
    
    // Pulsing breathing rhythm
    float pulse = 0.85 + 0.15 * sin(time * 4.0);
    
    // SOUL palette colors: deep violet, bright violet, celestial cyan, core white
    vec3 colDeep = vec3(0.35, 0.10, 0.70); // #5B1E94
    vec3 colMid  = vec3(0.70, 0.40, 1.00); // #B388FF
    vec3 colCyan = vec3(0.40, 0.85, 1.00); // #74D2F5
    vec3 colCore = vec3(0.95, 0.92, 1.00);
    
    // Radial glow profile
    float glow = smoothstep(1.0 * pulse, 0.05, normD);
    float ring = smoothstep(0.12, 0.0, abs(normD - (0.55 + 0.1 * sin(time * 5.0))));
    
    // Color composition
    vec3 color = mix(colDeep, colMid, glow);
    color += colCyan * swirl * 0.45 * glow;
    color += colCyan * ring * 0.6;
    color += colCore * smoothstep(0.35, 0.0, normD) * 0.8;
    
    float alpha = clamp(glow * 0.85 + ring * 0.4 + smoothstep(0.3, 0.0, normD) * 0.6, 0.0, 0.95);
    alpha *= (1.0 - smoothstep(0.85, 1.0, normD)); // soft edge fade
    
    gl_FragColor = vec4(color * alpha, alpha);
}
`;

let manaBaseShader = null;

export function getManaBaseShader() {
    if (!manaBaseShader) {
        manaBaseShader = new Phaser.Display.BaseShader('mana_aura_shader', fragShader, null, {
            uCenter: { type: '2f', value: [0, 0] },
            uRadius: { type: '1f', value: 24.0 }
        });
    }
    return manaBaseShader;
}
