import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_PUBLIC_KEY_PATH
        ? readFileSyncPublic()
        : 'dev-insecure-secret',
      algorithms: ['RS256', 'HS256'],
    });
  }

  async validate(payload: AuthUser): Promise<AuthUser> {
    return { id: payload.id, empresaId: payload.empresaId, role: payload.role };
  }
}

function readFileSyncPublic(): string {
  // lazy require para não quebrar em ambientes sem fs
  const fs = require('fs');
  return fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH!, 'utf8');
}