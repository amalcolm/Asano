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
