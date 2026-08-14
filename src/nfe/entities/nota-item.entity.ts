import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('nota_itens')
@Index('idx_nota_itens_nota', ['notaId'])
export class NotaItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'nota_id', type: 'uuid' }) notaId: string;
  @Column({ name: 'produto_id', type: 'uuid', nullable: true }) produtoId: string | null;
  @Column({ name: 'produto_nome', type: 'varchar', length: 255 }) produtoNome: string;
  @Column({ type: 'char', length: 8 }) ncm: string;
  @Column({ type: 'varchar', length: 4 }) cfop: string;
  @Column({ type: 'varchar', length: 3 }) cst: string;
  @Column({ type: 'varchar', length: 3, nullable: true }) csosn: string | null;
  @Column({ type: 'enum', enum: ['0', '1', '2', '3', '4', '5', '6', '7', '8'], default: '0' }) origem: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
  @Column({ type: 'numeric', precision: 14, scale: 3 }) quantidade: number;
  @Column({ name: 'valor_unitario', type: 'numeric', precision: 14, scale: 2 }) valorUnitario: number;
  @Column({ name: 'valor_total', type: 'numeric', precision: 14, scale: 2 }) valorTotal: number;
  @Column({ name: 'aliq_icms', type: 'numeric', precision: 5, scale: 2, default: 0 }) aliqIcms: number;
  @Column({ name: 'aliq_pis', type: 'numeric', precision: 5, scale: 2, default: 0 }) aliqPis: number;
  @Column({ name: 'aliq_cofins', type: 'numeric', precision: 5, scale: 2, default: 0 }) aliqCofins: number;
  @Column({ name: 'aliq_ipi', type: 'numeric', precision: 5, scale: 2, default: 0 }) aliqIpi: number;
}