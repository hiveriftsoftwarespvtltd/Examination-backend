import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user && user.mustChangePassword) {
      const allowedPaths = ['/api/v1/auth/admin/change-password', '/api/v1/auth/logout', '/api/v1/auth/me'];
      const currentPath = request.url;

      if (!allowedPaths.some((p) => currentPath.startsWith(p))) {
        throw new ForbiddenException({
          message: 'Password change required before accessing administrative endpoints.',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
      }
    }

    return true;
  }
}

