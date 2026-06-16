import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';

// DataSource usado pela CLI do TypeORM para migrations (fora do contexto Nest).
// As credenciais vêm do ambiente (.env em dev; variáveis da plataforma em prod).
// Os globs são relativos a __dirname e cobrem {ts,js}, então o mesmo arquivo
// serve em dev (ts-node sobre src/) e em produção (JS compilado em dist/).
export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'obrapub',
  password: process.env.DATABASE_PASSWORD ?? 'obrapub',
  database: process.env.DATABASE_NAME ?? 'obrapub',
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
  synchronize: false,
});
