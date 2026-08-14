import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('eventos')
@Index('idx_eventos_nota', ['notaId'])
export class Evento {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'empresa_id', type: 'uuid' }) empresaId: string;
  @Column({ name: 'nota_id', type: 'uuid', nullable: true }) notaId: string | null;
  @Column({ type: 'char', length: 44, nullable: true }) chave: string | null;
  @Column({ type: 'enum', enum: ['110111', '110110', '210200', '210210', '210220', '210240'] }) tipo: string;
  @Column({ type: 'integer', default: 1 }) sequencia: number;
  @Column({ type: 'varchar', length: 20, nullable: true }) protocolo: string | null;
  @Column({ type: 'enum', enum: ['pendente', 'autorizado', 'rejeitado'], default: 'pendente' }) status: 'pendente' | 'autorizado' | 'rejeitado';
  @Column({ type: 'text', nullable: true }) motivo: string | null;
  @Column({ name: 'xml_uri', type: 'text', nullable: true }) xmlUri: string | null;
  @Column({ name: 'data_registro', type: 'timestamptz', default: () => 'now()' }) dataRegistro: Date;
  @Column({ name: 'correlation_id', type: 'varchar', length: 36, nullable: true }) correlationId: string | null;
}