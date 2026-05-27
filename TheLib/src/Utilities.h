#pragma once
#pragma managed(push, off)
#include <string>
#include <vector>
#define WIN32_LEAN_AND_MEAN
#include <Windows.h>
#pragma managed(pop)

using namespace System;

namespace TheLib
{
    String^      ConvertStdString   (const std::string& str);
    std::string  ConvertSysString   (String^ str);
    DateTime     ConvertSystemTime  (const SYSTEMTIME& st);
    array<Byte>^ ConvertByteVector  (const std::vector<BYTE>& vec);
    Exception^   ConvertStdException(const std::exception& ex);

    ref class IntPtrComparer : System::Collections::Generic::IEqualityComparer<IntPtr>
    {
    public:
        static property IntPtrComparer^ Default { IntPtrComparer^ get() { return gcnew IntPtrComparer(); } }
        virtual bool Equals(IntPtr x, IntPtr y) { return x == y; }
        virtual int GetHashCode(IntPtr obj)     { return obj.GetHashCode(); }
    };

	Exception^ SafeWait(DWORD milliseconds, System::Threading::CancellationToken token);

};

