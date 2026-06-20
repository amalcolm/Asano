#include "CMemoryInfo.h"
#include "CUSB.h"
#include <malloc.h>


extern "C" {
  // Linker symbols from Teensy's imxrt1062_t41.ld.
  extern unsigned long _heap_start; 
  extern unsigned long _heap_end;
  extern unsigned long _ebss;
  extern unsigned long _estack;

  // Teensy core syscall used by malloc/new.
  void* _sbrk(int incr);
}

uintptr_t CMemoryInfo::addrOfLinkerSymbol(unsigned long* p)
{
  return reinterpret_cast<uintptr_t>(p);
}

uintptr_t CMemoryInfo::currentBreak()
{
  // Teensy's _sbrk(0) returns the current break without changing it.
  return reinterpret_cast<uintptr_t>(_sbrk(0));
}

CMemoryInfo::Ram2Heap CMemoryInfo::ram2Heap()
{
  const auto mi = mallinfo();

  const uintptr_t heapStart = addrOfLinkerSymbol(&_heap_start);
  const uintptr_t heapEnd  = addrOfLinkerSymbol(&_heap_end);
  const uintptr_t brk    = currentBreak();

  const size_t heapSize =
    heapEnd > heapStart ? heapEnd - heapStart : 0;

  const size_t neverGiven =
    heapEnd > brk ? heapEnd - brk : 0;

  CMemoryInfo::Ram2Heap r {};
  r.heapSize             = heapSize;
  r.mallocArena          = static_cast<size_t>(mi.arena);
  r.usedInArena          = static_cast<size_t>(mi.uordblks);
  r.freeInsideArena      = static_cast<size_t>(mi.fordblks);
  r.topFreeChunk         = static_cast<size_t>(mi.keepcost);
  r.neverGivenToMalloc   = neverGiven;
  r.totalPotentialFree   = r.freeInsideArena + r.neverGivenToMalloc;
  r.topContiguousFreeRaw = r.topFreeChunk + r.neverGivenToMalloc;
  return r;
}

// This is the useful "can I allocate one big new block from the top?"
// number. new/malloc need metadata/alignment, so don't treat it as an
// exact user-byte maximum. Leave a little margin.
size_t CMemoryInfo::ram2ContiguousFreeForNew(size_t safetyMargin)
{
  const auto r = ram2Heap();
  return r.topContiguousFreeRaw > safetyMargin
    ? r.topContiguousFreeRaw - safetyMargin
    : 0;
}

uintptr_t CMemoryInfo::currentStackPointer()
{
  uintptr_t sp;
  asm volatile ("mov %0, sp" : "=r" (sp));
  return sp;
}


CMemoryInfo::Ram1Stack CMemoryInfo::ram1Stack()
{
  const uintptr_t bssEnd   = addrOfLinkerSymbol(&_ebss);
  const uintptr_t stackTop = addrOfLinkerSymbol(&_estack);
  const uintptr_t sp       = currentStackPointer();

  CMemoryInfo::Ram1Stack r {};
  r.bssEnd         = bssEnd;
  r.stackTop       = stackTop;
  r.stackPointer   = sp;
  r.stackAreaTotal = stackTop > bssEnd ? stackTop - bssEnd : 0;
  r.stackFreeNow   = sp > bssEnd ? sp - bssEnd : 0;
  return r;
}

void CMemoryInfo::print()
{
  const auto h = ram2Heap();
  const auto s = ram1Stack();

  USB.printf("Free space: Stack=%.1lfKB Heap=%.1lfKB\n",
    static_cast<double>(s.stackFreeNow      ) / 1024.0,
    static_cast<double>(h.totalPotentialFree) / 1024.0
  );

}
