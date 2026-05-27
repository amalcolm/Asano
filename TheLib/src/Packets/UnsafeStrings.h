#pragma once
#include "WebData.h"

using namespace System;
using namespace System::Collections::Generic;
using namespace System::Reflection;
using namespace System::Text::Json;


namespace TheLib
{
	using namespace Packets;

	public ref struct UnsafeString
	{
	private:
		static JsonSerializerOptions^ options = gcnew JsonSerializerOptions();

		static UnsafeString()
		{
			options->PropertyNamingPolicy = JsonNamingPolicy::CamelCase;
			options->WriteIndented = false;
		}

		ref struct TypeInfo
		{
			Type^ type;
			int wholeDigits;
			int fractionDigits;
			TypeInfo(Type^ type, int wholeDigits, int fractionDigits) : type(type), wholeDigits(wholeDigits), fractionDigits(fractionDigits) {}

			ref struct TemplateCacheEntry
			{
				String^ _template;
				Dictionary<PropertyInfo^, TypeInfo^>^ fieldInfoMap;
				TemplateCacheEntry() : _template(nullptr), fieldInfoMap(nullptr) {}
				TemplateCacheEntry(String^ templateStr) : _template(templateStr), fieldInfoMap(gcnew Dictionary<PropertyInfo^, TypeInfo^>(8)) {
				}
			};

			static Dictionary<Type^, TemplateCacheEntry^>^ typeToTemplate = gcnew Dictionary<Type^, TemplateCacheEntry^>(32);

		public:
			//		static void SetTemplate(IWebMessage^ message);
		};


		// Usage example:
		/*
			voltageMessage = gcnew VoltagesChangedMessage();
			voltageMessage->Voltages->Sensor1 = 1.23f;
			voltageMessage->Voltages->Sensor2 = 1.234f;

			UnsafeString::SetTemplate(voltageMessage);

			// looks through all properties of voltageMessage and creates TypeInfo for each using the value of the property to determine wholeDigits and fractionDigits,

		*/


	};
}