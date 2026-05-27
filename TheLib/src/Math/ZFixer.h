#pragma once

#include "CDiscontinuityFixer.h"
#include "CDiscontinuityAnalyzer.h"

using namespace System::Collections::Generic;
using namespace System::Runtime::CompilerServices;
using namespace System::Runtime::InteropServices;
namespace TheLib::Math
{


	[IsReadOnly] 
	public value struct XY
	{
		initonly double x;
		initonly double y;

		XY(double _x, double _y) : x(_x), y(_y) {}

		void Deconstruct ([Out] double% _x, [Out] double% _y) 
		{
			_x = x;
			_y = y;
		}
	};

	public ref class ZFixer {

	private:
		Dictionary<System::String^, XY>^ m_telemetry = nullptr;
		CDiscontinuityFixer* m_fixer = nullptr;
		 
		static initonly System::String^ keyDeltaY         = "DeltaY";
		static initonly System::String^ keyDeltaSlope     = "DeltaSlope";
		static initonly System::String^ keyDeltaCurvature = "DeltaCurvature";
		static initonly System::String^ keyScore          = "Score";
	public:
		ZFixer();
	   ~ZFixer();


		bool Fix(double% x, double% y);
		void Predict(double% x, double% y);

		void Close();

		property Dictionary<System::String^, XY>^ Telemetry {
			Dictionary<System::String^, XY>^ get() {return m_telemetry; }
			void set(Dictionary<System::String^, XY>^ value) { m_telemetry = value; }
		}

		static void DoTest() { CDiscontinuityAnalyzer::DoTest(); }

		static XY GetTestValue( double% x, double% y ) {
			auto v = CDiscontinuityAnalyzer::GetTestValue();
			return XY(v.x(), v.y());
		}


	};
}
