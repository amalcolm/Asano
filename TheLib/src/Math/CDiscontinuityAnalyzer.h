#pragma once
#pragma managed(push, off)

#include "CTypes.h"
#include "CQuadRegress.h"
#include <span>
#include <cmath>

class CDiscontinuityAnalyzer
{
public:
    struct Result {
        bool valid{ false };

        // Fit results from each end
        RegressResult left;
        RegressResult right;

        std::span<const XY> dataSpan;   // original data span analyzed

        // Discontinuity metrics
        double deltaY        { 0.0 };   // offset difference at junction
        double deltaSlope    { 0.0 };   // slope mismatch
        double deltaCurvature{ 0.0 };   // curvature mismatch
        double score         { 0.0 };   // optional combined score

    	double deltaX        { 0.0 };   // input x - output x
		double centreX       { 0.0 };   // centre x of the data window

        // Optional helper for debugging
        std::string ToString() const;

        Result(std::span<const XY> span) : dataSpan(span) {}
    };

    // Perform analysis on a given data window
    static Result Analyze(std::span<const XY> data, size_t edgeCount = 0) noexcept;

	static void DoTest();
	static XY GetTestValue();
};


#pragma managed(pop)
