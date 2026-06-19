#pragma once
#pragma managed(push, off)

#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <vector>
#include "CCsvSample.h"

namespace NativeCsv
{
    class CCsvSampleQueue
    {
    public:
        explicit CCsvSampleQueue(size_t capacity);

        CCsvSampleQueue(const CCsvSampleQueue&) = delete;
        CCsvSampleQueue& operator=(const CCsvSampleQueue&) = delete;

        bool TryPush(const CCsvSample& sample) noexcept;
        bool WaitPop(CCsvSample& sample);
        void Complete() noexcept;

    private:
        std::vector<CCsvSample> m_buffer;
        std::mutex m_mutex;
        std::condition_variable m_cv;
        size_t m_head{};
        size_t m_tail{};
        size_t m_count{};
        bool m_completed{};
    };
}

#pragma managed(pop)
