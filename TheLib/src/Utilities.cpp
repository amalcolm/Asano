#include "Utilities.h"
#include <msclr/marshal_cppstd.h> // For string conversions (marshal_as)
#include <stdexcept> // For std::runtime_error

using namespace System;
using namespace System::Diagnostics; // For Debug::WriteLine
using namespace System::Runtime::InteropServices; // For Marshal
using namespace System::Threading::Tasks;
namespace TheLib
{
#pragma warning(push)
#pragma warning(disable:4286)  // Suppress warning about TaskCancelled exceptions being caught by OperationCanceledException

    Exception^ SafeWait(DWORD milliseconds, System::Threading::CancellationToken token)
    {
        try
        {
            // Wait for the delay task, respecting cancellation
            Task::Delay(milliseconds, token)->Wait();
        }
        catch (AggregateException^ ag)
        {
            if (ag->InnerExceptions != nullptr)
                for each(Exception ^ e in ag->InnerExceptions)
                    if (e->GetType() == OperationCanceledException::typeid ||
                        e->GetType() == TaskCanceledException::typeid)
                    {
                        return nullptr;
                    }

            // Unexpected inner exception: return the aggregate itself
            return ag;
        }
        catch (OperationCanceledException^) { return nullptr; }
        catch (TaskCanceledException^)      { return nullptr; }
        catch (Exception^ ex)               { return ex;      }

        // Completed without error
        return nullptr;
    }
#pragma warning(pop)

    String^ ConvertStdString(const std::string& str) {
        // Simple conversion using marshal_as
        try {
            return msclr::interop::marshal_as<String^>(str);
        }
        catch (...) {
            // Handle potential marshalling errors
            return "Error converting std::string";
        }
    }

    std::string ConvertSysString(String^ str) {
        // Simple conversion using marshal_as
        if (str == nullptr) {
            return "";
        }
        try {
            return msclr::interop::marshal_as<std::string>(str);
        }
        catch (...) {
            // Handle potential marshalling errors
            return "Error converting System::String";
        }
    }

    DateTime ConvertSystemTime(const SYSTEMTIME& st) {
        // Convert SYSTEMTIME to DateTime, handling potential invalid values
        try {
            // Validate parts roughly - DateTime constructor throws if invalid
            if (st.wYear < 1 || st.wYear > 9999 || st.wMonth < 1 || st.wMonth > 12 || st.wDay < 1 || st.wDay > 31 ||
                st.wHour > 23 || st.wMinute > 59 || st.wSecond > 59 || st.wMilliseconds > 999)
            {
                // Return a default or throw? Return MinValue for now.
                Debug::WriteLine("SerialHelper: Invalid SYSTEMTIME received.");
                return DateTime::MinValue;
            }
            return DateTime(st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond, st.wMilliseconds, DateTimeKind::Utc); // Assuming UTC from GetSystemTime
        }
        catch (ArgumentOutOfRangeException^ ex) {
            Debug::WriteLine(String::Format("SerialHelper: Error converting SYSTEMTIME: {0}", ex->Message));
            return DateTime::MinValue; // Or another default
        }
    }

    array<Byte>^ ConvertByteVector(const std::vector<BYTE>& vec) {
        // Convert std::vector<BYTE> to managed array<Byte>^
        if (vec.empty()) {
            return gcnew array<Byte>(0);
        }
        array<Byte>^ managedArray = gcnew array<Byte>(static_cast<int>(vec.size()));
        // Copy data using Marshal::Copy
        Marshal::Copy(static_cast<IntPtr>(const_cast<BYTE*>(vec.data())), managedArray, 0, managedArray->Length);
        return managedArray;
    }

    Exception^ ConvertStdException(const std::exception& ex) {
        // Convert std::exception (or derived) to System::Exception
        // Include the exception type and message if possible
        try {
            // Use RTTI to try and get the actual type name
            const std::type_info& typeInfo = typeid(ex);
            String^ typeName = ConvertStdString(typeInfo.name());
            String^ message = ConvertStdString(ex.what());
            return gcnew Exception(String::Format("Native Exception ({0}): {1}", typeName, message));
        }
        catch (...) {
            // Fallback if RTTI or string conversion fails
            return gcnew Exception("Native Exception: " + ConvertStdString(ex.what()));
        }
    }

}