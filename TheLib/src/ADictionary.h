#pragma once

using namespace System;
using namespace System::Collections::Concurrent;
using namespace System::Collections::Generic;
using namespace System::Linq; 
using namespace System::Threading;
using namespace System::Runtime::InteropServices;

namespace TheLib
{

    generic <typename TKey, typename TValue>
    public ref class ADictionary sealed
    {
    private:
        ConcurrentDictionary<TKey, TValue>^ _dict = gcnew ConcurrentDictionary<TKey, TValue>();
        
        int _changed = 0;

        array<TKey  >^ _keysCache     = nullptr;
        array<TValue>^ _valuesCache   = nullptr;
        array<TValue>^ _orderedValues = nullptr;

    public:
		ADictionary() {}
        TValue AddOrUpdate(TKey key, TValue addValue, Func<TKey, TValue, TValue>^ updateValueFactory)
        {
            Interlocked::Exchange(_changed, 1);
            return _dict->AddOrUpdate(key, addValue, updateValueFactory);
        }

        bool TryGetValue(TKey key, [Out] TValue% value)
        {
            return _dict->TryGetValue(key, value);
        }

        bool TryAdd(TKey key, [Out] TValue value)
        {
            bool result = _dict->TryAdd(key, value);
            if (result) Interlocked::Exchange(_changed, 1);
            return result;
        }

        bool TryRemove(TKey key, [Out] TValue% value)
        {
            bool result = _dict->TryRemove(key, value);
            if (result) Interlocked::Exchange(_changed, 1);
            return result;
        }

        bool ContainsKey(TKey key)
        {
            return _dict->ContainsKey(key);
        }

        void Add(TKey key, TValue value)
        {
            Interlocked::Exchange(_changed, 1);
            _dict->TryAdd(key, value);
        }

        bool Remove(TKey key)
        {
            TValue temp;
            bool result = _dict->TryRemove(key, temp);
            if (result) Interlocked::Exchange(_changed, 1);
            return result;
        }
        void Clear()
        {
            Interlocked::Exchange(_changed, 1);
            _dict->Clear();
        }


        property array<TKey>^ Keys
        {
            array<TKey>^ get()
            {
                if (_keysCache == nullptr || _changed)
                {
                    _keysCache = Enumerable::ToArray(_dict->Keys);
                    _valuesCache = Enumerable::ToArray(_dict->Values);
                    _orderedValues = nullptr;
					Interlocked::Exchange(_changed, 0);
                }
                return _keysCache;
            }
        }

        property array<TValue>^ Values
        {
            array<TValue>^ get()
            {
                if (_valuesCache == nullptr || _changed)
                {
                    _keysCache = Enumerable::ToArray(_dict->Keys);
                    _valuesCache = Enumerable::ToArray(_dict->Values);
                    _orderedValues = nullptr;
					Interlocked::Exchange(_changed, 0);
                }
                return _valuesCache;
            }
        }

        property TValue default[TKey]
        {
            TValue get(TKey key) { return _dict[key]; }
            void set(TKey key, TValue value)
            {
                Interlocked::Exchange(_changed, 1);
                _dict[key] = value;
            }
        }

        property int Count
        {
            int get() { return _dict->Count; }
		}

        property bool IsEmpty
        {
            bool get() { return _dict->IsEmpty; }
		}



        array<TValue>^ OrderedByKey()
        {
            if (_orderedValues == nullptr || _changed != 0)
            {
                // snapshot keys once
                array<TKey>^ keys = Enumerable::ToArray(_dict->Keys);

                // sort in place (uses IComparable/Comparer<TKey>::Default)
                Array::Sort(keys);

                // fill values array directly (no List<T>)
                array<TValue>^ values = gcnew array<TValue>(keys->Length);
                for (int i = 0; i < keys->Length; ++i)
                    values[i] = _dict[keys[i]];

                _orderedValues = values;
                Interlocked::Exchange(_changed, 0);
            }
            return _orderedValues;
        }
    };
}