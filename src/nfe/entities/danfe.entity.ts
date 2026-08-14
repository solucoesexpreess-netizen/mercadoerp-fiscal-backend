import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('danfes')
@Index('idx_danfes_nota', ['notaId'])
export class DanfeEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'nota_id', type: 'uuid' }) notaId: string;
  @Column({ type: 'char', length: 44 }) chave: string;
  @Column({ type: 'text' }) uri: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}