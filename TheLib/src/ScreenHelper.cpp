#include "ScreenHelper.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>
#include <cmath>
#include <cwchar>
#include <string>
#include <vector>

#pragma comment(lib, "user32.lib")

#pragma managed(push, off)

namespace NativeScreenHelper
{
	static constexpr double FALLBACK_REFRESH_RATE = 60.0;

	static bool TryGetRefreshRate(const DISPLAYCONFIG_RATIONAL& ratio, double& refreshRate)
	{
		refreshRate = 0.0;

		if (ratio.Numerator == 0 || ratio.Denominator == 0)
			return false;

		refreshRate = static_cast<double>(ratio.Numerator) / static_cast<double>(ratio.Denominator);
		return std::isfinite(refreshRate) && refreshRate > 0.0;
	}

	static bool TryGetMonitorDeviceName(int x, int y, std::wstring& deviceName)
	{
		POINT point{ x, y };
		HMONITOR monitor = MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST);
		if (monitor == nullptr)
			return false;

		MONITORINFOEXW monitorInfo{};
		monitorInfo.cbSize = sizeof(monitorInfo);

		if (!GetMonitorInfoW(monitor, &monitorInfo))
			return false;

		deviceName = monitorInfo.szDevice;
		return !deviceName.empty();
	}

	static bool TryGetSourceDeviceName(const DISPLAYCONFIG_PATH_SOURCE_INFO& sourceInfo, std::wstring& deviceName)
	{
		DISPLAYCONFIG_SOURCE_DEVICE_NAME sourceName{};
		sourceName.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
		sourceName.header.size = sizeof(sourceName);
		sourceName.header.adapterId = sourceInfo.adapterId;
		sourceName.header.id = sourceInfo.id;

		if (DisplayConfigGetDeviceInfo(&sourceName.header) != ERROR_SUCCESS)
			return false;

		deviceName = sourceName.viewGdiDeviceName;
		return !deviceName.empty();
	}

	static bool TryGetTargetModeRefreshRate(
		const DISPLAYCONFIG_PATH_INFO& path,
		const std::vector<DISPLAYCONFIG_MODE_INFO>& modes,
		UINT32 modeCount,
		double& refreshRate)
	{
		UINT32 modeIndex = path.targetInfo.modeInfoIdx;
		if (modeIndex == DISPLAYCONFIG_PATH_MODE_IDX_INVALID || modeIndex >= modeCount || modeIndex >= modes.size())
			return false;

		const DISPLAYCONFIG_MODE_INFO& mode = modes[modeIndex];
		if (mode.infoType != DISPLAYCONFIG_MODE_INFO_TYPE_TARGET)
			return false;

		return TryGetRefreshRate(mode.targetMode.targetVideoSignalInfo.vSyncFreq, refreshRate);
	}

	static bool TryGetDisplayConfigRefreshRate(const std::wstring& monitorDeviceName, double& refreshRate)
	{
		refreshRate = 0.0;

		for (int attempt = 0; attempt < 3; attempt++)
		{
			UINT32 pathCount = 0;
			UINT32 modeCount = 0;
			LONG result = GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &pathCount, &modeCount);

			if (result != ERROR_SUCCESS || pathCount == 0)
				return false;

			std::vector<DISPLAYCONFIG_PATH_INFO> paths(pathCount);
			std::vector<DISPLAYCONFIG_MODE_INFO> modes(modeCount);

			result = QueryDisplayConfig(
				QDC_ONLY_ACTIVE_PATHS,
				&pathCount,
				paths.data(),
				&modeCount,
				modeCount == 0 ? nullptr : modes.data(),
				nullptr);

			if (result == ERROR_INSUFFICIENT_BUFFER)
				continue;

			if (result != ERROR_SUCCESS)
				return false;

			for (UINT32 i = 0; i < pathCount && i < paths.size(); i++)
			{
				const DISPLAYCONFIG_PATH_INFO& path = paths[i];
				if ((path.flags & DISPLAYCONFIG_PATH_ACTIVE) == 0)
					continue;

				std::wstring sourceDeviceName;
				if (!TryGetSourceDeviceName(path.sourceInfo, sourceDeviceName))
					continue;

				if (_wcsicmp(sourceDeviceName.c_str(), monitorDeviceName.c_str()) != 0)
					continue;

				if (TryGetRefreshRate(path.targetInfo.refreshRate, refreshRate))
					return true;

				if (TryGetTargetModeRefreshRate(path, modes, modeCount, refreshRate))
					return true;
			}

			return false;
		}

		return false;
	}

	static bool TryGetDisplaySettingsRefreshRate(const std::wstring& monitorDeviceName, double& refreshRate)
	{
		refreshRate = 0.0;

		DEVMODEW devMode{};
		devMode.dmSize = sizeof(devMode);

		if (!EnumDisplaySettingsW(monitorDeviceName.c_str(), ENUM_CURRENT_SETTINGS, &devMode))
			return false;

		refreshRate = static_cast<double>(devMode.dmDisplayFrequency);
		return refreshRate > 0.0;
	}

	static double GetCurrentRefreshRateAtPoint(int x, int y)
	{
		std::wstring monitorDeviceName;
		if (!TryGetMonitorDeviceName(x, y, monitorDeviceName))
			return FALLBACK_REFRESH_RATE;

		double refreshRate = 0.0;
		if (TryGetDisplayConfigRefreshRate(monitorDeviceName, refreshRate))
			return refreshRate;

		if (TryGetDisplaySettingsRefreshRate(monitorDeviceName, refreshRate))
			return refreshRate;

		return FALLBACK_REFRESH_RATE;
	}
}

#pragma managed(pop)

namespace TheLib
{
	double ScreenHelper::GetCurrentRefreshRateAtPoint(int x, int y)
	{
		return NativeScreenHelper::GetCurrentRefreshRateAtPoint(x, y);
	}
}
