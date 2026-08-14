import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('certificados')
export class Certificado {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'empresa_id', type: 'uuid' }) empresaId: string;
  @Column({ type: 'varchar', length: 100 }) alias: string;
  @Column({ name: 'arquivo_uri', type: 'text' }) arquivoUri: string;
  @Column({ type: 'timestamptz' }) validade: Date;
  @Column({ type: 'enum', enum: ['valido', 'expirado', 'invalido'], default: 'valido' }) status: 'valido' | 'expirado' | 'invalido';
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}