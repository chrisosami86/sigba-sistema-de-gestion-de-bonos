import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface SystemSettings {
  id: number;
  periodo_actual: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  updated_at?: string;
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

export interface OperationalStatus {
  canOperate: boolean;
  reason: string | null;
  isHistoricalMode: boolean;
  timestamp: string;
}

export interface DailyClosureResumen {
  fecha: string;
  bonos: Record<string, {
    tipo: string;
    fecha: string;
    reclamados: number;
    administrativos: number;
    expirados: number;
    noUtilizados: number;
    conciliacion: {
      cantidad_proveedor: number;
      diferencia: number;
      estado: string;
      observaciones: string | null;
    } | null;
  }>;
  confirmacion: {
    id: number;
    estado: string;
    confirmado_por: number | null;
    confirmado_at: string | null;
    observaciones: string | null;
  } | null;
}

export interface DailyClosureConfirmacionesResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  rows: Array<{
    id: number;
    fechaOperacion: string;
    estado: string;
    confirmadoPor: number | null;
    confirmadoPorNombre: string;
    confirmadoAt: string | null;
    observaciones: string | null;
    createdAt: string;
  }>;
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

  getOperationalStatus() {
    return this.http.get<OperationalStatus>(`${this.apiUrl}/api/system/operational-status`);
  }

  getDailyClosureResumen(fecha?: string) {
    const params: Record<string, string> = {};
    if (fecha) { params['fecha'] = fecha; }
    return this.http.get<DailyClosureResumen>(`${this.apiUrl}/api/system/daily-closure/resumen`, { params });
  }

  confirmarCierreDiario(fecha: string, observaciones?: string) {
    return this.http.post<{ message: string; confirmacion: Record<string, unknown> }>(
      `${this.apiUrl}/api/system/daily-closure/confirmar`,
      { fecha, observaciones },
    );
  }

  getConfirmaciones(params?: {
    fechaDesde?: string;
    fechaHasta?: string;
    estado?: string;
    page?: number;
    limit?: number;
  }) {
    const cleanParams: Record<string, string> = {};
    if (params?.fechaDesde) { cleanParams['fechaDesde'] = params.fechaDesde; }
    if (params?.fechaHasta) { cleanParams['fechaHasta'] = params.fechaHasta; }
    if (params?.estado) { cleanParams['estado'] = params.estado; }
    if (params?.page) { cleanParams['page'] = String(params.page); }
    if (params?.limit) { cleanParams['limit'] = String(params.limit); }
    return this.http.get<DailyClosureConfirmacionesResponse>(
      `${this.apiUrl}/api/system/daily-closure/historial`,
      { params: cleanParams },
    );
  }
}
