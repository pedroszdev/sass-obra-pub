// Como a conta nasceu (T-126). Não é "como o usuário loga agora": uma conta
// `local` que depois vinculou o Google segue `local` e aceita os dois caminhos.
// O que decide se há senha é `passwordHash != null`, não este campo.
export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
}
