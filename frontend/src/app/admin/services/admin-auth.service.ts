import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminLoginResponse, AdminSession } from '../interfaces/admin-auth.interface';

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
          this.setSession(response.admin);
        }),
      );
  }

  recoverPassword(correo: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/api/auth/admins/recover-password`, {
      correo,
    });
  }

  logout() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    this.currentAdmin.set(null);
  }

  isLoggedIn() {
    return this.currentAdmin() !== null;
  }

  private setSession(admin: AdminSession) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(admin));
    this.currentAdmin.set(admin);
  }

  private getStoredAdmin() {
    const rawSession = sessionStorage.getItem(ADMIN_SESSION_KEY);

    if (!rawSession) return null;

    try {
      return JSON.parse(rawSession) as AdminSession;
    } catch {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
  }
}
