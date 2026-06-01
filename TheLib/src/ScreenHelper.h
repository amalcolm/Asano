#pragma once

namespace TheLib
{
	public ref class ScreenHelper abstract sealed
	{
	public:
		static double GetCurrentRefreshRateAtPoint(int x, int y);
	};
}
