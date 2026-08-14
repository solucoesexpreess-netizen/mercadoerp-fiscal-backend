import { Controller, Get, Post, UseGuards, UseInterceptors, UploadedFile, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CertificadoService } from './certificado.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('certificado')
export class CertificadoController {
  constructor(private readonly cert: CertificadoService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @Body('senha') senha: string, @Body('alias') alias: string, @CurrentUser() user: AuthUser) {
    return this.cert.upload(file, senha, alias, user);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) { return this.cert.status(user); }
}