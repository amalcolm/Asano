#version 330 core
in vec2 TexCoords;
out vec4 FragColor;

uniform sampler2D uTexture;
uniform vec4 uColor;  // not used //

void main()
{
    vec4 tColour = texture(uTexture, TexCoords);
    FragColor = tColour;
}