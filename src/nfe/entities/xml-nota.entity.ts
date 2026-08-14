import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('xmls')
@Index('idx_xmls_nota', ['notaId'])
@Index('idx_xmls_chave', ['chave'])
export class XmlNota {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'nota_id', type: 'uuid', nullable: true }) notaId: string | null;
  @Column({ type: 'char', length: 44, nullable: true }) chave: string | null;
  @Column({ type: 'varchar', length: 20 }) tipo: 'enviado' | 'autorizado' | 'cancelado' | 'cce' | 'inutilizacao';
  @Column({ type: 'text' }) conteudo: string;
  @Column({ type: 'text', nullable: true }) uri: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}