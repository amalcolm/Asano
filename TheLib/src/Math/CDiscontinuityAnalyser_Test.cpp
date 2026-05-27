#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include "CDiscontinuityAnalyzer.h"
#include <iostream>
#include <random>
#include <vector>


constexpr size_t N = 10;       // total samples
constexpr size_t EDGE = 4;     // edge regression window
constexpr double noiseLevel = 0.1;  // random noise amplitude

static double GetTime()
{
	static double frequency{};
	static LARGE_INTEGER startCounter{};
	// read CPU cycles and divide by frequency to get time in seconds
	
    if (frequency == 0) {
        LARGE_INTEGER freq{};
        QueryPerformanceFrequency(&freq);
        frequency = static_cast<double>(freq.QuadPart);
    }
	LARGE_INTEGER counter{};
	QueryPerformanceCounter(&counter);

    if (startCounter.QuadPart == 0)
		startCounter = counter;

	return (counter.QuadPart - startCounter.QuadPart) / frequency;
}


XY CDiscontinuityAnalyzer::GetTestValue()
{
    // Set up RNG for noise
    static std::mt19937 rng(1234);
    static std::normal_distribution<double> noise(0.0, noiseLevel);
    static int i = 0;
	static const int period = 50;

    double x = GetTime();
    double y = (i % period)/5.0 + noise(rng);
    if ((i % period) >= period / 2)
        y += 50.0; // discontinuity

    i++;

	return { x, y, 0.0 };
}



void CDiscontinuityAnalyzer::DoTest()
{
    std::vector<XY> samples;
    samples.reserve(N);

    // Generate test signal:
    // y = x + noise for first half, y = x + 50 + noise for second half
    for (size_t i = 0; i < N; ++i)
        samples.push_back(GetTestValue());

    // Analyze the full window
    auto result = Analyze(samples, EDGE);

    // Show output
    std::cout << "=== Discontinuity Test ===\n";
    std::cout << "Samples: " << N << "  EdgeCount: " << EDGE << "\n";
    std::cout << result.ToString() << "\n\n";

    if (result.valid)
    {
        std::cout << "Left fit:  slope=" << result. left.b << "  intercept=" << result. left.c << "\n";
        std::cout << "Right fit: slope=" << result.right.b << "  intercept=" << result.right.c << "\n";
    }


}


