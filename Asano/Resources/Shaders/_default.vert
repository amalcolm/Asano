// simple.vert
#version 330 core

layout(location = 0) in vec4 aPosition;   // Vertex.Position
layout(location = 2) in vec4 aColor;      // Vertex.Colour

uniform mat4 uTransform;

out vec4 vColor;

void main()
{
    gl_Position = uTransform * vec4(aPosition.xyz, 1.0);
    vColor = aColor;
}
