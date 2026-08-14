import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { Usuario } from './entities/usuario.entity';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { LoginDto, RefreshDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usuarios.findOne({
      where: { email: dto.email, ativo: true },
    });
    if (!user || !(await argon2.verify(user.senhaHash, dto.senha))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return this.issueTokens(user);
  }

  async refresh(dto: RefreshDto) {
    try {
      const payload = this.jwt.verify(dto.refreshToken) as AuthUser & { sub: string };
      const user = await this.usuarios.findOne({ where: { id: payload.sub, ativo: true } });
      if (!user || user.refreshToken !== dto.refreshToken) {
        throw new UnauthorizedException('Refresh token inválido');
      }
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token expirado ou inválido');
    }
  }

  private async issueTokens(user: Usuario) {
    const payload: AuthUser = { id: user.id, empresaId: user.empresaId, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: Number(process.env.JWT_ACCESS_TTL || 900) });
    const refreshToken = await this.jwt.signAsync({ ...payload, sub: user.id }, {
      expiresIn: Number(process.env.JWT_REFRESH_TTL || 604800),
    });
    await this.usuarios.update(user.id, { refreshToken });
    return {
      accessToken,
      refreshToken,
      expiresIn: Number(process.env.JWT_ACCESS_TTL || 900),
      usuario: { id: user.id, nome: user.nome, email: user.email, empresaId: user.empresaId, role: user.role },
    };
  }
}