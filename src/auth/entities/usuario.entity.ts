import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'empresa_id', type: 'uuid' }) empresaId: string;
  @ManyToOne(() => Empresa) empresa: Empresa;
  @Column({ type: 'varchar', length: 255 }) nome: string;
  @Column({ type: 'varchar', length: 255 }) email: string;
  @Column({ name: 'senha_hash', type: 'varchar', length: 255 }) senhaHash: string;
  @Column({ type: 'enum', enum: ['dono', 'gerente', 'atendente'], default: 'atendente' }) role: 'dono' | 'gerente' | 'atendente';
  @Column({ name: 'refresh_token', type: 'varchar', nullable: true }) refreshToken: string | null;
  @Column({ type: 'boolean', default: true }) ativo: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}