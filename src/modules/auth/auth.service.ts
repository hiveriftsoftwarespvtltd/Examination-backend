import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Admin, AdminDocument, AdminStatus } from '../../database/schemas/admin.schema';
import { AuditLog, AuditLogDocument } from '../../database/schemas/audit-log.schema';
import { AdminLoginDto, RefreshTokenDto, ChangePasswordDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: AdminLoginDto, ipAddress?: string) {
    const email = dto.email.toLowerCase().trim();
    const admin = await this.adminModel.findOne({ email }).select('+passwordHash +hashedRefreshToken +mustChangePassword');

    if (!admin) {
      this.logger.warn(`Failed login attempt for non-existent admin: ${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (admin.status !== AdminStatus.ACTIVE) {
      throw new UnauthorizedException('Admin account has been deactivated');
    }

    const isMatch = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!isMatch) {
      this.logger.warn(`Failed password for admin: ${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate Short-lived access token (15m) and refresh token (7d)
    const tokens = await this.generateTokens(admin);

    // Hash refresh token before saving to database
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);
    admin.hashedRefreshToken = hashedRefreshToken;
    admin.lastLogin = new Date();
    await admin.save();

    await this.auditLogModel.create({
      actorId: admin._id.toString(),
      actorType: 'ADMIN',
      action: 'ADMIN_LOGIN',
      resource: 'auth',
      details: { email: admin.email, role: admin.role },
      ipAddress,
    });

    return {
      admin: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        mustChangePassword: admin.mustChangePassword,
      },
      ...tokens,
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload.sub || payload.type !== 'REFRESH') {
      throw new UnauthorizedException('Invalid refresh token type');
    }

    const admin = await this.adminModel.findById(payload.sub).select('+hashedRefreshToken +mustChangePassword');
    if (!admin || !admin.hashedRefreshToken) {
      throw new UnauthorizedException('Session revoked or not found');
    }

    const isValid = await bcrypt.compare(dto.refreshToken, admin.hashedRefreshToken);
    if (!isValid) {
      // Refresh token reuse detected! Immediately revoke session
      admin.hashedRefreshToken = undefined;
      await admin.save();
      this.logger.warn(`Refresh token reuse detected for admin ${admin.email}! Revoking all sessions.`);
      throw new UnauthorizedException('Security alert: Token reuse detected. Session revoked.');
    }

    // Rotate tokens
    const tokens = await this.generateTokens(admin);
    admin.hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);
    await admin.save();

    return tokens;
  }

  async logout(adminId: string) {
    await this.adminModel.findByIdAndUpdate(adminId, {
      $unset: { hashedRefreshToken: 1 },
    });
    return { message: 'Logged out successfully' };
  }

  async changePassword(adminId: string, dto: ChangePasswordDto) {
    const admin = await this.adminModel.findById(adminId).select('+passwordHash');
    if (!admin) {
      throw new UnauthorizedException('Admin account not found');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, admin.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match');
    }

    admin.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    admin.mustChangePassword = false;
    admin.hashedRefreshToken = undefined; // Force re-login with new password
    await admin.save();

    await this.auditLogModel.create({
      actorId: admin._id.toString(),
      actorType: 'ADMIN',
      action: 'PASSWORD_CHANGED',
      resource: 'auth',
      details: { email: admin.email },
    });

    return { message: 'Password updated successfully. Please log in with your new credentials.' };
  }

  async getProfile(adminId: string) {
    const admin = await this.adminModel.findById(adminId);
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }
    return {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      role: admin.role,
      status: admin.status,
      mustChangePassword: admin.mustChangePassword,
      lastLogin: admin.lastLogin,
    };
  }

  private async generateTokens(admin: AdminDocument) {
    const payload = {
      sub: admin._id.toString(),
      email: admin.email,
      role: admin.role,
      type: 'ADMIN',
    };

    const accessTokenTtl = this.configService.get<string>('jwt.accessTokenTtl') || '15m';
    const refreshTokenTtl = this.configService.get<string>('jwt.refreshTokenTtl') || '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: accessTokenTtl,
      }),
      this.jwtService.signAsync(
        { sub: admin._id.toString(), type: 'REFRESH' },
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          expiresIn: refreshTokenTtl,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenTtl,
    };
  }
}

