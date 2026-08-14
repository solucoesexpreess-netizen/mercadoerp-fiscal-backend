import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ProdutoService } from './produto.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Produto } from './entities/produto.entity';

@UseGuards(JwtAuthGuard)
@Controller('produtos')
export class ProdutoController {
  constructor(private readonly produto: ProdutoService) {}

  @Post() create(@Body() dto: Partial<Produto>, @CurrentUser() user: AuthUser) { return this.produto.create(dto, user); }
  @Get() findAll(@CurrentUser() user: AuthUser, @Query() query: { q?: string; page?: number; limit?: number }) { return this.produto.findAll(user, query); }
}