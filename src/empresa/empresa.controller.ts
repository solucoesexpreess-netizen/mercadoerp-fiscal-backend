import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Empresa } from './entities/empresa.entity';

@UseGuards(JwtAuthGuard)
@Controller('empresa')
export class EmpresaController {
  constructor(private readonly empresa: EmpresaService) {}

  @Get()
  findOne(@CurrentUser() user: AuthUser) { return this.empresa.findOne(user); }

  @Put()
  update(@Body() dto: Partial<Empresa>, @CurrentUser() user: AuthUser) { return this.empresa.update(dto, user); }
}