#include "CCsvSampleQueue.h"

#pragma managed(push, off)

namespace NativeCsv
{
    CCsvSampleQueue::CCsvSampleQueue(size_t capacity)
        : m_buffer(capacity)
    {
    }

    bool CCsvSampleQueue::TryPush(const CCsvSample& sample) noexcept
    {
        std::lock_guard<std::mutex> lock(m_mutex);

        if (m_completed || m_count == m_buffer.size())
            return false;

        m_buffer[m_tail] = sample;
        m_tail = (m_tail + 1) % m_buffer.size();
        ++m_count;
        m_cv.notify_one();

        return true;
    }

    bool CCsvSampleQueue::WaitPop(CCsvSample& sample)
    {
        std::unique_lock<std::mutex> lock(m_mutex);

        m_cv.wait(lock, [this] {
            return m_completed || m_count > 0;
        });

        if (m_count == 0)
            return false;

        sample = m_buffer[m_head];
        m_head = (m_head + 1) % m_buffer.size();
        --m_count;

        return true;
    }

    void CCsvSampleQueue::Complete() noexcept
    {
        {
            std::lock_guard<std::mutex> lock(m_mutex);
            m_completed = true;
        }

        m_cv.notify_all();
    }
}

#pragma managed(pop)
