#include "ZFixer.h"
#include "CDiscontinuityFixer.h"
#include "CQuadRegress.h"

using namespace TheLib::Math;

ZFixer::ZFixer() {
	m_fixer = new CDiscontinuityFixer();
}


ZFixer::~ZFixer() {
	Close();
	delete m_fixer;
}


bool ZFixer::Fix(double %x, double %y) {
    	
	auto result = m_fixer->Fix(x,y);

    x = result.output.x();
    y = result.output.y();
    
	return result.changed;
}


void ZFixer::Predict(double% x, double% y) {
  
    pin_ptr<double> px = &x; 
    pin_ptr<double> py = &y;

    m_fixer->Predict(*px, *py);
 }


void ZFixer::Close() {
    // close any file if doing diagnostics
	m_telemetry = nullptr;
}