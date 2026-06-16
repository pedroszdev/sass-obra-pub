// Papel do usuário no sistema. ADMIN é criado fora de banda (seed/manual),
// nunca pelo cadastro público — ver AuthService.register.
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}
