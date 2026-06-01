#include "MyTimer.h"
#include <cmath>
#include <limits>

namespace TheLib
{


	MyTimer::MyTimer(double period_S) {
		SetPeriod(period_S);

		uint64_t startTick = CTimerBase::getCurrentTick();
		Thread::SpinWait(64);
		uint64_t endTick = CTimerBase::getCurrentTick();

		m_minSpinTicks = (endTick - startTick) * 2;
		if (m_minSpinTicks == 0)
			m_minSpinTicks = 1;
	}


	
	void MyTimer::SetPeriod(double period_S)
	{
		if (!std::isfinite(period_S) || period_S <= 0.0)
			throw gcnew System::ArgumentOutOfRangeException("period_S", "Period must be a positive finite value.");

		C64bitTimer nextTimer = C64bitTimer::From_S(period_S);
		nextTimer.setPeriodic(true);

		C64bitTimer* oldTimer = m_baseTimer;

		m_baseTimer = new C64bitTimer(nextTimer);

		delete oldTimer;
	}


	void MyTimer::Wait(CancellationToken cancellationToken)
	{
		while (cancellationToken.IsCancellationRequested == false)
		{
			if (m_baseTimer->waiting() == false)
				return;

			if (m_baseTimer->getRemainingTicks() < static_cast<int64_t>(m_minSpinTicks))
				Thread::SpinWait(64);
		}
	}

}
