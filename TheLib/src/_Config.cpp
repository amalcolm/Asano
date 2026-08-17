#include "_Config.h"

using namespace System;
using namespace System::Collections::Generic;
using namespace System::Globalization;
using namespace System::Reflection;
using namespace TheLib;

namespace
{
    String^ TrimHandshakeMarker(String^ value)
    {
        if (String::IsNullOrWhiteSpace(value))
            return String::Empty;

        String^ line = value->Trim();
        while (line->Length > 0 && (line[0] == '<' || line[0] == '>'))
            line = line->Substring(1)->TrimStart();

        return line;
    }

    bool TrySplitKeyValue(String^ line, String^% key, String^% value)
    {
        int separator = line->IndexOf('=');
        if (separator <= 0)
            return false;

        key = line->Substring(0, separator)->Trim();
        value = line->Substring(separator + 1)->Trim();
        return key->Length > 0;
    }

    bool TryParseState(String^ token, UInt32% state)
    {
        if (String::IsNullOrWhiteSpace(token))
            return false;

        String^ text = token->Trim();
        bool parseAsHex = text->Length == 8;

        if (text->StartsWith("0x", StringComparison::OrdinalIgnoreCase))
        {
            text = text->Substring(2);
            parseAsHex = true;
        }

        for each(wchar_t ch in text)
        {
            if ((ch >= 'A' && ch <= 'F') || (ch >= 'a' && ch <= 'f'))
            {
                parseAsHex = true;
                break;
            }
        }

        if (parseAsHex)
            return UInt32::TryParse(text, NumberStyles::HexNumber, CultureInfo::InvariantCulture, state);

        return UInt32::TryParse(text, state);
    }

    HeadTestSequenceConfig^ TryParseTestSequence(String^ value)
    {
        if (String::IsNullOrWhiteSpace(value))
            return nullptr;

        int separator = value->IndexOf(':');
        if (separator <= 0 || separator >= value->Length - 1)
            return nullptr;

        String^ name = value->Substring(0, separator)->Trim();
        if (name->Length == 0)
            return nullptr;

        array<String^>^ tokens = value->Substring(separator + 1)->Split(
            gcnew array<wchar_t>{ ',' },
            StringSplitOptions::RemoveEmptyEntries);

        if (tokens->Length == 0)
            return nullptr;

        List<UInt32>^ states = gcnew List<UInt32>();
        for each(String^ token in tokens)
        {
            UInt32 state;
            if (!TryParseState(token, state))
                return nullptr;

            states->Add(state);
        }

        return gcnew HeadTestSequenceConfig(name, states->ToArray());
    }

    String^ ResolveConfigFieldName(String^ key)
    {
        if (String::Equals(key, "DEVICE_VERSION", StringComparison::OrdinalIgnoreCase))
            return "DeviceVersion";

        return key;
    }

    void SetConfigField(Object^ target, Type^ configType, BindingFlags scope, String^ key, String^ value)
    {
        String^ fieldName = ResolveConfigFieldName(key);
        FieldInfo^ field = configType->GetField(fieldName, BindingFlags::Public | scope);
        if (field == nullptr)
            return;

        try
        {
            if (field->FieldType == String::typeid)
            {
                field->SetValue(target, value);
            }
            else if (field->FieldType == UInt32::typeid)
            {
                UInt32 parsed;
                double n;
                if (UInt32::TryParse(value, parsed))
                    field->SetValue(target, parsed);
                else if (double::TryParse(value, n))
                    field->SetValue(target, static_cast<UInt32>(n));
            }
            else if (field->FieldType == Int32::typeid)
            {
                Int32 parsed;
                double n;
                if (Int32::TryParse(value, parsed))
                    field->SetValue(target, parsed);
                else if (double::TryParse(value, n))
                    field->SetValue(target, static_cast<Int32>(n));
            }
            else if (field->FieldType->IsEnum)
            {
                Object^ parsed = Enum::Parse(field->FieldType, value, true);
                if (Enum::IsDefined(field->FieldType, parsed))
                    field->SetValue(target, parsed);
            }
        }
        catch (Exception^ ex)
        {
            System::Diagnostics::Debug::WriteLine("Error setting field " + key + ": " + ex->Message);
        }
    }

    void ParseHandshakePart(
        String^ part,
        Object^ target,
        Type^ configType,
        BindingFlags scope,
        List<HeadTestSequenceConfig^>^ testSequences)
    {
        String^ line = TrimHandshakeMarker(part);
        if (line->Length == 0)
            return;

        if (String::Equals(line, "CONFIG_BEGIN", StringComparison::OrdinalIgnoreCase))
        {
            testSequences->Clear();
            return;
        }

        if (String::Equals(line, "CONFIG_END", StringComparison::OrdinalIgnoreCase))
            return;

        String^ key;
        String^ value;
        if (!TrySplitKeyValue(line, key, value))
            return;

        if (String::Equals(key, "TEST_SEQUENCE", StringComparison::OrdinalIgnoreCase))
        {
            HeadTestSequenceConfig^ sequence = TryParseTestSequence(value);
            if (sequence != nullptr)
                testSequences->Add(sequence);

            return;
        }

        SetConfigField(target, configType, scope, key, value);
    }

