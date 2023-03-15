#ifndef I2C_H
#define I2C_H

#include <stdint.h>
#include <stddef.h>

typedef struct i2c_handle_s {
    int fd;
    uint16_t addr;
} i2c_handle_t, *i2c_handle_p;

#ifdef __cplusplus
extern "C" {
#endif
int i2c_open(const char* dev, i2c_handle_p handle);
int i2c_read(i2c_handle_p handle, uint16_t addr, size_t size, uint8_t* buf);
int i2c_write(i2c_handle_p handle, uint16_t addr, size_t size, uint8_t* buf);
int i2c_write_read(i2c_handle_p handle, uint16_t addr, uint8_t* write_data, size_t write_size, uint8_t* read_data, size_t read_size);
int i2c_close(i2c_handle_p handle);
#ifdef __cplusplus
}
#endif

#endif
