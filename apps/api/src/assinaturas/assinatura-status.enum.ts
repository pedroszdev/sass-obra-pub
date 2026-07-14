// Status da assinatura (BACKLOG T-127). Espelha os estados do Stripe Billing —
// mas a Stripe é a FONTE DA VERDADE do pagamento, não do acesso: quem decide se
// o usuário pode usar o produto é o backend (§3.3), a partir daqui.
export enum AssinaturaStatus {
  /** Período de avaliação — 7 dias, SEM cartão. Nasce assim no cadastro. */
  TRIALING = 'trialing',
  /** Pagando. */
  ACTIVE = 'active',
  /** Pagamento falhou; a Stripe está retentando (dunning). Ver a carência na T-130. */
  PAST_DUE = 'past_due',
  /** Cancelada (pelo usuário ou por inadimplência persistente). */
  CANCELED = 'canceled',
}
