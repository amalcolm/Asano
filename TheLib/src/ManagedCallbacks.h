#pragma once

using namespace System;
using namespace System::Threading;
using namespace System::Threading::Tasks;
using namespace System::Collections::Concurrent; // For BlockingCollection
using namespace System::Collections::Generic;    // For Dictionary

namespace TheLib
{

    // Define callback execution policies
    public enum class CallbackPolicy 
    {
        Direct,     // Execute directly in the calling thread
        ThreadPool, // Execute using the .NET ThreadPool (Recommended for high frequency)
        Queued      // Add to a queue processed by a dedicated worker Task
    };

    public interface class IRaiser {
        void Raise();
    };



    public ref class PoolRegistry abstract sealed
    {
    private:
        static Dictionary<IntPtr, Action<IRaiser^>^>^ _returners =
            gcnew Dictionary<IntPtr, Action<IRaiser^>^>();

    public:
        static void Register(Type^ type, Action<IRaiser^>^ returnAction)
        {
            _returners->Add(type->TypeHandle.Value, returnAction);
        }

        static void Return(IRaiser^ obj)
        {
            IntPtr key = obj->GetType()->TypeHandle.Value;
            if (Action<IRaiser^>^ action; _returners->TryGetValue(key, action))
                action(obj);
            else
                throw gcnew InvalidOperationException("Unknown type");
        }
    };


    // C++/CLI ref class for callback execution, mindful of performance
    public ref class ManagedCallbacks sealed : IDisposable {
    private:
        CallbackPolicy m_policy;

        // --- Members for Queued policy ---
        BlockingCollection<IRaiser^>^ m_callbackQueue;
        Task^ m_workerTask;
        CancellationTokenSource^ m_cts;

        // Worker loop logic
        void WorkerLoop(CancellationToken token);

        // --- IDisposable pattern ---
		bool m_disposing;
        bool m_disposed;
        void Disposing(bool disposing);

    public:
        ManagedCallbacks(CallbackPolicy policy);

    private:
        // Helper needed because instance methods cannot be directly used with StartNew Action<object>
        void WorkerLoopInternal(Object^ state);

    public:
        ~ManagedCallbacks() { Disposing(true); }
        !ManagedCallbacks() { Disposing(false); }

        // Execute a callback (Action delegate) according to the policy
        void Execute(IRaiser^ action);

    private:
        static void ThreadPoolCallback(Object^ state);

        bool HandleInnerException(Exception^ inner);

    public:
        // Get queue size (only relevant for Queued policy)
        property int QueueSize{        int get();      }

		// Get the current callback policy
        property CallbackPolicy Policy {
            CallbackPolicy get() { return m_policy; }
        }
    };
}
