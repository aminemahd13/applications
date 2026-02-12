import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check for SkipCsrf decorator
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipCsrf) return true;

    const req = context.switchToHttp().getRequest();
    const method = req.method;

    // Safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // Mutating requests require a valid CSRF token.
    // Routes that need exemption (e.g. login/signup) use the @SkipCsrf() decorator.
    const sessionToken = req.session?.csrfToken;
    const headerToken = req.headers['x-csrf-token'];

    if (!sessionToken || !headerToken || sessionToken !== headerToken) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
