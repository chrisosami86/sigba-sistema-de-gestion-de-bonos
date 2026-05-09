import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ImportResult {
  message: string;
  result: {
    total: number;
    created?: number;
    updated: number;
    notFound?: number;
    errors: Array<{
      row: number;
      message: string;
    }>;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AdminStudentsImportService {
  private http = inject(HttpClient);
  private apiUrl = environment.API_URL;

  importStudents(file: File) {
    return this.upload('/api/students/import/students', file);
  }

  importSubsidies(file: File) {
    return this.upload('/api/students/import/subsidies', file);
  }

  private upload(path: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<ImportResult>(`${this.apiUrl}${path}`, formData);
  }
}
