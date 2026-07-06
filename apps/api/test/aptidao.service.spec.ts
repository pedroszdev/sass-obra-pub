import { Repository } from 'typeorm';
import { AptidaoService } from '../src/aptidao/aptidao.service';
import { Atestado } from '../src/company-profile/atestado.entity';
import { Certidao } from '../src/company-profile/certidao.entity';
import { CompanyProfile } from '../src/company-profile/company-profile.entity';
import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';
import { EditalExigencias } from '../src/editais/exigencias/edital-exigencias.entity';
import { ExigenciasHabilitacao } from '../src/editais/exigencias/exigencias.types';

// Exigências sem nada verificável no perfil → veredito indefinido (T-116b).
const exigSemNada = (): ExigenciasHabilitacao => ({
  resumoObjeto: 'Obra',
  certidoes: [],
  registroConselho: { exigido: false, conselho: null, trecho: null },
  capacidadeTecnica: { exigida: false, descricao: null, trecho: null },
  capitalSocial: {
    exigido: false,
    valorMinimoReais: null,
    percentualSobreEstimado: null,
    trecho: null,
  },
  garantia: { exigida: false, trecho: null },
  outrosRequisitos: [],
});

// Exige uma certidão que o perfil não tem → veredito nao_apto.
const exigCertidao = (): ExigenciasHabilitacao => ({
  ...exigSemNada(),
  certidoes: [{ exigida: true, tipo: CertidaoTipo.FGTS, trecho: null }],
});

describe('AptidaoService.vereditosPara (T-82)', () => {
  let service: AptidaoService;
  let profiles: { findOne: jest.Mock };
  let certidoes: { find: jest.Mock };
  let atestados: { count: jest.Mock };
  let exigencias: { find: jest.Mock };

  beforeEach(() => {
    profiles = { findOne: jest.fn().mockResolvedValue(null) };
    certidoes = { find: jest.fn().mockResolvedValue([]) };
    atestados = { count: jest.fn().mockResolvedValue(0) };
    exigencias = { find: jest.fn().mockResolvedValue([]) };
    service = new AptidaoService(
      profiles as unknown as Repository<CompanyProfile>,
      certidoes as unknown as Repository<Certidao>,
      atestados as unknown as Repository<Atestado>,
      exigencias as unknown as Repository<EditalExigencias>,
    );
  });

  it('lista vazia → mapa vazio, sem tocar o banco', async () => {
    const r = await service.vereditosPara('u1', []);
    expect(r.size).toBe(0);
    expect(exigencias.find).not.toHaveBeenCalled();
  });

  it('sem exigências extraídas → mapa vazio, sem carregar o perfil', async () => {
    exigencias.find.mockResolvedValue([]);
    const r = await service.vereditosPara('u1', ['e1', 'e2']);
    expect(r.size).toBe(0);
    expect(profiles.findOne).not.toHaveBeenCalled();
  });

  it('cruza o cache com o perfil: indefinido quando nada é verificável (T-116b)', async () => {
    exigencias.find.mockResolvedValue([
      { editalId: 'e1', exigencias: exigSemNada() },
    ]);
    const r = await service.vereditosPara('u1', ['e1']);
    expect(r.get('e1')).toBe('indefinido');
  });

  it('nao_apto quando exige certidão que o perfil não tem', async () => {
    exigencias.find.mockResolvedValue([
      { editalId: 'e1', exigencias: exigSemNada() },
      { editalId: 'e2', exigencias: exigCertidao() },
    ]);
    const r = await service.vereditosPara('u1', ['e1', 'e2']);
    expect(r.get('e1')).toBe('indefinido');
    expect(r.get('e2')).toBe('nao_apto');
  });
});
