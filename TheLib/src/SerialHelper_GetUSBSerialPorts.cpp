#include "SerialHelper.h"

// NOTE:
//  * Add this declaration to SerialHelper.h inside the TheLib::SerialHelper class:
//  *     public:
//  *         static array<System::String^>^ GetUSBSerialPorts();
//  *
//  * Make sure the project references System.Management (NuGet package
//  * "System.Management" for .NET 8 on Windows), otherwise the WMI
//  * query types below will not resolve.

using namespace System;
using namespace System::Collections::Generic;
using namespace System::Diagnostics;
using namespace System::Management;              // ManagementObjectSearcher
using namespace System::Text::RegularExpressions;

namespace TheLib
{
    // Helper comparer so that COM10 sorts after COM2, etc.
    private ref class ComPortNaturalComparer : IComparer<String^>
    {
    public:
        virtual int Compare(String^ x, String^ y)
        {
            Regex^ regex = gcnew Regex("(\\d+)");

            Match^ matchX = regex->Match(x != nullptr ? x : String::Empty);
            Match^ matchY = regex->Match(y != nullptr ? y : String::Empty);

            if (matchX->Success && matchY->Success)
            {
                int numX = 0;
                int numY = 0;

                if (Int32::TryParse(matchX->Value, numX) &&
                    Int32::TryParse(matchY->Value, numY))
                {
                    int numComparison = numX.CompareTo(numY);
                    if (numComparison != 0)
                        return numComparison;
                }
            }

            // Fallback to regular string comparison if numbers are the same or not found
            return String::Compare(x, y, StringComparison::Ordinal);
        }
    };


    // Static method on SerialHelper that mirrors MySerialIO.GetUSBSerialPorts in C#.
    //
    //  * Queries Win32_PnPEntity for the "Ports" class (GUID hard-coded as in C#).
    //  * Filters to known USB-serial vendor IDs.
    //  * Extracts the COMxx portion from the device "Name".
    //  * Returns a naturally-sorted array of "COM1", "COM9", "COM10", ...
    array<String^>^ SerialHelper::GetUSBSerialPorts()
    {
        auto ports = gcnew List<String^>();

        // Same WMI query as the C# version
        String^ searchQuery =
            "SELECT * FROM Win32_PnPEntity WHERE ClassGuid = '{4d36e978-e325-11ce-bfc1-08002be10318}'";

        // Same vendor IDs as in MySerialIO.UsbSerialVendorIds
        array<String^>^ knownVendorVids = gcnew array<String^>{
            // Tier 1: dedicated USB-serial bridges
            "0403", // FTDI
            "067B", // Prolific
            "1A86", // WCH (QinHeng)
            "10C4", // Silicon Labs

            // Tier 2: microcontroller / platform vendors
            "16C0", // V-USB / PJRC (Teensy)
            "2341", // Arduino
            "2E8A", // Raspberry Pi RP2040
            "0483", // STMicroelectronics (STM32)
            "04D8", // Microchip

            // Tier 3 examples were commented out in C#; omit here too for now
            // "1B4F", // SparkFun
            // "239A", // Adafruit
        };

        // "(COM9)" etc.
        Regex^ comPortRegex = gcnew Regex("\\(COM\\d+\\)", RegexOptions::IgnoreCase);

        try
        {
            ManagementObjectSearcher^ searcher = gcnew ManagementObjectSearcher(searchQuery);

            for each (ManagementObject ^ device in searcher->Get())
            {
                // Defensive null handling
                String^ deviceId = device["DeviceID"] != nullptr
                    ? device["DeviceID"]->ToString()
                    : String::Empty;
                String^ deviceName = device["Name"] != nullptr
                    ? device["Name"]->ToString()
                    : String::Empty;

                // Check the VID against our known list
                bool isKnownVendor = false;

                for each (String ^ vid in knownVendorVids)
                {
                    if (String::IsNullOrEmpty(vid))
                        continue;

                    String^ marker = "VID_" + vid; // e.g., "VID_2341"

                    if (deviceId->IndexOf(marker, StringComparison::OrdinalIgnoreCase) >= 0)
                    {
                        isKnownVendor = true;
                        break;
                    }
                }

                if (!isKnownVendor)
                    continue;

                // Pull out the "(COMxx)" portion from the device name
                Match^ match = comPortRegex->Match(deviceName);
                if (match->Success)
                {
                    // Trim parentheses => "COM9" etc.
                    String^ port = match->Value->Trim(gcnew array<wchar_t>{ '(', ')' });
                    ports->Add(port);
                }
            }
        }
        catch (ManagementException^ ex)
        {
            Debug::WriteLine(String::Format(
                "SerialHelper::GetUSBSerialPorts WMI error: {0}", ex->Message));
        }
        catch (Exception^ ex)
        {
            Debug::WriteLine(String::Format(
                "SerialHelper::GetUSBSerialPorts unexpected error: {0}", ex->Message));
        }

        // Natural sort: COM2, COM9, COM10, ...
        ports->Sort(gcnew ComPortNaturalComparer());

        return ports->ToArray();
    }

} // namespace TheLib
