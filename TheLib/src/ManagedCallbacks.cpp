#pragma once
#include "ManagedCallbacks.h"
#include "EventRaisers.h"
using namespace System;
using namespace System::Diagnostics; // For Debug::WriteLine

constexpr bool VERBOSE = false; // Set to true for verbose logging

namespace TheLib
{
    static ManagedCallbacks::ManagedCallbacks()
    {
        PoolRegistry::Register(DataEventRaiser::typeid, gcnew Action<IRaiser^>(&DataEventRaiser::Return));
        PoolRegistry::Register(ErrorEventRaiser::typeid, gcnew Action<IRaiser^>(&ErrorEventRaiser::Return));
        PoolRegistry::Register(ConnectionEventRaiser::typeid, gcnew Action<IRaiser^>(&ConnectionEventRaiser::Return));
    }

    void ManagedCallbacks::WorkerLoop(CancellationToken token) {
        try {
            for each(IRaiser ^ ev in m_callbackQueue->GetConsumingEnumerable(token)) {
                try {
                    if (ev != nullptr) {
                        ev->Raise();
                    } else {
						Debug::WriteLine("ManagedCallbacks: Null task in queue.");
                    }
                }
                catch (OperationCanceledException^) { Debug::WriteLine("ManagedCallbacks: Queued task cancelled during execution.");  }
                catch (Exception^ ex)               { Debug::WriteLine("ManagedCallbacks: Exception in queued task: " + ex->Message); }
                finally {
                    // Return to pool if applicable
                    try {
                        PoolRegistry::Return(ev);
                    }
                    catch (Exception^ ex) { Debug::WriteLine("ManagedCallbacks: Exception returning task to pool: " + ex->Message); }
				}
            }
        }
        catch (OperationCanceledException^) { if (m_disposing == false) Debug::WriteLine("ManagedCallbacks: WorkerLoop cancelled."); }
        catch (Exception^ ex)               { Debug::WriteLine("ManagedCallbacks: Exception in WorkerLoop: " + ex->Message); }
        finally {
                                                                                                                   if (VERBOSE) Debug::WriteLine("ManagedCallbacks: WorkerLoop exiting.");
        }
    }

    
    // Helper needed because instance methods cannot be directly used with StartNew Action<object>
    void ManagedCallbacks::WorkerLoopInternal(Object^ state) {
        if (state != nullptr && dynamic_cast<CancellationToken^>(state) != nullptr) {
            CancellationToken token = *dynamic_cast<CancellationToken^>(state);
            WorkerLoop(token);
        }
        else {
            Debug::WriteLine("ManagedCallbacks: Error - CancellationToken not passed correctly to WorkerLoopInternal.");
        }
    }


    ManagedCallbacks::ManagedCallbacks(CallbackPolicy policy) :
        m_policy(policy),
        m_callbackQueue(nullptr),
        m_workerTask(nullptr),
        m_cts(nullptr),
        m_disposing(false),
        m_disposed(false)
    {
        if (m_policy == CallbackPolicy::Queued) {
            m_cts = gcnew CancellationTokenSource();
            m_callbackQueue = gcnew BlockingCollection<IRaiser^>(gcnew ConcurrentQueue<IRaiser^>());
            CancellationToken token = m_cts->Token;
            // Pass the token as state object for WorkerLoopInternal
            m_workerTask = Task::Factory->StartNew(gcnew Action<Object^>(this, &ManagedCallbacks::WorkerLoopInternal),
                token, // Pass token as state
                token, // Pass token for cancellation
                TaskCreationOptions::LongRunning,
                TaskScheduler::Default);                                                                           if (VERBOSE) Debug::WriteLine("ManagedCallbacks: Queued mode initialized, worker task started.");
        }
        else {                                                                                                     if (VERBOSE) Debug::WriteLine("ManagedCallbacks: Initialized in " + m_policy.ToString() + " mode.");
        }
    }


