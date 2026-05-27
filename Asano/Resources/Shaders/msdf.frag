#version 330 core

// Input from the vertex shader, interpolated for each fragment.
in vec2 vTexCoord;

// Output color for the current fragment.
out vec4 FragColor;

// Uniforms set from your C# code.
uniform sampler2D uTexture;  // The MSDF font atlas texture.
uniform vec4 uColor;         // The desired color of the text.

// This function finds the median of three values. It's the core of MSDF rendering.
// By taking the median, we get a more stable distance value than using a single channel.
float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

void main()
{
    // Sample the texture at the given coordinate to get the distance values.
    vec3 sample = texture(uTexture, vTexCoord).rgb;

    // Calculate the median of the R, G, and B channels. This gives us a single signed distance value.
    float sigDist = median(sample.r, sample.g, sample.b);

    // The 'screen-space' distance to the edge. 
    // NOTE: We use (0.5 - sigDist) because this particular font atlas appears to use an
    // inverted distance convention (values < 0.5 are inside the glyph).
    float screenPxDistance = 0.5 - sigDist;

    // Use fwidth to determine the amount of smoothing based on the screen pixel density.
    // This creates anti-aliasing that looks good at any scale.
    float screenPxRange = fwidth(screenPxDistance);
    
    // Use smoothstep to calculate the opacity. It creates a smooth transition from transparent
    // to opaque around the glyph's edge.
    float opacity = smoothstep(-screenPxRange, screenPxRange, screenPxDistance);

    // --- NON-PREMULTIPLIED ALPHA ---
    // The final color is the desired text color, with its alpha multiplied by our calculated opacity.
    FragColor = vec4(uColor.rgb, uColor.a * opacity);
}
