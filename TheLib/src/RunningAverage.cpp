#include "RunningAverage.h"

namespace TheLib
{

        // Deterministic cleanup
    RunningAverage::~RunningAverage() { this->!RunningAverage(); }

    // Finalizer (in case user forgets to Dispose)
    RunningAverage::!RunningAverage() { delete _p; _p = nullptr; }


    RunningAverage::RunningAverage(size_t windowSize)
    {
	    _p = new CRunningAverageMinMax(windowSize);
    }

    void RunningAverage::Reset(size_t windowSize)
    {
        if (!_p) throw gcnew ObjectDisposedException("RunningAverage");
        _p->Reset(windowSize);
    }

    void RunningAverage::Add(double value)
    {
        if (!_p) throw gcnew ObjectDisposedException("RunningAverage");
        _p->Add(value);
    }

    double RunningAverage::Average::get()
    {
        if (!_p) throw gcnew ObjectDisposedException("RunningAverage");
        return _p->GetAverage();
	}

    double RunningAverage::Min::get()
    {
        if (!_p) throw gcnew ObjectDisposedException("RunningAverage");
        return _p->GetMin();
    }
    
    double RunningAverage::Max::get()
    {
        if (!_p) throw gcnew ObjectDisposedException("RunningAverage");
        return _p->GetMax();
	}

    uint32_t RunningAverage::Count::get()
    {
        if (!_p) throw gcnew ObjectDisposedException("RunningAverage");
        return static_cast<uint32_t>(_p->GetCount());
	}
} // namespace TheLib
