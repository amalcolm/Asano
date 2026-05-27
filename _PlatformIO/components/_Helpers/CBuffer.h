#pragma once

template<typename T>
struct CBufferType {
  private:
    size_t size = 0;
  
  public:
    size_t capacity() const { return size - 1; }  // one slot is always left empty
    T* data = nullptr;

    volatile size_t writeIndex = 0;
    volatile size_t readIndex  = 0;

    explicit CBufferType(size_t bufferSize) {
      bufferSize = max(bufferSize, static_cast<size_t>(2));
      size = bufferSize;
      data = new T[size];
    }

    ~CBufferType() { delete[] data; }

    CBufferType(const CBufferType&) = delete;
    CBufferType& operator=(const CBufferType&) = delete;

    bool isEmpty() const { return writeIndex == readIndex; }
    bool isFull()  const { return ((writeIndex + 1) % size) == readIndex; }
    size_t numStored() const {
      if (writeIndex >= readIndex)
        return writeIndex - readIndex;
      else
        return size - (readIndex - writeIndex);
    }

    size_t numFree() const { return capacity() - numStored(); }

    bool write(const T& item) {
      const size_t wi = writeIndex;  // make atomic (single CPU operation), so should be ISR safe
      const size_t next = (wi + 1) % size;    if (next == readIndex) return false;     // full
      data[wi] = item;
      writeIndex = next;
      return true;
    }

    bool read(T& item) {
      const size_t ri = readIndex;            if (ri == writeIndex) return false;      // empty
      item = data[ri];
      readIndex = (ri + 1) % size;
      return true;
    }

    T* read() {
      const size_t ri = readIndex;            if (ri == writeIndex) return nullptr;    // empty
      T* item = &data[ri];
      readIndex = (ri + 1) % size;
      return item;
    }

    void clear() {
      writeIndex = 0;
      readIndex  = 0;
    }

    std::pair<uint8_t*, size_t> getWriteChunk()
    {
      if (isFull()) return {nullptr, 0}; 

      size_t wi = writeIndex;
      size_t ri = readIndex;

      // free space (one empty slot)
      size_t space = (wi >= ri) ? (size - (wi - ri) - 1) : (ri - wi - 1);

      // contiguous to end, but if ri==0 we must leave last slot empty
      size_t contig = size - wi;
      if (ri == 0) contig -= 1;

      size_t n = (space < contig) ? space : contig;
      return { &data[wi], n };
    }


    bool commitWrite(size_t n) { if (n == 0) return true; else if (n > numFree()) return false;
  
      writeIndex = (writeIndex + n) % size;
      return true;
    }
};

