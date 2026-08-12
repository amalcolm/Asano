#pragma once

#include <cstdint>
#include <cstddef>
  
class CMemoryInfo
{
  public:
    struct Ram2Heap
    {
      size_t heapSize;              // whole RAM2 heap range
      size_t mallocArena;           // bytes already handed to malloc/new
      size_t usedInArena;           // currently allocated by malloc/new
      size_t freeInsideArena;       // total free chunks inside malloc arena; not contiguous
      size_t topFreeChunk;          // free chunk at top of malloc arena
      size_t neverGivenToMalloc;    // raw RAM2 heap still above current break
      size_t totalPotentialFree;    // freeInsideArena + neverGivenToMalloc
      size_t topContiguousFreeRaw;  // topFreeChunk + neverGivenToMalloc
    };


    struct Ram1Stack
    {
      size_t    stackAreaTotal;  // RAM1 DTCM stack region after globals/statics
      size_t    stackFreeNow;    // instantaneous headroom below current SP
      uintptr_t bssEnd;
      uintptr_t stackTop;
      uintptr_t stackPointer;
    };

    static Ram2Heap ram2Heap();
    static size_t ram2ContiguousFreeForNew(size_t safetyMargin = 64);
    static Ram1Stack ram1Stack();
    static void print();

  private:
    static uintptr_t addrOfLinkerSymbol(unsigned long* p);
    static uintptr_t currentBreak();
    static uintptr_t currentStackPointer();
};
