import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminDocument = Admin & Document;

export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
}

export enum AdminStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Schema({ timestamps: true, collection: 'admins' })
export class Admin {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, enum: AdminRole, default: AdminRole.ADMIN })
  role: AdminRole;

  @Prop({ required: true, enum: AdminStatus, default: AdminStatus.ACTIVE })
  status: AdminStatus;

  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ select: false })
  hashedRefreshToken?: string;

  @Prop()
  lastLogin?: Date;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);

