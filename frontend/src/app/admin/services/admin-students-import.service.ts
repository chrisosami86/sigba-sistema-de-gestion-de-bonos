import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { type Student } from '../../students/interfaces/student.interface';

export interface ImportResult {
  message: string;
  result: {
    total: number;
    created?: number;
    updated: number;
    deactivated?: number;
    notFound?: number;
    errors: Array<{
      row: number;
      message: string;
    }>;
  };
}

export interface StudentsPage {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  rows: Student[];
}

@Injectable({
  providedIn: 'root',
})
export class AdminStudentsImportService {
  private http = inject(HttpClient);
  private apiUrl = environment.API_URL;

  // ── Importaciones Excel ──

  importStudents(file: File) {
    return this.upload('/api/students/import/students', file);
  }

  importSubsidies(file: File) {
    return this.upload('/api/students/import/subsidies', file);
  }

  // ── CRUD Estudiantes ──

  getStudents(filters: {
    tipo?: string;
    beca?: string;
    codigo?: string;
    activo?: string;
    page?: number;
    limit?: number;
  }) {
    return this.http.get<StudentsPage>(`${this.apiUrl}/api/students`, {
      params: this.cleanParams(filters),
    });
  }

  getStudentById(id: number) {
    return this.http.get<Student>(`${this.apiUrl}/api/students/${id}`);
  }

  createStudent(data: Partial<Student> & { dias?: string[] }) {
    return this.http.post<Student>(`${this.apiUrl}/api/students`, data);
  }

  updateStudent(id: number, data: Partial<Student> & { dias?: string[] }) {
    return this.http.patch<Student>(`${this.apiUrl}/api/students/${id}`, data);
  }

  deleteStudent(id: number) {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/api/students/${id}`);
  }

  toggleActivo(id: number) {
    return this.http.patch<{ message: string; student: Student }>(`${this.apiUrl}/api/students/${id}/toggle-activo`, {});
  }

  // ── Helpers ──

  private upload(path: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<ImportResult>(`${this.apiUrl}${path}`, formData);
  }

  private cleanParams(filters: Record<string, string | number | boolean | undefined>) {
    return Object.entries(filters).reduce<Record<string, string>>((params, [key, value]) => {
      if (value !== undefined && value !== '') {
        params[key] = String(value);
      }

      return params;
    }, {});
  }
}
