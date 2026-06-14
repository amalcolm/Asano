#pragma once
#include <cstddef>
#include <array>

template <typename T, size_t N>
class MyQueue {
private:
    std::array<T, N> data;
    size_t head = 0;
    size_t tail = 0;
    size_t count = 0;

public:
  MyQueue() { data.fill(T{}); }

  T* getNext() {           if (count == N) return nullptr;
    T* item = &data[tail];
    tail = (tail + 1) % N;
    count++;
    return item;
  }

  bool returnFirst() {      if (count == 0) return false;
    head = (head + 1) % N;
    count--;
    return true;
  }

  inline T* peek() {       if (count == 0) return nullptr;
    return &data[head];
  }

  inline void clear() { head = tail = count = 0; }

  inline bool   isEmpty() const { return count == 0; }
  inline bool   isFull()  const { return count == N; }
  inline size_t size()    const { return count;      }
};
