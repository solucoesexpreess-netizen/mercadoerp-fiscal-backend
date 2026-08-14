import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('numeracao')
export class Numeracao {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'empresa_id', type: 'uuid' }) empresaId: string;
  @Column({ type: 'varchar', length: 3 }) serie: string;
  @Column({ type: 'enum', enum: ['55', '65'] }) modelo: '55' | '65';
  @Column({ name: 'ultimo_numero', type: 'integer', default: 0 }) ultimoNumero: number;
  @Column({ type: 'integer', default: () => "date_part('year', now())::int" }) ano: number;
  @Column({ type: 'integer', default: 1 }) version: number;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}