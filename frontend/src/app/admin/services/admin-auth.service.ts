import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminLoginResponse, AdminSession } from '../interfaces/admin-auth.interface';

const ADMIN_TOKEN_KEY = 'sigba_admin_token';
const ADMIN_SESSION_KEY = 'sigba_admin_session';

@Injectable({
  providedIn: 'root',
})
export class AdminAuthService {
  private http = inject(HttpClient);
  private apiUrl = environment.API_URL;

  currentAdmin = signal<AdminSession | null>(this.getStoredAdmin());

  login(correo: string, password: string) {
    return this.http
      .post<AdminLoginResponse>(`${this.apiUrl}/api/auth/admins/login`, {
        correo,
        password,
      })
      .pipe(
        tap((response) => {
          localStorage.setItem(ADMIN_TOKEN_KEY, response.token);
          this.setSession(response.admin);
        }),
      );
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.patch<{ message: string }>(
      `${this.apiUrl}/api/auth/admins/change-password`,
      { currentPassword, newPassword },
    ).pipe(
      tap(() => {
        const admin = this.currentAdmin();
        if (admin) {
          this.setSession({ ...admin, must_change_password: false });
        }
      }),
    );
  }

  recoverPassword(correo: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/api/auth/admins/recover-password`, {
      correo,
    });
  }

  logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    this.currentAdmin.set(null);
  }

  isLoggedIn() {
    return this.currentAdmin() !== null && !!this.getToken();
  }

  getToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  }

  private setSession(admin: AdminSession) {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(admin));
    this.currentAdmin.set(admin);
  }

  private getStoredAdmin() {
    const rawSession = localStorage.getItem(ADMIN_SESSION_KEY);

    if (!rawSession) return null;

    try {
      return JSON.parse(rawSession) as AdminSession;
    } catch {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
  }
}
