/**
 * Contrato de tipos compartilhado — Backend Fiscal MercadoERP
 * Base para o Base44 (frontend) e o backend Node.js/NestJS.
 * Single source of truth: importe de ambos os lados.
 */

// ─────────────────────────────────────────────
// Erros
// ─────────────────────────────────────────────
export type ErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'VALIDATION_ERROR' | 'CERTIFICADO_AUSENTE' | 'SEFAZ_REJEITADA'
  | 'CONFLITO_NUMERACAO' | 'RATE_LIMIT' | 'INTERNAL';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface ApiSuccess<T> {
  data: T;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

// ─────────────────────────────────────────────
// Enums de domínio
// ─────────────────────────────────────────────
export type StatusNota =
  | 'RASCUNHO' | 'VALIDADA' | 'XML_GERADO' | 'ASSINADA'
  | 'FILA_ENVIO' | 'ENVIADA' | 'PROCESSANDO'
  | 'AUTORIZADA' | 'REJEITADA' | 'CANCELADA' | 'DENEGADA' | 'INUTILIZADA';

export const STATUS_NOTA_FINAL: StatusNota[] = [
  'AUTORIZADA', 'REJEITADA', 'CANCELADA', 'DENEGADA', 'INUTILIZADA',
];

export type Ambiente = 'homologacao' | 'producao';
export type ModeloNf = '55' | '65'; // 55=NF-e, 65=NFC-e
export type Regime = '1' | '2' | '3'; // 1=Simples, 2=Presumido, 3=Real
export type Crt = '1' | '2' | '3';
export type FormaPagamento = 'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'FIADO' | 'SEM_PAGAMENTO';
export type TipoEvento = '110111' | '110110' | '210200' | '210210' | '210220' | '210240'; // cancelamento, cce, manifestações
export type Role = 'dono' | 'gerente' | 'atendente';

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────
export interface LoginRequest { email: string; senha: string; }
export interface Usuario { id: string; nome: string; email: string; empresaId: string; role: Role; }
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // segundos
  usuario: Usuario;
}
export interface RefreshRequest { refreshToken: string; }
export interface RefreshResponse { accessToken: string; refreshToken: string; expiresIn: number; }

// ─────────────────────────────────────────────
// Empresa
// ─────────────────────────────────────────────
export interface Empresa {
  id: string;
  cnpj: string;
  ie: string;
  razaoSocial: string;
  crt: Crt;
  uf: string;
  ambiente: Ambiente;
  regime: Regime;
}
export interface EmpresaUpdate { razaoSocial?: string; ie?: string; uf?: string; crt?: Crt; ambiente?: Ambiente; regime?: Regime; }

// ─────────────────────────────────────────────
// Certificado
// ─────────────────────────────────────────────
export interface CertificadoStatus {
  configurado: boolean;
  valido: boolean;
  validade: string | null; // ISO
  diasRestantes: number | null;
}
export interface CertificadoUploadResponse {
  alias: string;
  validade: string; // ISO
  status: 'valido' | 'expirado' | 'invalido';
}

// ─────────────────────────────────────────────
// Endereço / Cliente
// ─────────────────────────────────────────────
export interface Endereco {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}
export interface Cliente {
  id: string;
  nome: string;
  cpfCnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: Endereco | null;
  saldoDevedor: number;
}
export interface ClienteInput {
  nome: string;
  cpfCnpj?: string;
  telefone?: string;
  email?: string;
  endereco?: Endereco;
}

