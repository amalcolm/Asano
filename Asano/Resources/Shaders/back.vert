#version 330 core
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTexCoord;

out vec2 TexCoords;

uniform mat4 uTransform;

void main()
{
    gl_Position = uTransform * vec4(aPosition, 0.0, 1.0);
    TexCoords = aTexCoord;
}