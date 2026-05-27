#pragma once

#pragma managed(push, off)

#include "CTypes.h"
#include "CDiscontinuityAnalyzer.h"
#include <span>
#include <vector>

#include <fstream>

class CDiscontinuityFixer {
	public:
		static inline constexpr bool   ENABLE_DEBUG_LOG   = false;

	private:
		static inline constexpr size_t ZFIXER_BUFFER_SIZE =  4096;
		static inline constexpr size_t ZFIXER_WINDOW_SIZE =    10;
		static inline constexpr size_t ZFIXER_WINDOW_EDGE =     4;


	public:
		CDiscontinuityFixer();
	   ~CDiscontinuityFixer();
		struct Result {
			public:
			bool valid{ false };

			bool changed{ false };
			XY output{ 0.0, 0.0, 0.0 };

			std::span<const XY> dataSpan;
			RegressResult left;
			RegressResult right;

			// Discontinuity metrics
			double deltaY        { 0.0 };       // offset difference at junction
			double deltaSlope    { 0.0 };       // slope mismatch
			double deltaCurvature{ 0.0 };       // curvature mismatch
			double score         { 0.0 };       // optional combined score

			double deltaX        { 0.0 };       // input x - output x
			double centreX       { 0.0 };       // centre x of the data window
			Result() = default;

			Result( const CDiscontinuityAnalyzer::Result& r ) :
				valid          ( r.valid          ),
				dataSpan	   ( r.dataSpan       ),
				left           ( r.left           ),
				right          ( r.right          ),
				deltaY         ( r.deltaY         ),
				deltaSlope     ( r.deltaSlope     ),
				deltaCurvature ( r.deltaCurvature ),
				score          ( r.score          ),

				deltaX         ( r.deltaX         ),
				centreX        ( r.centreX        )
			{}

			static Result FromFail(double x, double y, double offsetY) {
				Result r{};  // all false/zero
				r.output = XY(x, y, offsetY);
				return r;
			}

			static Result FromFail(const XY& xy) {
				Result r{};  // all false/zero	
				r.output = xy;
				return r;
			}

			static void WriteDebugHeader(std::ofstream& os) {
				if (os.is_open() == false) return;
				if (ENABLE_DEBUG_LOG)
					os << "LedgeX1,LedgeX2,LedgeX3,LedgeX4, LedgeY1,LedgeY2,LedgeY3,LedgeY4, ,RedgeX1,RedgeX2,RedgeX3,RedgeX4, RedgeY1,RedgeY2,RedgeY3,RedgeY4, ,La,Lb,Lc, Ra,Rb,rC, ,Lr2,Lrmse, Rr2,Rrmse, ,LsMean,LCurv, RsMean,RCurv, ,Valid?,Score,, Changed,deltaY, ,rawX,rawY, ,x,y\n";
				else
					os << "LOGGING DISABLED\n";
			}

			void WriteDebug(std::ofstream& os) const {
				if ((os.is_open() && ENABLE_DEBUG_LOG) == false) return;
				// left edge data
				for (size_t i = 0; i < ZFIXER_WINDOW_EDGE; i++) os << dataSpan[i].x() << ",";
				for (size_t i = 0; i < ZFIXER_WINDOW_EDGE; i++) os << dataSpan[i].y() << ",";

				os << ",";
				// right edge data
				for (size_t i = dataSpan.size() - ZFIXER_WINDOW_EDGE; i < dataSpan.size(); i++) os << dataSpan[i].x() << ",";
				for (size_t i = dataSpan.size() - ZFIXER_WINDOW_EDGE; i < dataSpan.size(); i++) os << dataSpan[i].y() << ",";

				os << ",";
				// curves
				os <<  left.a << "," <<  left.b << "," <<  left.c << ",";
				os << right.a << "," << right.b << "," << right.c << ",";

				os << ",";
				// fit metrics
				os <<  left.r2 << "," <<  left.rmse << ","
				   << right.r2 << "," << right.rmse << ",";

				os << ",";
				// slopes/curvatures
				os <<  left.slopeMean << "," <<  left.curvature << ","
				   << right.slopeMean << "," << right.curvature << ",";

				os << ",";
				// overall score
				os << (valid ? "TRUE" : "FALSE") << ",";
				os << score << ",";

				os << ",";
				// output info
				os << (changed ? "TRUE" : "FALSE") << ",";
				os << deltaY << ",";

				os << ",";
				// final output point
				output.dumpRawXY(os); os << ", ,";
				os << output.x() << "," << output.y() << "\n";
				
			}
		};


		Result Fix(double x, double y) noexcept;
		void   Predict(double& x, double& y) noexcept;
		Result Process(std::span<XY> workingData, CDiscontinuityAnalyzer::Result analysis) noexcept;

	private:
		CDiscontinuityAnalyzer::Result* _lastAnalysis;
		double lastY{ 0.0 };

		std::vector<XY> m_data{};

		double currentOffsetY{ 0.0 };
		std::ofstream debugFile;

};

#pragma managed(pop)