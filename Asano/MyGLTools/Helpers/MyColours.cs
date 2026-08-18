using Asano.MyGLTools.UserControls;
using OpenTK.Mathematics;
using TheLib;

namespace Asano.MyGLTools.Helpers
{

    public struct MyColour(float r, float g, float b, float a = 1f)
    {
        public static readonly MyColour Unset = Color.Magenta;

        public float r = r > 1.0f ? r / 255f : r;
        public float g = g > 1.0f ? g / 255f : g;
        public float b = b > 1.0f ? b / 255f : b;
        public float a = a > 1.0f ? a / 255f : a;

        public MyColour(Color c) : this(c.R, c.G, c.B, c.A) { }

        public static implicit operator MyColour(Color c) => new(c.R, c.G, c.B, c.A);

        public static readonly List<MyColour> BaseColours = [
            Color.FromArgb(0x4E, 0x79, 0xA7), // Muted Blue
            Color.FromArgb(0xF2, 0x8E, 0x2B), // Orange
            Color.FromArgb(0xE1, 0x57, 0x59), // Red
            Color.FromArgb(0x76, 0xB7, 0xB2), // Teal
            Color.FromArgb(0x59, 0xA1, 0x4F), // Green
            Color.FromArgb(0xED, 0xC9, 0x48), // Yellow
            Color.FromArgb(0xB0, 0x7A, 0xA1), // Purple
            Color.FromArgb(0xFF, 0x9D, 0xA7), // Pink
            Color.FromArgb(0x9C, 0x75, 0x5F), // Brown
            Color.FromArgb(0xBA, 0xB0, 0xAC), // Grey
            Color.FromArgb(0x1F, 0x77, 0xB4), // Bright Blue
            Color.FromArgb(0xFF, 0x7F, 0x0E), // Bright Orange
            Color.FromArgb(0x2C, 0xA0, 0x2C), // Bright Green
            Color.FromArgb(0xD6, 0x27, 0x28), // Bright Red
            Color.FromArgb(0x94, 0x67, 0xBD), // Bright Purple
            Color.FromArgb(0x8C, 0x56, 0x4B), // Dark Brown
            Color.FromArgb(0xE3, 0x77, 0xC2), // Bright Pink
            Color.FromArgb(0x7F, 0x7F, 0x7F), // Medium Grey
            Color.FromArgb(0xBC, 0xBD, 0x22), // Olive Green
            Color.FromArgb(0x17, 0xBE, 0xCF)  // Cyan
        ];

        public static readonly MyColour White   = Color.White;
        public static readonly MyColour Red     = Color.Red;
        public static readonly MyColour Green   = Color.Green;
        public static readonly MyColour Blue    = Color.Blue;
        public static readonly MyColour Yellow  = Color.Yellow;
        public static readonly MyColour Magenta = Color.Magenta;
        public static readonly MyColour Cyan    = Color.Cyan;
        public static readonly MyColour Black   = Color.Black;
        public static readonly MyColour Transparent = new(0, 0, 0, 0);

        public static MyColour GetFieldColour(MyChart.DataSelectorInfo info)
            => GetFieldColour(info.Selector, info.Channel);

        public static MyColour GetFieldColour(FieldEnum? selector, int channel)
        {
            if (selector.HasValue == false)
                return BaseColours[channel];

            if (channel > 0)
                return BaseColours[channel];

            return selector.Value switch
            {
                FieldEnum.C0             => BaseColours[0],
                FieldEnum.Mid            => BaseColours[1],
                FieldEnum.Top            => BaseColours[2], 
                FieldEnum.Bot            => BaseColours[3],
                FieldEnum.Offset         => BaseColours[4],
                FieldEnum.Gain           => BaseColours[5],
                FieldEnum.Sensor1        => BaseColours[6],
                FieldEnum.Sensor2        => BaseColours[7],
                FieldEnum.Timestamp      => BaseColours[8],

                FieldEnum.rawSensor1     => BaseColours[6], // Reuse sensor colours for raw values
                FieldEnum.rawSensor2     => BaseColours[7],
                _                        => Color.Magenta
            };
        }

        public static MyColour GetEventColour(EventKind kind)
        {
            return kind switch
            {
                EventKind.NONE               => Black,

                EventKind.A2D_DATA_READY     => Cyan.Darken(0.2),
                EventKind.A2D_READ_START     => Cyan.Darken(0.8),
                EventKind.A2D_READ_COMPLETE  => Cyan.Darken(0.6),

                EventKind.HW_UPDATE_START    => Blue.Darken(0.8),
                EventKind.HW_UPDATE_COMPLETE => Blue.Darken(0.6),

                EventKind.SPI_DMA_START      => Red.Darken(0.8),
                EventKind.SPI_DMA_COMPLETE   => Red.Darken(0.6),

                _ => Color.Magenta
            };
        }

        private static int _colourIndex = 0;

        public readonly MyColour Darken(double factor)
        {
            float f = (float)factor;

            return new MyColour(
                MathF.Max(0, r * f),
                MathF.Max(0, g * f),
                MathF.Max(0, b * f),
                a
            );
        }

        public readonly Color ToColor()
        {
            return Color.FromArgb(
                (int)(a * 255),
                (int)(r * 255),
                (int)(g * 255),
                (int)(b * 255)
            );
        }

        public static MyColour GetNextColour()
        {
            _colourIndex %= BaseColours.Count;
            return BaseColours[_colourIndex++];
        }

        public static void Reset()
        {
            _colourIndex = 0;
        }
    }
}
