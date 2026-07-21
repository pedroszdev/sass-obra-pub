import 'reflect-metadata';
import 'dotenv/config';
import dataSource from '../database/data-source';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

// Promove um usuário JÁ EXISTENTE a ADMIN (BACKLOG T-180). Este é o ÚNICO caminho
// de promoção — não há endpoint que conceda a role (decisão de arquitetura do
// Épico 15). Rodar à mão em ops:
//
//   ADMIN_SEED_EMAIL=dono@empresa.com pnpm --filter api seed:admin
//
// Idempotente: se o usuário já é ADMIN, não faz nada. NÃO cria conta — o dono se
// cadastra pelo fluxo normal e depois é promovido aqui. A role só passa a valer no
// próximo token (login/refresh), pois o access token embute `user.role`.
//
// Por que env-script e não migration: uma migration cravaria o e-mail pessoal do
// dono no histórico do git. O script por env não deixa PII no repo e é reexecutável.
async function seed(): Promise<void> {
  const email = process.env.ADMIN_SEED_EMAIL?.trim();
  if (!email) {
    console.error(
      'Defina ADMIN_SEED_EMAIL com o e-mail do usuário a promover a ADMIN.',
    );
    process.exit(1);
  }

  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(User);
    // Busca case-insensitive: o e-mail é gravado como digitado no cadastro, então
    // não exigimos que o operador acerte a caixa exata.
    const user = await repo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();

    if (!user) {
      console.error(
        `Nenhum usuário com o e-mail "${email}". Cadastre-o primeiro, depois promova.`,
      );
      process.exit(1);
    }

    if (user.role === UserRole.ADMIN) {
      console.log(`"${user.email}" já é ADMIN. Nada a fazer.`);
      return;
    }

    await repo.update(user.id, { role: UserRole.ADMIN });
    console.log(
      `"${user.email}" promovido a ADMIN. Refaça login para o token carregar a role.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err: unknown) => {
  console.error('Falha no seed de admin:', err);
  process.exit(1);
});
