import { Get, Post, Put, Delete, Body, Param } from '@nestjs/common';

export abstract class BaseController<T> {
  protected constructor(protected readonly service: any) {}

  @Get()
  async findAll(): Promise<T[]> {
    return this.service.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<T> {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() data: any): Promise<T> {
    return this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any): Promise<T> {
    return this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<T> {
    return this.service.delete(id);
  }
}
