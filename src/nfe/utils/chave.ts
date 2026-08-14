// Códigos IBGE das UF (usados na chave de acesso NF-e)
export const UF_CODES: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53',
  ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15',
  PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43',
  RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17',
};

// Dígito verificador da chave — módulo 11, pesos 2..9 da direita para esquerda
export function calcularDV(chave43: string): number {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  for (let i = chave43.length - 1, w = 0; i >= 0; i--, w++) {
    sum += Number(chave43[i]) * weights[w % 8];
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

// Gera chave de acesso de 44 dígitos:
// cUF(2) + AAMM(4) + CNPJ(14) + modelo(2) + serie(3) + numero(9) + tpEmis(1) + cNF(8) + DV(1)
export function gerarChaveAcesso(params: {
  uf: string; dataEmissao: Date; cnpj: string; modelo: string;
  serie: string; numero: number; formaEmissao?: string;
}): string {
  const { uf, dataEmissao, cnpj, modelo, serie, numero, formaEmissao = '1' } = params;
  const cUF = UF_CODES[uf] ?? '35';
  const aamm =
    String(dataEmissao.getFullYear()).slice(-2).padStart(2, '0') +
    String(dataEmissao.getMonth() + 1).padStart(2, '0');
  const cnpjDigits = String(cnpj).replace(/\D/g, '').padStart(14, '0').slice(0, 14);
  const modP = String(modelo).padStart(2, '0').slice(0, 2);
  const serieP = String(serie).padStart(3, '0').slice(0, 3);
  const numeroP = String(numero).padStart(9, '0').slice(0, 9);
  const cNF = String(Math.floor(Math.random() * 100000000)).padStart(8, '0').slice(0, 8);
  const base = `${cUF}${aamm}${cnpjDigits}${modP}${serieP}${numeroP}${formaEmissao}${cNF}`;
  return base + String(calcularDV(base));
}