import { Repository } from 'typeorm';
import { GeoService } from '../src/geo/geo.service';
import { Municipio } from '../src/geo/municipio.entity';

describe('GeoService', () => {
  let service: GeoService;
  let municipios: { find: jest.Mock };

  beforeEach(() => {
    municipios = { find: jest.fn() };
    service = new GeoService(municipios as unknown as Repository<Municipio>);
  });

  it('lista a UF ordenada por nome normalizado, só com código e nome', async () => {
    municipios.find.mockResolvedValue([
      { codigoIbge: '4202404', nome: 'Blumenau' },
      { codigoIbge: '4205407', nome: 'Florianópolis' },
    ]);

    const result = await service.listByUf('SC');

    expect(municipios.find).toHaveBeenCalledWith({
      where: { uf: 'SC' },
      select: { codigoIbge: true, nome: true },
      order: { nomeNormalizado: 'ASC' },
    });
    expect(result).toEqual([
      { codigoIbge: '4202404', nome: 'Blumenau' },
      { codigoIbge: '4205407', nome: 'Florianópolis' },
    ]);
  });

  it('não vaza campos internos (nomeNormalizado/uf) na resposta', async () => {
    municipios.find.mockResolvedValue([
      {
        codigoIbge: '3550308',
        nome: 'São Paulo',
        nomeNormalizado: 'sao paulo',
        uf: 'SP',
      },
    ]);

    const result = await service.listByUf('SP');

    expect(result).toEqual([{ codigoIbge: '3550308', nome: 'São Paulo' }]);
    expect(result[0]).not.toHaveProperty('nomeNormalizado');
    expect(result[0]).not.toHaveProperty('uf');
  });

  it('UF sem municípios retorna lista vazia', async () => {
    municipios.find.mockResolvedValue([]);
    await expect(service.listByUf('AP')).resolves.toEqual([]);
  });
});
