import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop()
  actorId?: string;

  @Prop({ required: true })
  actorType: string; // 'ADMIN' | 'CANDIDATE' | 'SYSTEM'

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ required: true })
  resource: string;

  @Prop({ type: Object })
  details?: Record<string, any>;

  @Prop()
  ipAddress?: string;

  @Prop({ default: Date.now, index: true })
  timestamp: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ actorId: 1, action: 1 });

