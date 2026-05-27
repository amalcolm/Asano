#pragma once
#pragma managed(push, off)

// common includes
#include <array>
#include <optional>
#include <cmath>
#include <span>
#include <stdexcept>
#include <fstream>

// useful type aliases
using Vec3 = std::array<double, 3>;
using Mat3 = std::array<std::array<double, 3>, 3>;

struct XY {
private:
	double _x;
	double _y;
	double _offsetY;
public:
	inline double x() const { return _x; }
	inline double y() const { return _y + _offsetY; }
    XY() noexcept = default;
	XY(const XY& xy) = default;
	XY(double x, double y, double offsetY) : _x(x), _y(y), _offsetY(offsetY) {}
	XY(const XY& xy, double deltaOffsetY) : _x(xy._x), _y(xy._y), _offsetY(xy._offsetY + deltaOffsetY) {}

	inline void adjustX(double deltaX) { _x += deltaX; }
	inline void adjustOffsetY(double deltaOffsetY) { _offsetY += deltaOffsetY; }

    static void CentreX(std::span<const XY> input, std::span<XY> output) {
        if (input.size() != output.size()) throw std::invalid_argument("Input and output spans must have the same size.");
        if (input.size() == 0) return;
        double meanX = 0.0;
        for (const auto& xy : input)
            meanX += xy.x();
        meanX /= input.size();

		std::copy(input.begin(), input.end(), output.begin());
        for (size_t i = 0; i < input.size(); i++) 
            output[i].adjustX(-meanX);
	}

    inline void dumpRawXY(std::ofstream& os) const { os << _x << "," << _y; }
    
};

struct RegressResult {
    double a{}, b{}, c{};
    bool valid{ false };

	// fit quality metrics
    double r2{ 0.0 };      // coefficient of determination
    double rmse{ 0.0 };    // root-mean-square error 
    double curvature;   // absolute a coefficient (normalized)
    double slopeMean;   // mean slope across segment

	// sets fit quality metrics
	void GetFit(std::span<const XY> data) {
        double ss_tot = 0.0, ss_res = 0.0, sumY = 0.0;
        for (const auto& xy : data)
			sumY += xy.y();
		double meanY = sumY / data.size();

        for (auto& xy : data)
        {
            double y_pred = EvaluateAt(xy.x());
            double diff   = xy.y() - y_pred;    ss_res +=  diff *  diff;
            double dmean  = xy.y() -  meanY;    ss_tot += dmean * dmean;
        }

        rmse = std::sqrt(ss_res / data.size());
        r2 = 1.0 - (ss_res / ss_tot);



        double dx = data.back().x() - data.front().x();
        double slope1 = 2 * a * data.front().x() + b;
        double slope2 = 2 * a * data. back().x() + b;
        
        slopeMean = 0.5 * (slope1 + slope2);
        curvature = fabs(a) * dx * dx;  // dimensionless-ish normalization
	}

    inline double EvaluateAt(double x) const {
        return a * x * x + b * x + c;
	}


	static RegressResult GetLinearResult(double slope, double intercept,   bool valid, std::span<const XY> data) {
		RegressResult r{};
		r.a = 0.0;
		r.b = slope;
		r.c = intercept;

		r.GetFit(data);

		r.valid = valid && r.rmse < 1.0;

		return r;
	}

    static RegressResult GetQuadraticResult(double a, double b, double c,  bool valid, std::span<const XY> data) {
        RegressResult r{};
        r.a = a;
        r.b = b;
        r.c = c;

        r.GetFit(data);


        r.valid = valid && r.rmse < 1.0;
        return r;
	}
};
#pragma managed(pop)
