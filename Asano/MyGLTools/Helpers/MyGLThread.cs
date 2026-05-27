using OpenTK.GLControl;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Asano.MyGLTools.Helpers
{
    //// <summary>
    /// Manages a dedicated thread for OpenGL rendering to ensure smooth,
    /// non-blocking UI performance.It handles task queuing, frame pacing,
    /// and graceful shutdown.
    //// </summary>
    public class MyGLThread : IDisposable
    {
        public Action? RenderAction
        {
            get => _renderAction;
            set
            {
                if (_isRunning) throw new InvalidOperationException("Cannot change RenderAction while the thread is running.");

                _renderAction = value;
            }
        }
        private Action? _renderAction;

        public bool AutoStart { get; set; } = true;

        private readonly Thread _thread;
        private readonly CancellationTokenSource _cts = new();

        // A queue for one-off actions to be executed on the GL thread (e.g., creating a VBO).
        private readonly BlockingCollection<Action> _tasksToDo = [];

        // A stack for shutdown actions, ensuring LIFO cleanup (e.g., disposing VBOs before the context).
        private readonly ConcurrentStack<Action> _shutdownStack = new();

        public readonly ManualResetEventSlim RenderNow = new(initialState: false);
        private readonly ManualResetEventSlim _frameDone = new(initialState: true);
        private readonly ManualResetEventSlim _tasksAvailable = new(initialState: false);
        private volatile bool _shutdownRequested;

        private readonly GLControl _glControl;

        private volatile bool _isRunning = false;

        public bool IsDisposed => _shutdownRequested;

        public ManualResetEventSlim FrameDone { get => _frameDone; }
        static readonly List<MyGLThread> ActiveGLThreads = [];

        public MyGLThread(GLControl glControl)
        {
            ActiveGLThreads.Add(this);

            _glControl = glControl;

            Scheduler.Register(this);

            _thread = new(Run)
            {
                IsBackground = true,
                Name = $"MyGLThread_{ActiveGLThreads.Count:01}",
                Priority = ThreadPriority.Highest
            };


            _glControl.HandleCreated += (s,e) =>
            {
                Debug.WriteLine($"[MyGLThread] Staring GL thread for {RenderAction?.Target?.GetType().Name}.");

                // Ensure the GLControl is initialized before starting the thread
                if (_glControl.Context == null)
                    throw new InvalidOperationException("GLControl context is not initialized.");

                _glControl.Context.MakeNoneCurrent();

                if (AutoStart)
                {
                    _isRunning = true;
                    _thread.Start();
                }
            };
        }

        
        //// <summary>
        /// Starts the rendering thread with a specific action to be performed each frame.
        //// </summary>
        /// <param name="initAction">An optional one-time setup action (e.g., GL.Enable states).</param>
        /// <param name="shutdownAction">An optional action to be run when the thread disposes.</param>
        public bool Enqueue(Action? initAction = null, Action? shutdownAction = null)
        {
            if (_shutdownRequested) return false;

            if (    initAction != null) _tasksToDo    .Add (    initAction);
            if (shutdownAction != null) _shutdownStack.Push(shutdownAction);

            if (initAction != null)
                _tasksAvailable.Set();
            
            return true;
        }

        public bool EnqueueSwap(Action action)
        {
            if (_shutdownRequested) return false;
            _tasksToDo.Add(action); 
            _tasksToDo.Add(() => _glControl.SwapBuffers());
            _tasksAvailable.Set();
            return true;
        }


        /// <summary>
        /// Enqueues a task to be executed on the GL thread.
        /// </summary>
        public void Invoke(Action action)
        {
            if (!_isRunning || _cts.IsCancellationRequested) return;

            _tasksToDo.Add(action);
            _tasksAvailable.Set();
        }


        private void Run()
        {
            try
            {
                _glControl.MakeCurrent();                                   if (_glControl.Context == null) throw new InvalidOperationException("GLControl context is not initialized.");
                _glControl.Context.SwapInterval = 0;

                WaitHandle[] waits =
                [
                    _cts.Token.WaitHandle,
                    RenderNow.WaitHandle,
                    _tasksAvailable.WaitHandle
                ];

                while (true)
                {
                    int signaled = WaitHandle.WaitAny(waits);
                    if (signaled == 0) // Cancellation requested
                        break;

                    while (true)
                    {
                        while (_tasksToDo.TryTake(out var action, 0))
                        {
                            try { action(); }
                            catch (Exception ex) { Debug.WriteLine($"[MyGLThread] Task Exception: {ex.Message}"); }
                        }

                        _tasksAvailable.Reset();

                        if (_tasksToDo.TryTake(out var lateEntry, 0))
                        {
                            try { lateEntry(); }
                            catch (Exception ex) { Debug.WriteLine($"[MyGLThread] Late Task Exception: {ex.Message}"); }
                        }
                        else
                            break; // no more tasks
                    }

                    if (signaled == 2) continue; // wait was tasksAvailable, so keep looping

                    // wait was RenderNow

                    _glControl.MakeCurrent(); if (_glControl.Context == null) throw new InvalidOperationException("GLControl context is not initialized.");
                    _frameDone.Reset();
                    try
                    {
                        RenderAction?.Invoke();
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"[MyGLThread] RenderAction Exception: {ex.Message}");
                    }
                    finally
                    {
                        _glControl.SwapBuffers();
                        RenderNow.Reset();
                        _frameDone.Set();
                    }
                }
            }
//            catch (Exception ex) { Debug.WriteLine($"[MyGLThread] Exception: {ex.Message}"); }
            finally
            {
                while (_shutdownStack.TryPop(out var action))
                    try { action.Invoke(); }
                    catch (Exception ex) { Debug.WriteLine($"[MyGLThread] Shutdown Action Exception: {ex.Message}"); }
            }


            Debug.WriteLine($"[MyGLThread] Exiting GL thread for {RenderAction?.Target?.GetType().Name}.");
        }

        public void Dispose()
        {
            if (!_isRunning || _shutdownRequested) return;
            _cts.Cancel();
            _isRunning = false;
            _shutdownRequested = true;

            try { _thread.Join(); } catch { }

            _cts.Dispose();
            GC.SuppressFinalize(this);
            Scheduler.Unregister(this);
        }
    }
}