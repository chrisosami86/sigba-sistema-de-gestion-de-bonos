import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StudentLoginResponse, StudentSession } from '../interfaces/auth.interface';

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
          this.setSession(response.student);
        }),
      );
  }

  recoverPassword(correo: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/api/auth/students/recover-password`, {
      correo,
    });
  }

  logout() {
    sessionStorage.removeItem(STUDENT_SESSION_KEY);
    this.currentStudent.set(null);
  }

  updateCurrentStudent(student: StudentSession) {
    this.setSession(student);
  }

  isLoggedIn() {
    return this.currentStudent() !== null;
  }

  private setSession(student: StudentSession) {
    sessionStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(student));
    this.currentStudent.set(student);
  }

  private getStoredStudent() {
    const rawSession = sessionStorage.getItem(STUDENT_SESSION_KEY);

    if (!rawSession) return null;

    try {
      return JSON.parse(rawSession) as StudentSession;
    } catch {
      sessionStorage.removeItem(STUDENT_SESSION_KEY);
      return null;
    }
  }
}
