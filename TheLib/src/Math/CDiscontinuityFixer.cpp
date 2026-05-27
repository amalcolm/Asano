#include "CDiscontinuityFixer.h"
#include "CDiscontinuityAnalyzer.h"
#include "CQuadRegress.h"

CDiscontinuityFixer::CDiscontinuityFixer() {
	m_data.reserve(ZFIXER_BUFFER_SIZE+ZFIXER_WINDOW_SIZE);

	_lastAnalysis = new CDiscontinuityAnalyzer::Result(std::span<const XY>{});  // dummy initial value
	
	if (ENABLE_DEBUG_LOG) {
		debugFile.open("C:\\Temp\\CDiscontinuityFixer_Debug.csv");
		Result::WriteDebugHeader(debugFile);
	}
}

CDiscontinuityFixer::~CDiscontinuityFixer() {
	if (debugFile.is_open()) {
		debugFile.flush();
		debugFile.close();
	}
	delete _lastAnalysis;
}


CDiscontinuityFixer::Result CDiscontinuityFixer::Fix(double x, double y) noexcept
{
	m_data.emplace_back(x, y, currentOffsetY);   if (m_data.size() > ZFIXER_BUFFER_SIZE) m_data.erase(m_data.begin(), m_data.end() - ZFIXER_WINDOW_SIZE);
	if (m_data.size() < ZFIXER_WINDOW_SIZE) return Result::FromFail(x, y, currentOffsetY);

	auto start = m_data.size() - ZFIXER_WINDOW_SIZE;  // analyze the most recent window
	auto span = std::span<const XY>(m_data.data() + start, ZFIXER_WINDOW_SIZE);

	std::vector<XY> workingData(ZFIXER_WINDOW_SIZE);
	XY::CentreX(span, workingData);

	auto analysis = CDiscontinuityAnalyzer::Analyze(workingData, ZFIXER_WINDOW_EDGE);

	size_t outputIndex = m_data.size() - ZFIXER_WINDOW_SIZE + ZFIXER_WINDOW_EDGE;

	*_lastAnalysis = analysis;
	_lastAnalysis->deltaX = m_data[m_data.size() - 1].x() - m_data[outputIndex].x();
	_lastAnalysis->centreX = m_data[start].x() - workingData[0].x();

	return Process(workingData, analysis);
}

CDiscontinuityFixer::Result CDiscontinuityFixer::Process(std::span<XY> workingData, CDiscontinuityAnalyzer::Result analysis) noexcept
{
	static constexpr double THRESHOLD_SCORE = 10.0;
	Result result(analysis);

	size_t outputIndex = m_data.size() - ZFIXER_WINDOW_SIZE + ZFIXER_WINDOW_EDGE;

	result.changed = analysis.valid && (analysis.score > THRESHOLD_SCORE);
	result.output = m_data[outputIndex];
	lastY = result.output.y();

	if (result.changed == false || true) {
		if (ENABLE_DEBUG_LOG) result.WriteDebug(debugFile);
		return result;
	}


	// adjust right edge of WORKINGDATA down by deltaY
	auto workingEdge = std::span<XY>(workingData.data() + (workingData.size() - ZFIXER_WINDOW_EDGE), ZFIXER_WINDOW_EDGE);
	
	for (size_t i = 0; i < ZFIXER_WINDOW_EDGE; i++)
		workingEdge[i].adjustOffsetY(-analysis.deltaY);

	
	// get fitted curves
	auto  leftCurve = analysis.left;
	auto rightCurve = CQuadRegress::Fit(workingEdge);



	size_t m_dataIndexOffset = m_data.size() - workingData.size();

	// adjust all non-edge points to average of curves
	for (size_t i = ZFIXER_WINDOW_EDGE; i < workingData.size() - ZFIXER_WINDOW_EDGE; i++)
	{
		double x = workingData[i].x();
	
		double yL = leftCurve.EvaluateAt(x);
		double yR = rightCurve.EvaluateAt(x);
		double averageY = 0.5 * (yL + yR);

		size_t m_dataIndex = i + m_dataIndexOffset;
		m_data[m_dataIndex].adjustOffsetY(averageY - m_data[m_dataIndex].y());  // adjust offsetY to align curves
	}


	// move right edge of M_DATA down by deltaY
	for (size_t i = m_data.size() - ZFIXER_WINDOW_EDGE; i < m_data.size(); i++)
		m_data[i].adjustOffsetY(-analysis.deltaY);


	// the XY returned is last non-edge point
	result.output = m_data[outputIndex];
	result.changed = true;

	currentOffsetY += -analysis.deltaY;

	result.WriteDebug(debugFile);
	
	return result;
}

void CDiscontinuityFixer::Predict(double& x, double& y) noexcept
{
	if (_lastAnalysis->valid == false) return;

	x -= _lastAnalysis->deltaX;
	y = _lastAnalysis->left.EvaluateAt(x - _lastAnalysis->centreX);
}