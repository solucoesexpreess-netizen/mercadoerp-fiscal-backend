import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { NfeService } from './nfe.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { NfeEmissaoDto, CancelamentoDto, CceDto, InutilizacaoDto } from './dto/nfe.dto';

@UseGuards(JwtAuthGuard)
@Controller('nfe')
export class NfeController {
  constructor(private readonly nfe: NfeService) {}

  @Post()
  emitir(@Body() dto: NfeEmissaoDto, @CurrentUser() user: AuthUser) {
    return this.nfe.emitir(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: { status?: string; page?: number; limit?: number }) {
    return this.nfe.findAll(user, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.nfe.findOne(id, user);
  }

  @Post(':id/enviar')
  enviar(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.nfe.enviar(id, user);
  }

  @Get(':id/status')
  status(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.nfe.status(id, user);
  }

  @Post(':id/cancelar')
  cancelar(@Param('id') id: string, @Body() dto: CancelamentoDto, @CurrentUser() user: AuthUser) {
    return this.nfe.cancelar(id, dto, user);
  }

  @Post(':id/cce')
  cce(@Param('id') id: string, @Body() dto: CceDto, @CurrentUser() user: AuthUser) {
    return this.nfe.cce(id, dto, user);
  }

  @Post('inutilizar')
  inutilizar(@Body() dto: InutilizacaoDto, @CurrentUser() user: AuthUser) {
    return this.nfe.inutilizar(dto, user);
  }
}