    // Execute a callback (Action delegate) according to the policy
    void ManagedCallbacks::Execute(IRaiser^ action) {
        if (action == nullptr) { Debug::WriteLine("ManagedCallbacks: Attempted to execute a null action."); return; }
        if (m_disposed) { throw gcnew ObjectDisposedException("ManagedCallbacks"); }

        switch (m_policy)
        {
            case CallbackPolicy::Direct:
                try {
                    action->Raise();
                }
                catch (Exception^ ex) {
                    Debug::WriteLine("ManagedCallbacks: Exception in direct execution: " + ex->Message);
                }
                finally {
                    // Return to pool if applicable
                    try {
                        PoolRegistry::Return(action);
                    }
					catch (Exception^ ex) { Debug::WriteLine("ManagedCallbacks: Exception returning action to pool: " + ex->Message); }
				}
                break;

            case CallbackPolicy::ThreadPool:
                // static method reference
                ThreadPool::QueueUserWorkItem(gcnew WaitCallback(&ManagedCallbacks::ThreadPoolCallback), action);
                break;

            case CallbackPolicy::Queued:
                if (m_callbackQueue != nullptr && !m_callbackQueue->IsAddingCompleted && m_cts != nullptr && !m_cts->IsCancellationRequested) {
                    try {
                        m_callbackQueue->Add(action, m_cts->Token);
                    }
                    catch (OperationCanceledException^) { Debug::WriteLine("ManagedCallbacks: Adding to queue cancelled."); }
                    catch (InvalidOperationException^)  { Debug::WriteLine("ManagedCallbacks: Could not add to queue (likely completed or disposed)."); }
                    catch (Exception^ ex)               { Debug::WriteLine("ManagedCallbacks: Error adding to queue: " + ex->Message); }
                }
                else {
                    Debug::WriteLine("ManagedCallbacks: Queued execution attempted but manager is disposed, cancelling, or queue not initialized.");
                }
                break;
        }
    }

    // Helper method to execute an IRaiser when using ThreadPool.QueueUserWorkItem
    void ManagedCallbacks::ThreadPoolCallback(Object^ state) {
        IRaiser^ action = dynamic_cast<IRaiser^>(state);
        if (action != nullptr) {
            try {
                action->Raise();
            }
            catch (Exception^ ex) {
                Debug::WriteLine("ManagedCallbacks: Exception in ThreadPool execution: " + ex->Message);
            }
            finally {
                try {
                    PoolRegistry::Return(action);
                }
                catch (Exception^ ex) {
                    Debug::WriteLine("ManagedCallbacks: Exception returning ThreadPool action to pool: " + ex->Message);
                }
            }
        }
    }

    // Get queue size (only relevant for Queued policy)
    int ManagedCallbacks::QueueSize::get() {
        if (m_policy == CallbackPolicy::Queued && m_callbackQueue != nullptr) {
            return m_callbackQueue->Count;
        }
        return 0;
    }

    void ManagedCallbacks::Disposing(bool disposing) {
        if (!m_disposed) {
            if (disposing) {                                                                                                   if (VERBOSE) Debug::WriteLine("ManagedCallbacks: Disposing...");
                m_disposing = true;
                if (m_cts != nullptr) {
                    if (!m_cts->IsCancellationRequested) {                                                                     if (VERBOSE) Debug::WriteLine("ManagedCallbacks: Requesting cancellation...");
                        m_cts->Cancel();
                    }

                    if (m_callbackQueue != nullptr && !m_callbackQueue->IsAddingCompleted) {                                   if (VERBOSE) Debug::WriteLine("ManagedCallbacks: Completing queue adding...");
                        m_callbackQueue->CompleteAdding();
                    }

                    if (m_workerTask != nullptr && !m_workerTask->IsCompleted) {                                               if (VERBOSE) Debug::WriteLine("ManagedCallbacks: Waiting for worker task...");
                        try {
                            m_workerTask->Wait(TimeSpan::FromSeconds(5));
                        }
                        catch (AggregateException^ aggEx) { aggEx->Handle(gcnew Func<Exception^, bool>(this, &ManagedCallbacks::HandleInnerException));         }
                        catch (Exception^ ex)             { Debug::WriteLine("ManagedCallbacks: Unexpected exception during worker task wait: " + ex->Message); }
                    }
                                                                                                                               if (VERBOSE) Debug::WriteLine("ManagedCallbacks: Worker task finished or timed out.");
                    delete m_cts;
                    m_cts = nullptr;
                }
                if (m_callbackQueue != nullptr) {
                    delete m_callbackQueue;
                    m_callbackQueue = nullptr;
                }                                                                                                              if (VERBOSE) Debug::WriteLine("ManagedCallbacks: Dispose complete.");
            }
            m_disposed = true;
        }
    }

    bool ManagedCallbacks::HandleInnerException(Exception^ inner) {
        Debug::WriteLine("ManagedCallbacks: Exception during worker task wait: " + inner->GetType()->Name);
        return true;
    }

}
