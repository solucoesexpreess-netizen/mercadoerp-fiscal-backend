import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('clientes')
export class Cliente {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'empresa_id', type: 'uuid' }) empresaId: string;
  @Column({ type: 'varchar', length: 255 }) nome: string;
  @Column({ name: 'cpf_cnpj', type: 'varchar', length: 14, nullable: true }) cpfCnpj: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) telefone: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) email: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) logradouro: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) numero: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) complemento: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) bairro: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) municipio: string | null;
  @Column({ type: 'varchar', length: 2, nullable: true }) uf: string | null;
  @Column({ type: 'varchar', length: 8, nullable: true }) cep: string | null;
  @Column({ name: 'saldo_devedor', type: 'numeric', precision: 14, scale: 2, default: 0 }) saldoDevedor: number;
  @Column({ name: 'limite_credito', type: 'numeric', precision: 14, scale: 2, default: 0 }) limiteCredito: number;
  @Column({ type: 'varchar', length: 10, default: 'ativo' }) status: 'ativo' | 'bloqueado';
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}