#pragma once
#pragma managed(push, off)

// QuadraticRegression.hpp
#pragma once
#include "CMatrix3x3.h"
#include "CLinearRegress.h"
#include <algorithm>

class CQuadRegress {
public:

    static RegressResult Fit(std::span<const XY> span) noexcept {
        const size_t n = span.size();
        if (n < 3)
            return {};

        // First pass: find min/max x
        double min_x = span[0].x(), max_x = span[span.size()-1].x();
        
        double range = max_x - min_x;
        if (range < 1e-10)  // essentially constant x => can't fit meaningful quadratic
            return CLinearRegress::Fit(span);
        double mid = (min_x + max_x) / 2.0;
        double hr = range / 2.0;  // half-range, so normalized x in [-1, 1]

        // Second pass: accumulate sums in normalized coordinates
        double sum_xn = 0.0;
        double sum_xn2 = 0.0;
        double sum_xn3 = 0.0;
        double sum_xn4 = 0.0;
        double sum_y = 0.0;
        double sum_xny = 0.0;
        double sum_xn2y = 0.0;

        for (const auto& pt : span) {
            double xi = pt.x();
            double yi = pt.y();

            double xn = (xi - mid) / hr;
            double xn2 = xn * xn;
            double xn3 = xn2 * xn;
            double xn4 = xn2 * xn2;

            sum_xn += xn;
            sum_xn2 += xn2;
            sum_xn3 += xn3;
            sum_xn4 += xn4;
            sum_y += yi;
            sum_xny += xn * yi;
            sum_xn2y += xn2 * yi;
        }

        Mat3 A = { {
            { sum_xn4, sum_xn3, sum_xn2 },
            { sum_xn3, sum_xn2, sum_xn  },
            { sum_xn2, sum_xn,  static_cast<double>(n) }
        } };
        Vec3 B = { sum_xn2y, sum_xny, sum_y };

        auto solved = CMatrix3x3::TrySolve(A, B);
        if (solved) {
            double p = solved->at(0);  // coeff of xn^2
            double q = solved->at(1);  // coeff of xn
            double r = solved->at(2);  // constant

            double hr2 = hr * hr;
            double a = p / hr2;                                   // quadratic coeff
            double b = (q / hr) - 2.0 * mid * a;                   // linear coeff
            double c = r - mid * (q / hr) + mid * mid * a;         // constant

            return RegressResult::GetQuadraticResult(a, b, c, true, span);
        }
        else {
            return CLinearRegress::Fit(span);  // still fallback if somehow singular
        }
    }
};

#pragma managed(pop)