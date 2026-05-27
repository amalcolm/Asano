 #pragma once

using namespace System;
using namespace System::Collections::Concurrent;
using namespace System::Text;

#include <cstdint>

namespace TheLib
{
    
    // Pool of char buffers (System::Char = wchar_t in C++/CLI)
    public ref class CharPool abstract sealed
    {
    private:
        static ConcurrentBag<array<wchar_t>^>^ s_pool;

    public:
        literal int BufferSize = 128;
        literal int InitialBagSize = 8192;

        // Static constructor
        static CharPool();

        static array<wchar_t>^ Rent();
        static void Return(array<wchar_t>^ buffer);
    };

    // Pooled, reusable string-like wrapper with no System::String^
    public ref class AString sealed
    {
    private:
        array<wchar_t>^ _buffer;
        int             _length;
 
        static ConcurrentBag<AString^>^ s_pool;

        // Only Rent() can create instances
        AString();

    public:
        property int Length
        {
            int get() { return _length; }
        }

        property array<wchar_t>^ Buffer
        {
            array<wchar_t>^ get() { return _buffer; }
        }

        property bool IsEmpty
        {
            bool get() { return _buffer == nullptr || _length == 0; }
        }

        // Indexer: aString[i]
        property wchar_t default[int]
        {
            wchar_t get(int index)
            {
                if (index < 0 || index >= _length)
                    throw gcnew ArgumentOutOfRangeException("index");
                return _buffer[index];
            }
        }

        virtual String^ ToString() override;

        // --- Pooling API -----------------------------------------------------

        // Rent/reuse AString instances
        static AString^ Rent();

        // Reset fields but keep buffer for reuse
        void Reset();

        // --- Factories to fill the buffer -----------------------------------

        // Copy from existing char[] slice
        static AString^ FromChars(array<wchar_t>^ chars, int offset, const int count);

        // Decode UTF-8 bytes directly into the internal buffer
        static AString^ FromUtf8(const uint8_t* bytes, int offset, const int count);

		static AString^ FromString(String^ str);
		static AString^ FromStringBuilder(StringBuilder^ sb);

        // Destructor returns buffer and object to pools (called via 'delete')
        ~AString();


        static constexpr wchar_t SPACE = L' ';

        static bool IsDigit(wchar_t ch) { return ch >= L'0' && ch <= L'9'; }

        static bool IsNumericStart(wchar_t ch) { return IsDigit(ch) || ch == L'+' || ch == L'-' || ch == L'.'; }

    public:
        void Expand(const wchar_t* in, int offset, const int count) {
            
            int oi = 0;
            int pendingSpaces = 0;

			int end = offset + count;

			int nSpaces = 0; 
            for (int i = offset; i < end; i++) 
                if (in[i] == L' ') nSpaces++;
			
            if (_buffer == nullptr || _buffer->Length < count + nSpaces)
				_buffer = gcnew array<wchar_t>(count + nSpaces);

            pin_ptr<wchar_t> out = &_buffer[0];

            for (size_t ii = offset; ii < end; ii++) {
                wchar_t ch = in[ii];

                if (ch == L' ') {
                    pendingSpaces++;
                    continue;
                }

                if (pendingSpaces) {
                    bool doubleSpace = IsNumericStart(ch);

                    do {
                        out[oi++] = SPACE;
                        if (doubleSpace) out[oi++] = SPACE;
                    } while (--pendingSpaces);
                }

                out[oi++] = ch;
            }

			for (int endOutput = oi + pendingSpaces; oi < endOutput; oi++)
                out[oi] = SPACE;
                
			_length = oi;
        }
    protected:
        // Finalizer: just return the buffer if GC collects without 'delete'
        !AString();
    };
}
