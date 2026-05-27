#pragma once
#pragma managed(push, off)

#include "CTypes.h"
#include <span>
#include <numeric>
#include <stdexcept>

class CLinearRegress {
public:
    
    static RegressResult Fit(std::span<const XY> p) noexcept {
        const size_t n = p.size();
        if (n < 2)
            return {};

        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (size_t i = 0; i < n; ++i) {
            sumX  += p[i].x();
            sumY  += p[i].y();
            sumXY += p[i].x() * p[i].y();
            sumX2 += p[i].x() * p[i].x();
        }

        const double denom = n * sumX2 - sumX * sumX;
        if (std::abs(denom) < 1e-12)
            return {};

        const double slope = (n * sumXY - sumX * sumY) / denom;
        const double intercept = (sumY - slope * sumX) / n;

        return RegressResult::GetLinearResult( slope, intercept, true, p );
    }
};

#pragma managed(pop)