using TheLib.Packets;

namespace Asano.Caldera
{
    internal sealed class BufferedPoster<TMessage> where TMessage : class, IWebMessage
    {
        private readonly object _lock = new();
        private readonly CalderaControl _control;
        private readonly Func<bool> _canPost;
        private readonly Func<TMessage> _createMessage;
        private readonly Action<TMessage, TMessage> _copyMessage;
        private readonly Func<TMessage, bool> _isValid;
        private readonly Func<TMessage, string> _createJson;
        private readonly Func<string, bool> _postJson;
        private readonly MethodInvoker _flushInvoker;

        private readonly TMessage _pendingMessage;
        private readonly TMessage _messageToPost;
        private readonly TMessage _lastMessagePosted;

        private bool _hasPendingMessage;
        private bool _forcePendingMessage;
        private bool _hasLastMessagePosted;
        private int _flushScheduled;

        public BufferedPoster(
            CalderaControl control,
            Func<bool> canPost,
            Func<TMessage> createMessage,
            Action<TMessage, TMessage> copyMessage,
            Func<TMessage, bool> isValid,
            Func<TMessage, string> createJson,
            Func<string, bool> postJson)
        {
            _control = control ?? throw new ArgumentNullException(nameof(control));
            _canPost = canPost ?? throw new ArgumentNullException(nameof(canPost));
            _createMessage = createMessage ?? throw new ArgumentNullException(nameof(createMessage));
            _copyMessage = copyMessage ?? throw new ArgumentNullException(nameof(copyMessage));
            _isValid = isValid ?? throw new ArgumentNullException(nameof(isValid));
            _createJson = createJson ?? throw new ArgumentNullException(nameof(createJson));
            _postJson = postJson ?? throw new ArgumentNullException(nameof(postJson));
            _flushInvoker = FlushPendingMessage;

            _pendingMessage = _createMessage();
            _messageToPost = _createMessage();
            _lastMessagePosted = _createMessage();
        }

        public bool Post(TMessage message, bool force = false)
        {
            if (!_canPost() || (!force && !_isValid(message)))
                return false;

            lock (_lock)
            {
                if (!force)
                {
                    if (_hasPendingMessage && message.Equals(_pendingMessage))
                        return false;

                    if (!_hasPendingMessage && _hasLastMessagePosted && message.Equals(_lastMessagePosted))
                        return false;
                }

                _copyMessage(_pendingMessage, message);
                _hasPendingMessage = true;
                _forcePendingMessage |= force;
            }

            return ScheduleFlush();
        }

        public void Clear()
        {
            lock (_lock)
            {
                _hasPendingMessage = false;
                _forcePendingMessage = false;
            }
        }

        private bool ScheduleFlush()
        {
            if (!_canPost())
                return false;

            if (Interlocked.Exchange(ref _flushScheduled, 1) != 0)
                return true;

            try
            {
                _control.BeginInvoke(_flushInvoker);
                return true;
            }
            catch (InvalidOperationException)
            {
                Interlocked.Exchange(ref _flushScheduled, 0);
                return false;
            }
        }

        private void FlushPendingMessage()
        {
            Interlocked.Exchange(ref _flushScheduled, 0);

            if (!_canPost())
                return;

            bool force;
            lock (_lock)
            {
                if (!_hasPendingMessage)
                    return;

                _copyMessage(_messageToPost, _pendingMessage);
                force = _forcePendingMessage;
                _hasPendingMessage = false;
                _forcePendingMessage = false;
            }

            if (!force && _hasLastMessagePosted && _messageToPost.Equals(_lastMessagePosted))
                return;

            if (_postJson(_createJson(_messageToPost)))
            {
                _copyMessage(_lastMessagePosted, _messageToPost);
                _hasLastMessagePosted = true;
            }
        }
    }
}
