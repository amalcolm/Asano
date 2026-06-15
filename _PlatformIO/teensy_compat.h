// teensy_compat.h
#pragma once

#if defined(__cplusplus)
  #include <cstdarg>
  extern "C" {
    int  vdprintf(int, const char*, va_list);
    char* itoa(int, char*, int);
    char* utoa(unsigned, char*, int);
    char* ltoa(long, char*, int);
    char* ultoa(unsigned long, char*, int);
  }
#else
  #include <stdarg.h>
  int  vdprintf(int, const char*, va_list);
  char* itoa(int, char*, int);
  char* utoa(unsigned, char*, int);
  char* ltoa(long, char*, int);
  char* ultoa(unsigned long, char*, int);
#endif

#ifndef GPT_SR_OC1
#define GPT_SR_OC1   (1u << 2)
#define GPT_SR_OC2   (1u << 3)
#define GPT_SR_OC3   (1u << 4)
#endif

#ifndef GPT_IR_OC1IE
#define GPT_IR_OC1IE   (1u << 2)
#define GPT_IR_OC2IE   (1u << 3)
#define GPT_IR_OC3IE   (1u << 4)
#endif

static __inline__ __UINT32_TYPE__ __get_primask(void) __attribute__((always_inline));
static __inline__ __UINT32_TYPE__ __get_primask(void) \
{ __UINT32_TYPE__ primask = 0; \
  __asm__ volatile ("MRS %[result], PRIMASK\n\t":[result]"=r"(primask)::); \
  return primask;  // returns 0 if interrupts enabled, 1 if disabled
}

static __inline__ void __set_primask(__UINT32_TYPE__ setval) __attribute__((always_inline));
static __inline__ void __set_primask(__UINT32_TYPE__ setval) \
{ __asm__ volatile ("MSR PRIMASK, %[value]\n\t""dmb\n\t""dsb\n\t""isb\n\t"::[value]"r"(setval):);
  __asm__ volatile ("" ::: "memory");
}
