import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './entities/usuario.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { Base44AuthController } from './base44.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => {
        const privateKey = process.env.JWT_PRIVATE_KEY;

        if (!privateKey) {
          throw new Error(
            'JWT_PRIVATE_KEY não configurada. Configure a chave privada RSA no Railway.',
          );
        }

        return {
          privateKey: privateKey.replace(/\\n/g, '\n'),
          signOptions: {
            algorithm: 'RS256',
            expiresIn: Number(process.env.JWT_ACCESS_TTL || 900),
          },
        };
      },
    }),
  ],
  controllers: [AuthController, Base44AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}