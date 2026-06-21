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

    void SetConfigField(String^ key, String^ value)
    {
        Type^ t = Config::typeid;
        FieldInfo^ field = t->GetField(key, BindingFlags::Public | BindingFlags::Static);
        if (field == nullptr)
            return;

        try
        {
            if (field->FieldType == String::typeid)
            {
                field->SetValue(nullptr, value);
            }
            else if (field->FieldType == UInt32::typeid)
            {
                UInt32 parsed;
                double n;
                if (UInt32::TryParse(value, parsed))
                    field->SetValue(nullptr, parsed);
                else if (double::TryParse(value, n))
                    field->SetValue(nullptr, static_cast<UInt32>(n));
            }
            else if (field->FieldType == Int32::typeid)
            {
                Int32 parsed;
                double n;
                if (Int32::TryParse(value, parsed))
                    field->SetValue(nullptr, parsed);
                else if (double::TryParse(value, n))
                    field->SetValue(nullptr, static_cast<Int32>(n));
            }
        }
        catch (Exception^ ex)
        {
            System::Diagnostics::Debug::WriteLine("Error setting field " + key + ": " + ex->Message);
        }
    }

    void ParseHandshakePart(String^ part)
    {
        String^ line = TrimHandshakeMarker(part);
        if (line->Length == 0)
            return;

        if (String::Equals(line, "CONFIG_BEGIN", StringComparison::OrdinalIgnoreCase))
        {
            Config::ResetHandshakeConfig();
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
                Config::TEST_SEQUENCES->Add(sequence);

            return;
        }

        SetConfigField(key, value);
    }
}

namespace TheLib
{
    void Config::ResetHandshakeConfig()
    {
        TEST_SEQUENCES->Clear();
    }

    void Config::ParseHandshakeResponse(String^ response)
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
                ParseHandshakePart(part);
        }
    }

}
