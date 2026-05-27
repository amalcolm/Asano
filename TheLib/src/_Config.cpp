#include "_Config.h"

using namespace System;
using namespace System::Reflection;


namespace TheLib
{
    void Config::ParseHandshakeResponse(String^ response)
    {
        array<String^>^ parts = response->TrimStart('<')->Split("::", StringSplitOptions::RemoveEmptyEntries);
        Type^ t = Config::typeid;

        for each(String ^ part in parts)
        {
            array<String^>^ kv = part->Split('=');
            if (kv->Length != 2)
                continue;

            String^ key = kv[0]->Trim();
            String^ value = kv[1]->Trim();

            FieldInfo^ field = t->GetField(key, BindingFlags::Public | BindingFlags::Static);
            if (field == nullptr)
                continue;

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
                    else
                        if (double::TryParse(value, n))
                            field->SetValue(nullptr, static_cast<UInt32>(n));
                }
                else if (field->FieldType == Int32::typeid)
                {
                    Int32 parsed;
                    double n;
                    if (Int32::TryParse(value, parsed))
                        field->SetValue(nullptr, parsed);
                    else
                        if (double::TryParse(value, n))
							field->SetValue(nullptr, static_cast<Int32>(n));
                }
                // Extend for Double, Boolean, etc. if needed
            }
            catch (Exception^ ex)
            {
                System::Diagnostics::Debug::WriteLine("Error setting field " + key + ": " + ex->Message);
            }
        }
    }

}