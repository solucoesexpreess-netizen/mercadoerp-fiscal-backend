import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('pagamentos')
@Index('idx_pagamentos_nota', ['notaId'])
export class Pagamento {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'nota_id', type: 'uuid' }) notaId: string;
  @Column({ type: 'enum', enum: ['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'FIADO', 'SEM_PAGAMENTO'] }) forma: string;
  @Column({ type: 'numeric', precision: 14, scale: 2 }) valor: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}