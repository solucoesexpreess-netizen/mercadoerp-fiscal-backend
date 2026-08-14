import { Controller, Post, Body, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Base44 Auth Controller
 * 
 * Endpoint para gestorbetao.base44.app autenticar no backend
 * e receber JWT para emitir NFC-e
 */
@Controller('api/v1/base44')
export class Base44AuthController {
  private readonly logger = new Logger('Base44Auth');

  constructor(private jwtService: JwtService) {}

  /**
   * Autenticar gestorbetao.base44.app
   * 
   * POST /api/v1/base44/auth
   * Body: { apiKey, apiSecret }
   * Response: { token, expiresIn, tipo: 'Bearer' }
   */
  @Post('auth')
  async autenticar(@Body() credentials: { apiKey?: string; apiSecret?: string }) {
    if (!credentials.apiKey || !credentials.apiSecret) {
      throw new BadRequestException('apiKey e apiSecret são obrigatórios');
    }

    // Validar contra variáveis de ambiente
    const expectedKey = process.env.BASE44_API_KEY;
    const expectedSecret = process.env.BASE44_API_SECRET;

    if (!expectedKey || !expectedSecret) {
      this.logger.error('BASE44 credenciais não configuradas no .env');
      throw new UnauthorizedException('Servidor não configurado para Base44');
    }

    // Comparar credenciais (tempo constante para evitar timing attacks)
    const keyMatch = this.timingSafeCompare(credentials.apiKey, expectedKey);
    const secretMatch = this.timingSafeCompare(credentials.apiSecret, expectedSecret);

    if (!keyMatch || !secretMatch) {
      this.logger.warn(`❌ Tentativa falhada de autenticação Base44 de ${credentials.apiKey}`);
      throw new UnauthorizedException('apiKey ou apiSecret inválidos');
    }

    // Gerar JWT com claim especial para Base44
    const payload = {
      sub: 'base44',
      origin: 'gestorbetao.base44.app',
      iat: Date.now() / 1000,
    };

    const token = this.jwtService.sign(payload, {
      secret: process.env.JWT_PRIVATE_KEY || 'fallback-key',
      algorithm: 'RS256',
      expiresIn: '1h', // Token válido por 1 hora
    });

    this.logger.log('✅ Base44 autenticado com sucesso');

    return {
      token,
      expiresIn: 3600, // segundos
      tipo: 'Bearer',
      mensagem: 'Use este token no header Authorization para emitir NFC-e',
    };
  }

  /**
   * Comparação de tempo constante para credenciais
   * Previne timing attacks
   */
  private timingSafeCompare(input: string, expected: string): boolean {
    if (input.length !== expected.length) {
      // Ainda fazer algo com o string esperado para manter timing constante
      for (let i = 0; i < expected.length; i++) {
        // eslint-disable-next-line no-bitwise
        expected.charCodeAt(i) ^ 0;
      }
      return false;
    }

    let result = 0;
    for (let i = 0; i < input.length; i++) {
      // eslint-disable-next-line no-bitwise
      result |= input.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return result === 0;
  }
}
