import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

export const adminAuthGuard: CanActivateFn = () => {
  const authService = inject(AdminAuthService);
  const router = inject(Router);

  const token = authService.getToken();

  if (!token) {
    authService.logout();
    return router.createUrlTree(['/admin/login']);
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      authService.logout();
      return router.createUrlTree(['/admin/login']);
    }
  } catch {
    authService.logout();
    return router.createUrlTree(['/admin/login']);
  }

  if (authService.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/admin/login']);
};
