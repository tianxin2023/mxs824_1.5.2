/*******************************************************************************
 *                                                                             *
 * Copyright (C) 2011 - 2018                                                   *
 *         Dolphin Interconnect Solutions AS                                   *
 *                                                                             *
 *    All rights reserved                                                      *
 *                                                                             *
 *                                                                             *
 *******************************************************************************/

#ifndef _PMC_H_
#define _PMC_H_

#include <stdint.h>

#if __GNUC__ > 4 || (__GNUC__ == 4 && __GNUC_MINOR__ >= 3)
#define byteswap_ulong(val) (uint32_t)__builtin_bswap32((int)val)
#else
#define byteswap_ulong(val) (((val & 0xFF000000) >> 24) | \
                             ((val & 0x00FF0000) >> 8) | \
                             ((val & 0x0000FF00) << 8) | \
                             (val                << 24))
#endif

#if __GNUC__ > 4 || (__GNUC__ == 4 && __GNUC_MINOR__ >= 8)
#define byteswap(val) (uint16_t)__builtin_bswap16((int)val)
#else
#define byteswap(val) (((val & 0xFF00) >> 8) | \
                       ((val & 0x00FF) << 8))
#endif

typedef enum pmc_type_e {
    SWITCHTEC_FW_TYPE_BOOT = 0x0,
    SWITCHTEC_FW_TYPE_MAP0 = 0x1,
    SWITCHTEC_FW_TYPE_MAP1 = 0x2,
    SWITCHTEC_FW_TYPE_IMG0 = 0x3,
    SWITCHTEC_FW_TYPE_DAT0 = 0x4,
    SWITCHTEC_FW_TYPE_DAT1 = 0x5,
    SWITCHTEC_FW_TYPE_NVLOG = 0x6,
    SWITCHTEC_FW_TYPE_IMG1 = 0x7,
    SWITCHTEC_FW_TYPE_SEEPROM = 0xFE
} pmc_type_t, *pmc_type_p;

typedef struct pmc_header_s {
    char     magic[4];
    uint32_t length;
    uint32_t type;
    uint32_t load_addr;
    uint32_t version;
    uint32_t rsvd[9];
    uint32_t header_crc;
    uint32_t image_crc;
} __attribute__((packed)) pmc_header_t, *pmc_header_p;

typedef struct pmc_s {
    int valid;
    pmc_header_p header;
    const char* type;
    uint8_t* content;
} pmc_t, *pmc_p;


#ifdef __cplusplus
extern "C" {
#endif
int pmc_load(uint8_t* buf, size_t length, pmc_p pmc);
void pmc_update_crc(pmc_p pmc);
const char* pmc_type_str(pmc_type_t type);
void pmc_version_str(uint32_t version, char *buf, size_t buflen);
const char* pmc_get_error(const char* function);
#ifdef __cplusplus
}
#endif

#endif /* _PMC_H_ */
