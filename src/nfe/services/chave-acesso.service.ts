import { Injectable, BadRequestException } from '@nestjs/common';
import { UF_CODES } from './sefaz-urls';

/**
 * ChaveAcessoService — geração da chave de acesso de 44 dígitos conforme MOC 4.00.
 *
 * Estrutura: cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9) + tpEmis(1) + cNF(8) + cDV(1)
 * O dígito verificador (cDV) é calculado pelo módulo 11, pesos 2..9 da direita para a esquerda.
 */
export interface ChaveAcessoParams {
  uf: string;
  dataEmissao: Date;
  cnpj: string;
  modelo: string;
  serie: string;
  numero: number;
  formaEmissao?: string; // tpEmis — default '1' (Normal)
  cNF?: string; // 8 dígitos — gerado aleatoriamente se não informado
}

export interface ChaveDecomposta {
  cUF: string;
  aamm: string;
  cnpj: string;
  modelo: string;
  serie: string;
  numero: string;
  tpEmis: string;
  cNF: string;
  cDV: string;
}

@Injectable()
export class ChaveAcessoService {
  /**
   * Calcula o dígito verificador pelo módulo 11 (pesos 2..9, da direita para esquerda).
   * Regra oficial NT 2012/003 — MOC 4.00.
   */
  calcularDV(chave43: string): number {
    if (!/^\d{43}$/.test(chave43)) {
      throw new BadRequestException('A chave para cálculo do DV deve ter exatamente 43 dígitos numéricos.');
    }
    const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;
    let w = 0;
    for (let i = chave43.length - 1; i >= 0; i--, w++) {
      soma += Number(chave43[i]) * pesos[w % 8];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  /**
   * Gera a chave de acesso completa (44 dígitos).
   */
  gerar(params: ChaveAcessoParams): string {
    const cUF = UF_CODES[params.uf.toUpperCase()];
    if (!cUF) {
      throw new BadRequestException(`UF inválida para chave de acesso: ${params.uf}`);
    }
    const aamm =
      String(params.dataEmissao.getFullYear()).slice(-2).padStart(2, '0') +
      String(params.dataEmissao.getMonth() + 1).padStart(2, '0');
    const cnpj = String(params.cnpj).replace(/\D/g, '').padStart(14, '0').slice(0, 14);
    const modelo = String(params.modelo).padStart(2, '0').slice(0, 2);
    const serie = String(params.serie).padStart(3, '0').slice(0, 3);
    const numero = String(params.numero).padStart(9, '0').slice(0, 9);
    const tpEmis = String(params.formaEmissao ?? '1').padStart(1, '0').slice(0, 1);
    const cNF = (params.cNF ?? this.gerarCNF()).padStart(8, '0').slice(0, 8);
    const base = `${cUF}${aamm}${cnpj}${modelo}${serie}${numero}${tpEmis}${cNF}`;
    return `${base}${this.calcularDV(base)}`;
  }

  /**
   * Gera o código numérico (cNF) de 8 dígitos.
   * Conforme MOC, recomenda-se que não comece com zero para evitar ambiguidade,
   * mas o layout aceita qualquer valor de 8 dígitos.
   */
  private gerarCNF(): string {
    const n = Math.floor(Math.random() * 100000000);
    return String(n).padStart(8, '0');
  }

  /**
   * Decompõe uma chave de 44 dígitos nos seus campos constituintes.
   */
  decompor(chave: string): ChaveDecomposta {
    if (!/^\d{44}$/.test(chave)) {
      throw new BadRequestException('Chave de acesso inválida — deve ter 44 dígitos numéricos.');
    }
    return {
      cUF: chave.slice(0, 2),
      aamm: chave.slice(2, 6),
      cnpj: chave.slice(6, 20),
      modelo: chave.slice(20, 22),
      serie: chave.slice(22, 25),
      numero: chave.slice(25, 34),
      tpEmis: chave.slice(34, 35),
      cNF: chave.slice(35, 43),
      cDV: chave.slice(43, 44),
    };
  }

  /**
   * Valida a consistência de uma chave de acesso (DV e comprimento).
   */
  validar(chave: string): boolean {
    if (!/^\d{44}$/.test(chave)) return false;
    const base = chave.slice(0, 43);
    return Number(chave.slice(43)) === this.calcularDV(base);
  }
}