// ─────────────────────────────────────────────
// Produto / Tributação
// ─────────────────────────────────────────────
export interface Tributacao {
  cst: string;     // ex: '00'
  csosn?: string;  // Simples Nacional
  origem: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
  cfop: string;
  ncm: string;
  cest?: string;
  aliqIcms: number;
  aliqPis: number;
  aliqCofins: number;
  aliqIpi?: number;
}
export interface Produto {
  id: string;
  nome: string;
  codigoBarras: string | null;
  ncm: string;
  cest: string | null;
  cfop: string;
  unidade: 'un' | 'kg' | 'lt' | 'cx' | 'pct' | 'ml' | 'g';
  precoCusto: number;
  precoVenda: number;
  estoque: number;
  tributacao: Tributacao;
}
export interface ProdutoInput {
  nome: string;
  codigoBarras?: string;
  ncm: string;
  cest?: string;
  cfop: string;
  unidade: Produto['unidade'];
  precoCusto: number;
  precoVenda: number;
  estoque?: number;
  tributacao: Tributacao;
}

// ─────────────────────────────────────────────
// NF-e
// ─────────────────────────────────────────────
export interface ItemEmissao {
  produtoId: string;
  quantidade: number;
  valorUnitario: number;
  cfop?: string; // override do padrão do produto
}
export interface PagamentoEmissao {
  forma: FormaPagamento;
  valor: number;
}
export interface NfeEmissaoRequest {
  empresaId?: string; // override admin multi-empresa
  clienteId: string | null;
  modelo: ModeloNf;
  serie: string;
  itens: ItemEmissao[];
  pagamento: PagamentoEmissao;
  enviar?: boolean; // default true → fila SEFAZ
}
export interface NfeEmissaoResponse {
  id: string;
  status: StatusNota;
  fila: 'enviado' | 'rascunho';
  chave: string;
}

export interface NfeListItem {
  id: string;
  numero: string;
  serie: string;
  modelo: ModeloNf;
  status: StatusNota;
  chave: string | null;
  valorTotal: number;
  dataEmissao: string; // ISO
  clienteNome: string | null;
}
export interface NfeItem {
  produtoId: string;
  produtoNome: string;
  ncm: string;
  cfop: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  tributacao: Tributacao;
}
export interface NfeEvento {
  id: string;
  tipo: TipoEvento;
  sequencia: number;
  protocolo: string | null;
  dataRegistro: string; // ISO
  status: 'pendente' | 'autorizado' | 'rejeitado';
  motivo: string | null;
}
export interface NfeDetail {
  id: string;
  numero: string;
  serie: string;
  modelo: ModeloNf;
  status: StatusNota;
  chave: string | null;
  protocolo: string | null;
  valorTotal: number;
  dataEmissao: string;
  cliente: Cliente | null;
  itens: NfeItem[];
  pagamento: PagamentoEmissao | null;
  eventos: NfeEvento[];
  xmlUrl: string | null;      // presente quando AUTORIZADA
  danfeUrl: string | null;    // presente quando AUTORIZADA
  motivoRejeicao: string | null;
}

export interface NfeStatusResponse {
  status: StatusNota;
  protocolo: string | null;
  chave: string | null;
  xml?: string;       // só quando AUTORIZADA
  danfe?: string;     // URL do PDF, só quando AUTORIZADA
}

export interface CancelamentoRequest { justificativa: string; } // 15..255
export interface CancelamentoResponse { id: string; status: 'CANCELADA'; protocolo: string; }

export interface CceCorrecao { grupo: string; campo: string; valor: string; }
export interface CceRequest { correcoes: CceCorrecao[]; }
export interface CceResponse { eventoId: string; sequencia: number; protocolo: string | null; }

export interface InutilizacaoRequest {
  serie: string;
  modelo: ModeloNf;
  numeroInicial: number;
  numeroFinal: number;
  justificativa: string; // 15..255
}
export interface InutilizacaoResponse { protocolo: string; faixa: string; }

// ─────────────────────────────────────────────
// Webhooks (backend → Base44)
// ─────────────────────────────────────────────
export type WebhookEvento =
  | 'nfe.autorizada' | 'nfe.rejeitada' | 'nfe.cancelada' | 'nfe.denegada'
  | 'cce.registrada' | 'inutilizacao.registrada';
export interface WebhookPayload {
  evento: WebhookEvento;
  nfeId: string;
  status?: StatusNota;
  protocolo?: string;
  chave?: string;
  timestamp: string; // ISO
}