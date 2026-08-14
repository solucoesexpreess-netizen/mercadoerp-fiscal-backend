import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('produtos')
export class Produto {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'empresa_id', type: 'uuid' }) empresaId: string;
  @Column({ type: 'varchar', length: 255 }) nome: string;
  @Column({ name: 'codigo_barras', type: 'varchar', length: 20, nullable: true }) codigoBarras: string | null;
  @Column({ type: 'char', length: 8 }) ncm: string;
  @Column({ type: 'varchar', length: 10, nullable: true }) cest: string | null;
  @Column({ type: 'varchar', length: 4 }) cfop: string;
  @Column({ type: 'enum', enum: ['un', 'kg', 'lt', 'cx', 'pct', 'ml', 'g'], default: 'un' }) unidade: 'un' | 'kg' | 'lt' | 'cx' | 'pct' | 'ml' | 'g';
  @Column({ name: 'preco_custo', type: 'numeric', precision: 14, scale: 2 }) precoCusto: number;
  @Column({ name: 'preco_venda', type: 'numeric', precision: 14, scale: 2 }) precoVenda: number;
  @Column({ type: 'numeric', precision: 14, scale: 3, default: 0 }) estoque: number;
  @Column({ name: 'estoque_minimo', type: 'numeric', precision: 14, scale: 3, default: 5 }) estoqueMinimo: number;
  @Column({ type: 'varchar', length: 3, default: '00' }) cst: string;
  @Column({ type: 'varchar', length: 3, default: '102' }) csosn: string;
  @Column({ type: 'enum', enum: ['0', '1', '2', '3', '4', '5', '6', '7', '8'], default: '0' }) origem: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}