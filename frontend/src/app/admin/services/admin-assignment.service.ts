import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { BonoTipo } from '../../students/interfaces/bono.interface';

export interface AdminAsignacionRow {
  id: number;
  studentId: number;
  studentCodigo: string;
  studentNombre: string;
  studentProgramaCodigo: string;
  studentProgramaNombre: string;
  tipo: BonoTipo;
  fecha: string;
  estado: string;
  tipoAsignacion: string;
  codigoBono: number;
  horaReclamo: string;
  adminId: number | null;
  adminNombre: string;
  motivo: string;
  modalidadOperacional?: string | null;
  createdAt: string;
}

export interface AdminAsignacionDetalle extends AdminAsignacionRow {
  studentActivo: boolean;
  horaSolicitud: string | null;
  expiracionAt: string | null;
  adminCorreo: string | null;
  updatedAt: string;
  cantidadBase: number;
  cantidadExtra: number;
}

export interface AdminAsignacionesResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  rows: AdminAsignacionRow[];
}

@Injectable({ providedIn: 'root' })
export class AdminAssignmentService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.API_URL}/api/admin/bonos`;

  asignar(data: { tipo: BonoTipo; studentId: number; codigoBono: string; motivo: string }) {
    return this.http.post<{ message: string; bono: Record<string, unknown>; baseAdministrativa: Record<string, unknown>; tipo_asignacion: string; student: Record<string, unknown> }>(
      `${this.apiUrl}/asignar`,
      data,
    );
  }

  getAsignaciones(filters: {
    fechaDesde?: string;
    fechaHasta?: string;
    tipo?: BonoTipo | '';
    studentId?: number;
    adminId?: number;
    codigoBono?: string;
    page?: number;
    limit?: number;
  }) {
    return this.http.get<AdminAsignacionesResponse>(`${this.apiUrl}/asignaciones`, {
      params: this.cleanParams(filters),
    });
  }

  getAsignacionById(id: number) {
    return this.http.get<AdminAsignacionDetalle>(`${this.apiUrl}/asignaciones/${id}`);
  }

  private cleanParams(filters: Record<string, string | number | undefined | null>) {
    return Object.entries(filters).reduce<Record<string, string>>((params, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params[key] = String(value);
      }
      return params;
    }, {});
  }
}
