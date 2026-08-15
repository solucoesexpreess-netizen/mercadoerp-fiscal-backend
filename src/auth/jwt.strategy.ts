import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const publicKey = process.env.JWT_PUBLIC_KEY;

    if (!publicKey) {
      throw new Error(
        'JWT_PUBLIC_KEY nÃ£o configurada. Configure a chave pÃºblica RSA no Railway.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: publicKey.replace(/\\n/g, '\n'),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: AuthUser): Promise<AuthUser> {
    return {
      id: payload.id,
      empresaId: payload.empresaId,
      role: payload.role,
    };
  }
}