import 'dotenv/config';
import { DataSource } from 'typeorm';

// DataSource usado pela CLI do TypeORM para migrations (fora do contexto Nest).
// As credenciais vêm do .env (mesmas do docker-compose.yml).
export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'obrapub',
  password: process.env.DATABASE_PASSWORD ?? 'obrapub',
  database: process.env.DATABASE_NAME ?? 'obrapub',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
