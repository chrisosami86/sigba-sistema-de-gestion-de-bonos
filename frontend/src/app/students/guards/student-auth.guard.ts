import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StudentAuthService } from '../services/student-auth.service';

export const studentAuthGuard: CanActivateFn = () => {
  const authService = inject(StudentAuthService);
  const router = inject(Router);

  const token = authService.getToken();

  if (!token) {
    authService.logout();
    return router.createUrlTree(['/']);
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      authService.logout();
      return router.createUrlTree(['/']);
    }
  } catch {
    authService.logout();
    return router.createUrlTree(['/']);
  }

  if (authService.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/']);
};
