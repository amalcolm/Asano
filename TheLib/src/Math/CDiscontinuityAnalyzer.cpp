#include "CDiscontinuityAnalyzer.h"
#include <sstream>

CDiscontinuityAnalyzer::Result CDiscontinuityAnalyzer::Analyze(std::span<const XY> data, size_t edgeCount) noexcept
{
    Result r(data);

    if (edgeCount == 0)
		edgeCount = data.size() / 2 - 1; // default to half the data, with one/two points in the center

    if (data.size() < 2 * edgeCount)
        return r; // invalid / insufficient data

    std::span<const XY>  leftEdge(data.data(), edgeCount);
    std::span<const XY> rightEdge(data.data() + data.size() - edgeCount, edgeCount);

    if (data[data.size()-1].y() - data[data.size()-2].y() > 40)
		r.score = 0.0;

    if (rightEdge.front().y() - leftEdge.back().y() > 40)
        r.score = 0.0;

    // Fit both ends
    r. left = CLinearRegress::Fit( leftEdge);
    r.right = CLinearRegress::Fit(rightEdge);

    if (!r.left.valid || !r.right.valid)
        return r; // fallback - can’t compare

    
    // Evaluate each quadratic at the midpoint between segments
    double xMid = 0.5 * (leftEdge.back().x() + rightEdge.front().x());
    
    double yL = r. left.EvaluateAt(xMid);
    double yR = r.right.EvaluateAt(xMid);

    r.deltaY         = yR - yL;
    r.deltaSlope     = r.right.slopeMean - r.left.slopeMean;
    r.deltaCurvature = r.right.curvature - r.left.curvature;

    constexpr double kSlopeWeight = 0.05;
    constexpr double kCurveWeight = 0.01;

    // score is positive when deltaY is greater than threshold
    r.score = std::abs(r.deltaY) - (kSlopeWeight * std::abs(r.deltaSlope) + kCurveWeight * std::abs(r.deltaCurvature));
    r.valid = true;
    return r;
}

// Optional for debugging/logging
std::string CDiscontinuityAnalyzer::Result::ToString() const
{
    std::ostringstream oss;
    if (!valid)
        return "Invalid fit";

    oss << "dY=" << deltaY
        << " dSlope=" << deltaSlope
        << " dCurv=" << deltaCurvature
        << " Score=" << score;
    return oss.str();
}
