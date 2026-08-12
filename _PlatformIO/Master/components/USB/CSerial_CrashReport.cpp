#include "CSerialWrapper.h"
#include "PinHelpers.h"
#include <String.h>  // Usually already available in Teensy core


class CStringPrinter : public Print {
public:
  CStringPrinter(String &output) : out(output) {}

  // Called by Print::write() — must return the number of bytes written
  size_t write(uint8_t b) override {
    out += static_cast<char>(b);
    return 1;
  }

  // Optional: handle bulk writes for efficiency
  size_t write(const uint8_t *buffer, size_t size) override {
    out.reserve(out.length() + size);
    for (size_t i = 0; i < size; ++i) {
      out += static_cast<char>(buffer[i]);
    }
    return size;
  }

private:
  String &out;
};

void CSerialWrapper::SendCrashReport(CrashReportClass& pReport)
{
  Serial.begin(115200);
  for (int i = 0; i < 50 && !Serial; ++i) delay(10); 
  
  const char header[] = "\n\n***** CRASH REPORT *****\n";

  String fullReport{};
  fullReport.reserve(1536);  // Generous—covers even deep stack dumps
  CStringPrinter printer(fullReport);
  pReport.printTo(printer); 

  while (true) {
    Serial.print(header);
    Serial.print(fullReport);

    Pins::flash(5);
    delay(1000);
  }
}

