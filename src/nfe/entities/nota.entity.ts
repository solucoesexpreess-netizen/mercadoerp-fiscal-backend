import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type StatusNota =
  | 'RASCUNHO' | 'VALIDADA' | 'XML_GERADO' | 'ASSINADA'
  | 'FILA_ENVIO' | 'ENVIADA' | 'PROCESSANDO'
  | 'AUTORIZADA' | 'REJEITADA' | 'CANCELADA' | 'DENEGADA' | 'INUTILIZADA';

@Entity('notas')
export class Nota {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'empresa_id', type: 'uuid' }) empresaId: string;
  @Column({ name: 'cliente_id', type: 'uuid', nullable: true }) clienteId: string | null;
  @Column({ type: 'varchar', length: 9 }) numero: string;
  @Column({ type: 'varchar', length: 3 }) serie: string;
  @Column({ type: 'enum', enum: ['55', '65'] }) modelo: '55' | '65';
  @Column({ type: 'char', length: 44, nullable: true }) chave: string | null;
  @Column({ name: 'forma_emissao', type: 'varchar', length: 1, default: '1' }) formaEmissao: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) protocolo: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) recibo: string | null;
  @Column({ type: 'enum', enum: [
    'RASCUNHO','VALIDADA','XML_GERADO','ASSINADA','FILA_ENVIO','ENVIADA','PROCESSANDO',
    'AUTORIZADA','REJEITADA','CANCELADA','DENEGADA','INUTILIZADA',
  ], default: 'RASCUNHO' }) status: StatusNota;
  @Column({ name: 'valor_total', type: 'numeric', precision: 14, scale: 2, default: 0 }) valorTotal: number;
  @Column({ name: 'data_emissao', type: 'timestamptz' }) dataEmissao: Date;
  @Column({ type: 'enum', enum: ['homologacao', 'producao'], default: 'homologacao' }) ambiente: 'homologacao' | 'producao';
  @Column({ name: 'motivo_rejeicao', type: 'text', nullable: true }) motivoRejeicao: string | null;
  @Column({ name: 'venda_id', type: 'varchar', length: 36, nullable: true }) vendaId: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}