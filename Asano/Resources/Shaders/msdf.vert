#version 330 core

// Input vertex data, different for each vertex.
layout(location = 0) in vec2 aPosition; // Vertex position in screen-space
layout(location = 1) in vec2 aTexCoord; // Texture coordinate for the font atlas

// An output variable that will be passed to the fragment shader.
// OpenGL interpolates this value between vertices.
out vec2 vTexCoord;


uniform mat4 uModel;   // per-draw (translate/scale/rotate)
uniform mat4 uProj;    // per-resize (orthographic pixels->clip)

void main()
{
    // Pass the texture coordinate straight through to the fragment shader.
    vTexCoord = aTexCoord;

    // Standard vertex shader operation: transform the vertex position.
    gl_Position = uProj * uModel * vec4(aPosition, 0.0, 1.0);
}
