import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface SystemSettings {
  id: number;
  periodo_actual: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

export interface WorkingDay {
  id: number;
  dia: string;
  activo: boolean;
}

export interface Holiday {
  id: number;
  fecha: string;
  descripcion: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class SystemService {
  private http = inject(HttpClient);
  private apiUrl = environment.API_URL;

  getSettings() {
    return this.http.get<SystemSettings>(`${this.apiUrl}/api/system/settings`);
  }

  updateSettings(data: Partial<SystemSettings>) {
    return this.http.patch<SystemSettings>(`${this.apiUrl}/api/system/settings`, data);
  }

  getWorkingDays() {
    return this.http.get<WorkingDay[]>(`${this.apiUrl}/api/system/working-days`);
  }

  updateWorkingDays(days: WorkingDay[]) {
    return this.http.patch<WorkingDay[]>(`${this.apiUrl}/api/system/working-days`, { days });
  }

  getHolidays() {
    return this.http.get<Holiday[]>(`${this.apiUrl}/api/system/holidays`);
  }

  createHoliday(fecha: string, descripcion: string) {
    return this.http.post<Holiday>(`${this.apiUrl}/api/system/holidays`, { fecha, descripcion });
  }

  deleteHoliday(id: number) {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/api/system/holidays/${id}`);
  }
}
