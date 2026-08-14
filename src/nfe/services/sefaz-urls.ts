/**
 * Tabela de códigos IBGE das UF — usada na chave de acesso (cUF) e em ide/cUF.
 */
export const UF_CODES: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53',
  ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15',
  PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43',
  RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17',
};

export const CODIGO_PAIS_BRASIL = '1058';
export const NOME_PAIS_BRASIL = 'BRASIL';

/**
 * URLs dos WebServices SEFAZ por UF e ambiente.
 * Foco inicial: SEFAZ-SP (homologação e produção), modelo 55 (NF-e) e 65 (NFC-e).
 * Demais UFs: utiliza o webservice nacional (SVAN/SVRS) quando aplicável.
 *
 * Fonte: Manual de Orientação do Contribuinte 4.00 — Anexo III (endpoints).
 */
export interface SefazEndpoint {
  nfeAutorizacao: string;
  nfeRetAutorizacao: string;
  nfeConsultaProtocolo: string;
  nfeStatusServico: string;
  nfeInutilizacao: string;
  recepcaoEvento: string;
  nfeConsultaDest: string;
  nfeDownloadNF: string;
}

const SP_HOMOLOG: SefazEndpoint = {
  nfeAutorizacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao.asmx',
  nfeRetAutorizacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao.asmx',
  nfeConsultaProtocolo: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsulta2.asmx',
  nfeStatusServico: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico2.asmx',
  nfeInutilizacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao2.asmx',
  recepcaoEvento: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/recepcaoevento.asmx',
  nfeConsultaDest: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultadest.asmx',
  nfeDownloadNF: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfedownloadnf.asmx',
};

const SP_PROD: SefazEndpoint = {
  nfeAutorizacao: 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao.asmx',
  nfeRetAutorizacao: 'https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao.asmx',
  nfeConsultaProtocolo: 'https://nfe.fazenda.sp.gov.br/ws/nfeconsulta2.asmx',
  nfeStatusServico: 'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico2.asmx',
  nfeInutilizacao: 'https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao2.asmx',
  recepcaoEvento: 'https://nfe.fazenda.sp.gov.br/ws/recepcaoevento.asmx',
  nfeConsultaDest: 'https://nfe.fazenda.sp.gov.br/ws/nfeconsultadest.asmx',
  nfeDownloadNF: 'https://nfe.fazenda.sp.gov.br/ws/nfedownloadnf.asmx',
};

/**
 * SVC (SEFAZ Virtual de Contingência) — usada em contingência EPEC/SVC.
 */
const SVC_RS_HOMOLOG: SefazEndpoint = {
  nfeAutorizacao: 'https://homologacao.nfe.sefazvirtual.rs.gov.br/ws/NfeAutorizacao/NfeAutorizacao.asmx',
  nfeRetAutorizacao: 'https://homologacao.nfe.sefazvirtual.rs.gov.br/ws/NfeRetAutorizacao/NfeRetAutorizacao.asmx',
  nfeConsultaProtocolo: 'https://homologacao.nfe.sefazvirtual.rs.gov.br/ws/NfeConsulta/NfeConsulta2.asmx',
  nfeStatusServico: 'https://homologacao.nfe.sefazvirtual.rs.gov.br/ws/NfeStatusServico/NfeStatusServico2.asmx',
  nfeInutilizacao: 'https://homologacao.nfe.sefazvirtual.rs.gov.br/ws/NfeInutilizacao/NfeInutilizacao2.asmx',
  recepcaoEvento: 'https://homologacao.nfe.sefazvirtual.rs.gov.br/ws/RecepcaoEvento/RecepcaoEvento.asmx',
  nfeConsultaDest: '',
  nfeDownloadNF: '',
};

const SVC_RS_PROD: SefazEndpoint = {
  nfeAutorizacao: 'https://nfe.sefazvirtual.rs.gov.br/ws/NfeAutorizacao/NfeAutorizacao.asmx',
  nfeRetAutorizacao: 'https://nfe.sefazvirtual.rs.gov.br/ws/NfeRetAutorizacao/NfeRetAutorizacao.asmx',
  nfeConsultaProtocolo: 'https://nfe.sefazvirtual.rs.gov.br/ws/NfeConsulta/NfeConsulta2.asmx',
  nfeStatusServico: 'https://nfe.sefazvirtual.rs.gov.br/ws/NfeStatusServico/NfeStatusServico2.asmx',
  nfeInutilizacao: 'https://nfe.sefazvirtual.rs.gov.br/ws/NfeInutilizacao/NfeInutilizacao2.asmx',
  recepcaoEvento: 'https://nfe.sefazvirtual.rs.gov.br/ws/RecepcaoEvento/RecepcaoEvento.asmx',
  nfeConsultaDest: '',
  nfeDownloadNF: '',
};

type Ambiente = 'homologacao' | 'producao';

const ENDPOINTS: Record<string, Record<Ambiente, SefazEndpoint>> = {
  SP: { homologacao: SP_HOMOLOG, producao: SP_PROD },
  SVRS: { homologacao: SVC_RS_HOMOLOG, producao: SVC_RS_PROD },
};

/**
 * UFs atendidas pela SVRS (SEFAZ Virtual do RS) — não possuem webservice próprio.
 */
const UFS_SVRS = ['AC', 'AL', 'AP', 'CE', 'DF', 'ES', 'MA', 'PA', 'PB', 'PI', 'RN', 'RO', 'RR', 'SC', 'SE', 'TO'];

export function resolverEndpoint(uf: string, ambiente: Ambiente): SefazEndpoint {
  const u = uf.toUpperCase();
  const key = u === 'SP' ? 'SP' : UFS_SVRS.includes(u) ? 'SVRS' : 'SVRS';
  const tbl = ENDPOINTS[key] ?? ENDPOINTS.SVRS;
  return tbl[ambiente];
}

/**
 * Action SOAP (namespace + operação) para cada webservice.
 * NF-e 4.00 utiliza o namespace http://www.portalfiscal.inf.br/nfe/wsdl/.
 */
export function soapAction(operacao: string): string {
  return `http://www.portalfiscal.inf.br/nfe/wsdl/${operacao}`;
}