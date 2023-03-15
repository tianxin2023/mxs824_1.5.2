/*******************************************************************************
 *                                                                             *
 * Copyright (C) 2011 - 2018                                                   *
 *         Dolphin Interconnect Solutions AS                                   *
 *                                                                             *
 *    All rights reserved                                                      *
 *                                                                             *
 *                                                                             *
 *******************************************************************************/

#ifndef _PFX_CRC32_H_
#define _PFX_CRC32_H_

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif
uint32_t pfx_crc32(uint8_t *msg_ptr, uint32_t byte_cnt, uint32_t oldchksum, int init, int last);
#ifdef __cplusplus
}
#endif

#endif /* _PFX_CRC32_H_ */
