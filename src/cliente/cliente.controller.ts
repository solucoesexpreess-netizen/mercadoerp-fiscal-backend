import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClienteService } from './cliente.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Cliente } from './entities/cliente.entity';

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClienteController {
  constructor(private readonly cliente: ClienteService) {}

  @Post() create(@Body() dto: Partial<Cliente>, @CurrentUser() user: AuthUser) { return this.cliente.create(dto, user); }
  @Get() findAll(@CurrentUser() user: AuthUser, @Query() query: { q?: string; page?: number; limit?: number }) { return this.cliente.findAll(user, query); }
  @Put(':id') update(@Param('id') id: string, @Body() dto: Partial<Cliente>, @CurrentUser() user: AuthUser) { return this.cliente.update(id, dto, user); }
}