import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import * as forge from 'node-forge';
import { Certificado } from './entities/certificado.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { AuthUser } from '../common/decorators/current-user.decorator';

// Upload de PFX/A1: o arquivo é criptografado AES-256-GCM em memória.
// A senha também é criptografada e armazenada de forma segura no mesmo payload.
// A chave mestra deve vir de STORAGE_SECRET_KEY.
@Injectable()
export class CertificadoService {
  constructor(
    @InjectRepository(Certificado) private readonly repo: Repository<Certificado>,
    @InjectRepository(Empresa) private readonly empresas: Repository<Empresa>,
  ) {}

  async upload(file: Express.Multer.File, senha: string, alias: string, user: AuthUser) {
    // 1. Validar PFX (lê o certificado com a senha) — descarta da memória em seguida
    let certInfo: { validade: Date; valido: boolean };
    try {
      const pfxAsn1 = forge.asn1.fromDer(file.buffer.toString('binary'));
      const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, senha);
      const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
      const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert;
      if (!cert) throw new Error('Certificado não encontrado no PFX');
      certInfo = { validade: cert.validity.notAfter, valido: cert.validity.notAfter > new Date() };
    } catch (e) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'PFX inválido ou senha incorreta' });
    }

    // 2. Criptografar o arquivo PFX e a senha com AES-256-GCM (chave derivada de env var)
    const storageKey = process.env.STORAGE_SECRET_KEY;
    if (!storageKey) {
      throw new InternalServerErrorException({ code: 'CONFIGURATION_ERROR', message: 'STORAGE_SECRET_KEY não está configurada' });
    }

    const kek = createHash('sha256').update(storageKey).digest();
    const ivPfx = randomBytes(12);
    const cipherPfx = createCipheriv('aes-256-gcm', kek, ivPfx);
    const encryptedPfx = Buffer.concat([cipherPfx.update(file.buffer), cipherPfx.final()]);
    const tagPfx = cipherPfx.getAuthTag();

    const ivSenha = randomBytes(12);
    const cipherSenha = createCipheriv('aes-256-gcm', kek, ivSenha);
    const encryptedSenha = Buffer.concat([cipherSenha.update(Buffer.from(senha, 'utf8')), cipherSenha.final()]);
    const tagSenha = cipherSenha.getAuthTag();

    const payload = JSON.stringify({
      pfx: encryptedPfx.toString('base64'),
      pfxIv: ivPfx.toString('base64'),
      pfxTag: tagPfx.toString('base64'),
      senha: encryptedSenha.toString('base64'),
      senhaIv: ivSenha.toString('base64'),
      senhaTag: tagSenha.toString('base64'),
    });

    // 3. Persistir o conteúdo criptografado no banco.
    const existing = await this.repo.findOne({ where: { empresaId: user.empresaId, alias: alias || 'default' } });
    const cert = existing ?? this.repo.create({ empresaId: user.empresaId, alias: alias || 'default' });
    cert.arquivoUri = payload;
    cert.validade = certInfo.validade;
    cert.status = certInfo.valido ? 'valido' : 'expirado';
    await this.repo.save(cert);

    return { alias: cert.alias, validade: cert.validade.toISOString(), status: cert.status };
  }

  async status(user: AuthUser) {
    const cert = await this.repo.findOne({ where: { empresaId: user.empresaId }, order: { createdAt: 'DESC' } });
    if (!cert) return { configurado: false, valido: false, validade: null, diasRestantes: null };
    const dias = Math.ceil((cert.validade.getTime() - Date.now()) / 86400000);
    return { configurado: true, valido: cert.status === 'valido', validade: cert.validade.toISOString(), diasRestantes: dias };
  }

  // Descriptografa o PFX em memória APENAS durante a assinatura e descarta em seguida
  async carregarParaAssinatura(empresaId: string): Promise<{ pfxBuffer: Buffer; senha: string }> {
    const cert = await this.repo.findOne({ where: { empresaId }, order: { createdAt: 'DESC' } });
    if (!cert) throw new BadRequestException({ code: 'CERTIFICADO_AUSENTE', message: 'Certificado A1 não configurado' });

    const storageKey = process.env.STORAGE_SECRET_KEY;
    if (!storageKey) {
      throw new InternalServerErrorException({ code: 'CONFIGURATION_ERROR', message: 'STORAGE_SECRET_KEY não está configurada' });
    }

    let payload: {
      pfx: string;
      pfxIv: string;
      pfxTag: string;
      senha: string;
      senhaIv: string;
      senhaTag: string;
    };

    try {
      payload = JSON.parse(cert.arquivoUri);
    } catch (err) {
      throw new InternalServerErrorException({ code: 'CERTIFICADO_INVALIDO', message: 'Certificado armazenado em formato inválido' });
    }

    const kek = createHash('sha256').update(storageKey).digest();

    const decode = (value: string) => Buffer.from(value, 'base64');
    const pfxIv = decode(payload.pfxIv);
    const pfxTag = decode(payload.pfxTag);
    const encryptedPfx = decode(payload.pfx);

    const decipherPfx = createDecipheriv('aes-256-gcm', kek, pfxIv);
    decipherPfx.setAuthTag(pfxTag);
    const pfxBuffer = Buffer.concat([decipherPfx.update(encryptedPfx), decipherPfx.final()]);

    const senhaIv = decode(payload.senhaIv);
    const senhaTag = decode(payload.senhaTag);
    const encryptedSenha = decode(payload.senha);

    const decipherSenha = createDecipheriv('aes-256-gcm', kek, senhaIv);
    decipherSenha.setAuthTag(senhaTag);
    const senhaBuffer = Buffer.concat([decipherSenha.update(encryptedSenha), decipherSenha.final()]);
    const senha = senhaBuffer.toString('utf8');

    return { pfxBuffer, senha };
  }
}