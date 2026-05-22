import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { BonoTipo } from '../../students/interfaces/bono.interface';

export interface ProviderResumenTipo {
  tipo: BonoTipo;
  fecha: string;
  totalOperativo: number;
  reclamados: number;
  administrativos: number;
  totalEntregado: number;
  expirados: number;
  noUtilizados: number;
  reutilizables: number;
  baseAdministrativa: number;
  cantidadLiberada: number;
  ultimaConciliacion: {
    cantidad_proveedor: number;
    diferencia: number;
    estado: string;
    observaciones: string | null;
    created_at: string;
  } | null;
}

export type ProviderResumenResponse = Record<BonoTipo, ProviderResumenTipo>;

export interface ProviderConciliacionRow {
  id: number;
  fecha: string;
  tipo: BonoTipo;
  cantidadSigba: number;
  cantidadProveedor: number;
  diferencia: number;
  estado: 'CONCILIADO' | 'DIFERENCIA_MENOR' | 'DIFERENCIA_CRITICA' | 'PENDIENTE';
  observaciones: string | null;
  adminId: number | null;
  adminNombre: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConciliacionesResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  rows: ProviderConciliacionRow[];
}

@Injectable({ providedIn: 'root' })
export class ProviderOperationsService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.API_URL}/api/admin/provider`;

  getResumen(fecha?: string) {
    let queryParams = new HttpParams();
    if (fecha) { queryParams = queryParams.set('fecha', fecha); }
    return this.http.get<ProviderResumenResponse>(`${this.apiUrl}/resumen`, { params: queryParams });
  }

  registrarConciliacion(data: {
    fecha: string;
    tipo: BonoTipo;
    cantidadProveedor: number;
    observaciones?: string;
  }) {
    return this.http.post<{ message: string; conciliacion: ProviderConciliacionRow }>(
      `${this.apiUrl}/conciliaciones`,
      data,
    );
  }

  getConciliaciones(filters: {
    fechaDesde?: string;
    fechaHasta?: string;
    tipo?: BonoTipo | '';
    estado?: string;
    page?: number;
    limit?: number;
  }) {
    return this.http.get<ProviderConciliacionesResponse>(`${this.apiUrl}/conciliaciones`, {
      params: this.cleanParams(filters),
    });
  }

  getExportUrl(tipo: 'resumen' | 'conciliaciones') {
    return `${this.apiUrl}/exportar/${tipo}`;
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
