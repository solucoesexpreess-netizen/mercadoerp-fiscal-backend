import { IsString, IsArray, IsBoolean, IsOptional, IsNumber, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { FormaPagamento } from '../../../contracts/types';

export class ItemEmissaoDto {
  @IsUUID() produtoId: string;
  @IsNumber() quantidade: number;
  @IsNumber() valorUnitario: number;
  @IsOptional() @IsString() cfop?: string;
}

export class PagamentoDto {
  @IsString() forma: FormaPagamento;
  @IsNumber() valor: number;
}

export class NfeEmissaoDto {
  @IsOptional() @IsUUID() empresaId?: string;
  @IsOptional() @IsUUID() clienteId?: string | null;
  @IsString() modelo: '55' | '65';
  @IsString() serie: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemEmissaoDto) itens: ItemEmissaoDto[];
  @ValidateNested() @Type(() => PagamentoDto) pagamento: PagamentoDto;
  @IsOptional() @IsBoolean() enviar?: boolean;
}

export class CancelamentoDto {
  @IsString() justificativa: string;
}

export class CceCorrecaoDto {
  @IsString() grupo: string;
  @IsString() campo: string;
  @IsString() valor: string;
}

export class CceDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CceCorrecaoDto) correcoes: CceCorrecaoDto[];
}

export class InutilizacaoDto {
  @IsString() serie: string;
  @IsString() modelo: '55' | '65';
  @IsNumber() numeroInicial: number;
  @IsNumber() numeroFinal: number;
  @IsString() justificativa: string;
}