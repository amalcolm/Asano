// Sleep.cpp
// Build in a C++/CLI project with /clr.

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX

#include <windows.h>
#include <cmath>
#include <limits>

using namespace System;

#pragma managed(push, off)

namespace NativeTiming
{
    using NtStatus = LONG;

    static constexpr NtStatus STATUS_SUCCESS_VALUE              = static_cast<NtStatus>(0x00000000ul);
    static constexpr NtStatus STATUS_ENTRYPOINT_NOT_FOUND_VALUE = static_cast<NtStatus>(0xC0000139ul);
    static constexpr NtStatus STATUS_INVALID_PARAMETER_VALUE    = static_cast<NtStatus>(0xC000000Dul);

    using NtDelayExecutionFn = NtStatus(NTAPI*)(BOOLEAN Alertable, PLARGE_INTEGER DelayInterval);

    class NtSleeper final
    {
    private:
		NtSleeper() = delete;

        static inline NtDelayExecutionFn _ntDelayExecution = nullptr;
		static inline double _maxDelayTicks = static_cast<double>((std::numeric_limits<LONGLONG>::max)());
        
    public:
        static NtStatus DelayMS(double ms, bool alertable) noexcept
        {
            if (_ntDelayExecution == nullptr)   return STATUS_ENTRYPOINT_NOT_FOUND_VALUE;
			if (!std::isfinite(ms) || ms < 0.0) return STATUS_INVALID_PARAMETER_VALUE;
            
            if (ms == 0.0)
            {
                // Equivalent-ish to Sleep(0): yield remainder of quantum.
                ::Sleep(0);
                return STATUS_SUCCESS_VALUE;
            }

            const double ticksPerMillisecond = 10000.0; // 100 ns units

            // NtDelayExecution expects:
            //   negative = relative interval
            //   positive = absolute system time
            //
            // Use ceil so tiny positive values do not round down to zero.
            const double requestedTicks = std::ceil(ms * ticksPerMillisecond);

            if (requestedTicks >= _maxDelayTicks) return STATUS_INVALID_PARAMETER_VALUE;

            LONGLONG ticks = static_cast<LONGLONG>(requestedTicks);

            if (ticks < 1) ticks = 1;

            LARGE_INTEGER interval{ 0 };
            interval.QuadPart = -ticks;

            return _ntDelayExecution(alertable ? TRUE : FALSE, &interval);
        }

        static inline bool IsSuccess(NtStatus status) noexcept { return status >= 0; }

        static void init() noexcept
        {
            HMODULE ntdll = ::GetModuleHandleW(L"ntdll.dll");

            if (ntdll == nullptr) ntdll = ::LoadLibraryW(L"ntdll.dll");

            if (ntdll == nullptr) return;

            _ntDelayExecution = reinterpret_cast<NtDelayExecutionFn>( ::GetProcAddress(ntdll, "NtDelayExecution") );
        }
    };
}

#pragma managed(pop)

namespace TheLib
{
    public ref class Sleep abstract sealed
    {
		static Sleep() { NativeTiming::NtSleeper::init(); }

    public:
        static void ms(double ms)                 { DelayMS(ms, false);     }
        static void ms(double ms, bool alertable) { DelayMS(ms, alertable); }

    private:
        static void DelayMS(double ms, bool alertable)
        {
            if (Double::IsNaN(ms) || Double::IsInfinity(ms)) throw gcnew ArgumentOutOfRangeException( "ms", "Delay must be a finite number.");
            if (ms < 0.0)                                    throw gcnew ArgumentOutOfRangeException( "ms", "Delay must not be negative.");

            NativeTiming::NtStatus status = NativeTiming::NtSleeper::DelayMS(ms, alertable);

            if (!NativeTiming::NtSleeper::IsSuccess(status)) throw gcnew InvalidOperationException( String::Format("NtDelayExecution failed with NTSTATUS 0x{0:X8}.", static_cast<UInt32>(status)));
        }
    };
}