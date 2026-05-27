#pragma once
using namespace System;
using namespace System::Collections::Concurrent;
using namespace System::Threading;

namespace TheLib
{
    generic <typename T> where T : ref class, gcnew()
        public ref class ObjectPool sealed
    {
    private:
        ConcurrentBag<T>^ _bag;
        int _count;
        int _maxSize;

    public:
        ObjectPool(int maxSize)
        {
            if (maxSize <= 0) throw gcnew ArgumentOutOfRangeException("maxSize");
            _bag = gcnew ConcurrentBag<T>();
            _maxSize = maxSize;
            _count = 0;
        }

        ObjectPool()
            : ObjectPool(1024) {
        }

        /// <summary>Rent an object from the pool, or create one if empty.</summary>
        T Rent()
        {
            T item;
            if (_bag->TryTake(item))
            {
                Interlocked::Decrement(_count);
                return item;
            }
            return gcnew T();
        }

        /// <summary>Return an object to the pool.</summary>
        void Return(T item)
        {
            if (item == nullptr) return;

            int newCount = Interlocked::Increment(_count);
            if (newCount <= _maxSize)
            {
                _bag->Add(item);
            }
            else
            {
                Interlocked::Decrement(_count);
                // Over capacity – discard
            }
        }

        property int Count
        {
            int get() { return _count; }
        }
    };
}
