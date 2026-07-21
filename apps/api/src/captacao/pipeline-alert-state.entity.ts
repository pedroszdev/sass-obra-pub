import { Column, Entity, PrimaryColumn } from 'typeorm';

// Estado de cooldown dos alertas de pipeline quebrado (T-189). Uma linha por
// TIPO de alerta (conector travado, captação parada, captou-sem-alertar) com o
// instante do último envio — para não reenviar o mesmo alerta a cada checagem
// enquanto o problema persiste. Persiste entre hibernações do Render (§8), onde
// um cooldown em memória não sobreviveria.
@Entity('pipeline_alert_state')
export class PipelineAlertState {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  tipo!: string;

  @Column({ type: 'timestamptz', name: 'last_sent_at' })
  lastSentAt!: Date;
}