    void ParseHandshakeResponseInto(
        String^ response,
        Object^ target,
        Type^ configType,
        BindingFlags scope,
        List<HeadTestSequenceConfig^>^ testSequences)
    {
        if (String::IsNullOrWhiteSpace(response))
            return;

        array<String^>^ lines = response->Split(
            gcnew array<String^>{ "\r\n", "\n", "\r" },
            StringSplitOptions::RemoveEmptyEntries);

        for each(String^ line in lines)
        {
            array<String^>^ parts = line->Split("::", StringSplitOptions::RemoveEmptyEntries);
            for each(String^ part in parts)
                ParseHandshakePart(part, target, configType, scope, testSequences);
        }
    }
}

namespace TheLib
{
    DeviceConfig::DeviceConfig()
    {
        TEST_SEQUENCES = gcnew List<HeadTestSequenceConfig^>();
    }

    void DeviceConfig::ResetHandshakeConfig()
    {
        TEST_SEQUENCES->Clear();
    }

    void DeviceConfig::ParseHandshakeResponse(String^ response)
    {
        ParseHandshakeResponseInto(
            response,
            this,
            DeviceConfig::typeid,
            BindingFlags::Instance,
            TEST_SEQUENCES);
    }

    void Config::ResetHandshakeConfig()
    {
        TEST_SEQUENCES->Clear();
    }

    void Config::ParseHandshakeResponse(String^ response)
    {
        ParseHandshakeResponseInto(
            response,
            nullptr,
            Config::typeid,
            BindingFlags::Static,
            TEST_SEQUENCES);
    }

    void Config::ApplyDeviceConfig(DeviceConfig^ config)
    {
        if (config == nullptr)
            throw gcnew ArgumentNullException("config");

        STATE_DURATION_uS     = config->STATE_DURATION_uS;
        HEAD_SETTLE_TIME_uS   = config->HEAD_SETTLE_TIME_uS;
        POT_UPDATE_OFFSET_uS  = config->POT_UPDATE_OFFSET_uS;
        A2D_SAMPLING_SPEED_Hz = config->A2D_SAMPLING_SPEED_Hz;
        A2D_READING_PERIOD_uS = config->A2D_READING_PERIOD_uS;
        MAX_BLOCKSIZE         = config->MAX_BLOCKSIZE;
        MAX_EVENTS_PER_BLOCK  = config->MAX_EVENTS_PER_BLOCK;
        MAX_SEQUENCE_STATES   = config->MAX_SEQUENCE_STATES;
        COMMAND_FLAGS         = config->COMMAND_FLAGS;
        DeviceVersion         = config->DeviceVersion;

        if (config->DEBUG_MODE == nullptr)
        {
            DEBUG_MODE = DebugMode::none;
        }
        else
        {
            String^ debugModeStr = config->DEBUG_MODE->ToUpperInvariant();

                 if (debugModeStr->Equals("OFF"))          DEBUG_MODE = DebugMode::OFF;
            else if (debugModeStr->Equals("ON"))           DEBUG_MODE = DebugMode::ON;
            else if (debugModeStr->Equals("SINGLE_STATE")) DEBUG_MODE = DebugMode::SINGLE_STATE;
            else if (debugModeStr->Equals("NONE"))         DEBUG_MODE = DebugMode::none;
            else
                throw gcnew ArgumentException("Invalid DEBUG_MODE value: " + config->DEBUG_MODE);
        }

        if (config->DEVICE_ROLE == nullptr)
        {
            DEVICE_ROLE = DeviceRole::none;
        }
        else
        {
            String^ deviceRoleStr = config->DEVICE_ROLE->ToUpperInvariant();

                 if (deviceRoleStr->Equals("STANDALONE")) DEVICE_ROLE = DeviceRole::STANDALONE;
            else if (deviceRoleStr->Equals("MASTER"))     DEVICE_ROLE = DeviceRole::MASTER;
            else if (deviceRoleStr->Equals("TESTER1"))    DEVICE_ROLE = DeviceRole::TESTER1;
            else if (deviceRoleStr->Equals("NONE"))       DEVICE_ROLE = DeviceRole::none;
            else
                throw gcnew ArgumentException("Invalid DEVICE_ROLE value: " + config->DEVICE_ROLE);
        }

        TEST_SEQUENCES->Clear();
        for each(HeadTestSequenceConfig^ sequence in config->TEST_SEQUENCES)
        {
            if (sequence == nullptr)
                continue;

            array<UInt32>^ states = sequence->States == nullptr
                ? gcnew array<UInt32>(0)
                : safe_cast<array<UInt32>^>(sequence->States->Clone());

            TEST_SEQUENCES->Add(gcnew HeadTestSequenceConfig(sequence->Name, states));
        }
    }

}
