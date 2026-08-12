#pragma once

#include <cstddef>
#include <cstdint>   // For uint16_t and uint32_t
#include <type_traits>
#include <vector>
#include <deque>
#include <utility> // pair

template<typename T>
class CRunningAverage {
public:
    using SumType = std::conditional_t<std::is_floating_point_v<T>, T, uint32_t>;

    explicit CRunningAverage(size_t windowSize = 16) {
        reset(windowSize); 
    }

    void reset(size_t windowSize) {
        m_values.assign(windowSize > 0 ? windowSize : 1, 0);
        m_sum = 0;
        m_head = 0;
        m_count = 0;
        m_seq = 0;
    }


    void add(T value) {
        const size_t W = m_values.size();
        if (m_count == W)
          m_sum -= m_values[m_head];
        else
          m_count++;

        m_sum += value;
        m_values[m_head] = value;

        if (++m_head == W) m_head = 0;
        m_seq++;
    }

    double   getAverage() const { return m_count ? static_cast<double>(m_sum) / m_count : 0.0; }
    size_t   getCount()   const { return m_count; }
    bool     isFull()     const { return m_count == m_values.size(); }

protected:
    std::vector<T> m_values;
    SumType  m_sum{};
    uint32_t m_count{};
    size_t   m_head{};
    size_t   m_seq{}; // monotonically increasing

};

template<typename T>
class CRunningAverageMinMax : public CRunningAverage<T> {
public:
    explicit CRunningAverageMinMax(size_t windowSize = 16) : CRunningAverage<T>(windowSize) {
       m_minq.clear(); m_maxq.clear();
    }

    void reset(size_t windowSize) {
        CRunningAverage<T>::reset(windowSize); 
        m_minq.clear(); m_maxq.clear();
    }
    
    void add(T value) {
        CRunningAverage<T>::add(value);
        const size_t W = this->m_values.size();
  
        // Min deque: pop larger tails, then push
        while (!m_minq.empty() && m_minq.back().first >= value) m_minq.pop_back();
        m_minq.emplace_back(value, this->m_seq);

        // Max deque: pop smaller tails, then push
        while (!m_maxq.empty() && m_maxq.back().first <= value) m_maxq.pop_back();
        m_maxq.emplace_back(value, this->m_seq);
        // Expire anything that fell out of the window
        const size_t expireBefore = (this->m_seq > W) ? (this->m_seq - W) : 0;
        while (!m_minq.empty() && m_minq.front().second <= expireBefore) m_minq.pop_front();
        while (!m_maxq.empty() && m_maxq.front().second <= expireBefore) m_maxq.pop_front();
    }

    T getMin()     const { return this->m_count ? m_minq.front().first : 0; }
    T getMax()     const { return this->m_count ? m_maxq.front().first : 0; }
private:

    std::deque<std::pair<T,size_t>> m_minq, m_maxq;

};
