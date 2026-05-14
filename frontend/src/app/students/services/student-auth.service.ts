import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StudentLoginResponse, StudentSession } from '../interfaces/auth.interface';

const STUDENT_TOKEN_KEY = 'sigba_student_token';
const STUDENT_SESSION_KEY = 'sigba_student_session';

@Injectable({
  providedIn: 'root',
})
export class StudentAuthService {
  private http = inject(HttpClient);
  private apiUrl = environment.API_URL;

  currentStudent = signal<StudentSession | null>(this.getStoredStudent());

  login(codigo: string, password: string) {
    return this.http
      .post<StudentLoginResponse>(`${this.apiUrl}/api/auth/students/login`, {
        codigo,
        password,
      })
      .pipe(
        tap((response) => {
          localStorage.setItem(STUDENT_TOKEN_KEY, response.token);
          this.setSession(response.student);
        }),
      );
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.patch<{ message: string }>(
      `${this.apiUrl}/api/auth/students/change-password`,
      { currentPassword, newPassword },
    ).pipe(
      tap(() => {
        const student = this.currentStudent();
        if (student) {
          this.setSession({ ...student, must_change_password: false });
        }
      }),
    );
  }

  recoverPassword(correo: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/api/auth/students/recover-password`, {
      correo,
    });
  }

  logout() {
    localStorage.removeItem(STUDENT_TOKEN_KEY);
    localStorage.removeItem(STUDENT_SESSION_KEY);
    this.currentStudent.set(null);
  }

  updateCurrentStudent(student: StudentSession) {
    this.setSession(student);
  }

  isLoggedIn() {
    return this.currentStudent() !== null && !!this.getToken();
  }

  getToken() {
    return localStorage.getItem(STUDENT_TOKEN_KEY);
  }

  private setSession(student: StudentSession) {
    localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(student));
    this.currentStudent.set(student);
  }

  private getStoredStudent() {
    const rawSession = localStorage.getItem(STUDENT_SESSION_KEY);

    if (!rawSession) return null;

    try {
      return JSON.parse(rawSession) as StudentSession;
    } catch {
      localStorage.removeItem(STUDENT_SESSION_KEY);
      return null;
    }
  }
}
