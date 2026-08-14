import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('empresas')
export class Empresa {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 14, unique: true }) cnpj: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) ie: string;
  @Column({ name: 'razao_social', type: 'varchar', length: 255 }) razaoSocial: string;
  @Column({ type: 'varchar', length: 2 }) crt: '1' | '2' | '3';
  @Column({ type: 'varchar', length: 2 }) uf: string;
  @Column({ type: 'enum', enum: ['homologacao', 'producao'], default: 'homologacao' }) ambiente: 'homologacao' | 'producao';
  @Column({ type: 'enum', enum: ['1', '2', '3'], default: '1' }) regime: '1' | '2' | '3';
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null;
}