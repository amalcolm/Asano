#pragma once

#include "C64bitTimer.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
using namespace System::Threading;


namespace TheLib
{
	public ref class MyTimer
	{
	public:
		MyTimer(double period_S);
		~MyTimer() { this->!MyTimer(); }
		!MyTimer() { delete m_baseTimer; m_baseTimer = nullptr; }

		inline void Restart() { m_baseTimer->reset(); }

		void Wait(CancellationToken cancellationToken);

		property double Period { double get() { return m_baseTimer->getPeriod_S(); } void set(double value) { SetPeriod(value); } };
		property double Frequency { double get() { return 1.0 / Period; } };
		property double ElapsedSeconds { double get() { return m_baseTimer->getSeconds(); } };
		property bool Passed { bool get() { return m_baseTimer->passed(); } };
		property bool Waiting { bool get() { return m_baseTimer->waiting(); } };

		static MyTimer^ From_S (double period_S ) { return gcnew MyTimer(period_S             ); };
		static MyTimer^ From_mS(double period_mS) { return gcnew MyTimer(period_mS /    1000.0); };
		static MyTimer^ From_uS(double period_uS) { return gcnew MyTimer(period_uS / 1000000.0); };

	private:
		void SetPeriod(double period_S);

		C64bitTimer* m_baseTimer = nullptr;


		uint64_t m_minSpinTicks = 0;


	};

};
