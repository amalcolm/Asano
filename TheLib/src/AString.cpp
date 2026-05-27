#include "AString.h"
#include <vcclr.h>

using namespace System;
using namespace System::Collections::Concurrent;
using namespace System::Text;

namespace TheLib
{
    // ----- CharPool ----------------------------------------------------------


    CharPool::CharPool()
    {
        s_pool = gcnew ConcurrentBag<array<wchar_t>^>();

        for (int i = 0; i < InitialBagSize; ++i)
            s_pool->Add(gcnew array<wchar_t>(BufferSize));
    }

    array<wchar_t>^ CharPool::Rent()
    {
        array<wchar_t>^ buffer;
        if (s_pool->TryTake(buffer))
            return buffer;

        return gcnew array<wchar_t>(BufferSize);
    }

    void CharPool::Return(array<wchar_t>^ buffer)
    {
        if (buffer == nullptr || buffer->Length != BufferSize) return;

        Array::Clear(buffer);;

        s_pool->Add(buffer);
    }

    // ----- AString -----------------------------------------------------------


    AString::AString()
        : _buffer(nullptr), _length(0)
    {
        _buffer = CharPool::Rent();
    }

    AString^ AString::Rent()
    {
        if (s_pool == nullptr)
        {
            s_pool = gcnew ConcurrentBag<AString^>();
        }

        AString^ inst;
        if (s_pool->TryTake(inst))
        {
            // Reuse existing instance; ensure it has a buffer
            if (inst->_buffer == nullptr)
                inst->_buffer = CharPool::Rent();

            inst->_length = 0;
            return inst;
        }

        return gcnew AString();
    }

    void AString::Reset()
    {
        _length = 0;
        // Buffer is kept for reuse
    }

    AString^ AString::FromChars(array<wchar_t>^ chars, int offset, int count)
    {
        if (chars == nullptr || count <= 0)
            return nullptr;

        if (offset < 0 || count < 0 || offset + count > chars->Length)
            throw gcnew ArgumentOutOfRangeException("offset/count");

        AString^ inst = Rent();

        if (count > inst->_buffer->Length)
        {
            // Replace with a larger buffer (not pooled back via CharPool)
            inst->_buffer = gcnew array<wchar_t>(count);
        }

        Array::Copy(chars, offset, inst->_buffer, 0, count);
        inst->_length = count;
        return inst;
    }

    AString^ AString::FromUtf8(const uint8_t* bytes, int offset, const int count)
    {

        if (bytes == nullptr)
            return nullptr;

        if (offset < 0) throw gcnew ArgumentOutOfRangeException("offset");
        if (count  < 0) throw gcnew ArgumentOutOfRangeException("count" );

        AString^ inst = Rent();
        if (count == 0)	return inst;

        const uint8_t* src = bytes + offset;

        int charCount = Encoding::UTF8->GetCharCount((unsigned char*)src, (int)count);
        if (charCount <= 0)
            return inst;

     
        const int MAX_UTF8_LENGTH = 256; // ample, line based text packets from serial
		wchar_t pChars[MAX_UTF8_LENGTH]; // Temporary stack buffer for decoding
		memset(pChars, 0, sizeof(pChars)); // Clear the buffer

        int written = Encoding::UTF8->GetChars(
            (unsigned char*)src,   // byte* (from native buffer)
            count,                 // number of bytes
            pChars,                // wchar_t* into pinned managed buffer
            MAX_UTF8_LENGTH        // max chars we can write
        );

        if (written <= 0)
        {
            // Return instance to pool on failure
            inst->Reset();
            if (s_pool == nullptr)
                s_pool = gcnew ConcurrentBag<AString^>();
            s_pool->Add(inst);
            return nullptr;
        }

		inst->Expand(pChars, 0, written);
        return inst;
    }

    AString^ AString::FromString(String^ str)
    {
        if (str == nullptr) return nullptr;

        AString^ inst = Rent();
        int strLength = str->Length;

        if (strLength == 0) return inst;
        if (strLength > inst->_buffer->Length)
            inst->_buffer = gcnew array<wchar_t>(strLength);

        str->CopyTo(0, inst->_buffer, 0, strLength);
        inst->_length = strLength;
        return inst;
	}

    AString^ AString::FromStringBuilder(StringBuilder^ sb)
    {
        if (sb == nullptr) return nullptr;
        AString^ inst = Rent();
        int sbLength = sb->Length;
        if (sbLength == 0) return inst;
        if (sbLength > inst->_buffer->Length)
            inst->_buffer = gcnew array<wchar_t>(sbLength);
        sb->CopyTo(0, inst->_buffer, 0, sbLength);
        inst->_length = sbLength;
        return inst;
    }

    String^ AString::ToString()
    {
        if (IsEmpty)
            return String::Empty;

        return gcnew String(_buffer, 0, _length);
    }

    AString::~AString()
    {
        // Deterministic cleanup (maps to IDisposable.Dispose in .NET)
        this->!AString();

        // Return the wrapper itself to the pool for reuse
        if (s_pool == nullptr)
        {
            s_pool = gcnew ConcurrentBag<AString^>();
        }
        s_pool->Add(this);
    }

    AString::!AString()
    {
        if (_buffer != nullptr)
        {
            CharPool::Return(_buffer);

            _buffer = nullptr;
        }
        _length = 0;
    }

}
