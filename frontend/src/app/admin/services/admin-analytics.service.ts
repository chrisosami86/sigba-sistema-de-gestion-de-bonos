import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AnalyticsFilters {
  periodo?: string;
  fechaInicio?: string;
  fechaFin?: string;
  tipo?: string;
  programa?: string;
  agrupacion?: string;
}

export interface KpiPrincipal {
  indiceAsistencia: number;
  reclamadosSubsidiados: number;
  expiradosSubsidiados: number;
  totalInteracciones: number;
}

export interface KpisSecundarios {
  totalReclamadosSubsidiados: number;
  totalExpiradosSubsidiados: number;
  totalNoUtilizados: number;
  totalReutilizadosExpirados: number;
  estudiantesSubsidiadosActivos: number;
  promedioDiarioAsistencia: number;
  porcentajeReutilizacion: number;
  asistenciaPromedioPeriodo: number;
  diasHabilitadosTotal: number;
}

export interface TimeSeriesPoint {
  periodo: string;
  reclamados: number;
  expirados: number;
}

export interface DiaCritico {
  fecha: string;
  porcentajeInasistencia: number;
  expiradosSubsidiados: number;
  comparacionPromedio: string;
}

export interface StudentAttendance {
  id: number;
  codigo: string;
  nombre: string;
  programa: string;
  reclamados: number;
  expirados: number;
  totalInteracciones: number;
  diasHabilitados: number;
  porcentajeAsistencia: number;
}

export interface VentaLibreStats {
  solicitudes: number;
  reclamados: number;
  expirados: number;
  tendenciaPorcentaje: number;
}

export interface ReutilizacionStats {
  totalExpirados: number;
  totalLiberados: number;
  totalNoUtilizados: number;
  totalReutilizados: number;
  totalReutilizables: number;
  porcentajeReutilizacion: number;
}

export interface DesconocidaStats {
  total: number;
  reclamados: number;
  expirados: number;
  reservados: number;
}

export interface AnalyticsResponse {
  filtros: AnalyticsFilters;
  kpiPrincipal: KpiPrincipal;
  kpisSecundarios: KpisSecundarios;
  timeSeries: TimeSeriesPoint[];
  diaCritico: DiaCritico | null;
  bajaFrecuencia: StudentAttendance[];
  mejorAsistencia: StudentAttendance[];
  ventaLibre: VentaLibreStats;
  reutilizacion: ReutilizacionStats;
  desconocida: DesconocidaStats;
}

@Injectable({ providedIn: 'root' })
export class AdminAnalyticsService {
  private http = inject(HttpClient);
  private apiUrl = environment.API_URL;

  getAnalytics(filters: AnalyticsFilters): Observable<AnalyticsResponse> {
    const params: Record<string, string> = {};
    if (filters.periodo) params['periodo'] = filters.periodo;
    if (filters.fechaInicio) params['fechaInicio'] = filters.fechaInicio;
    if (filters.fechaFin) params['fechaFin'] = filters.fechaFin;
    if (filters.tipo) params['tipo'] = filters.tipo;
    if (filters.programa) params['programa'] = filters.programa;
    if (filters.agrupacion) params['agrupacion'] = filters.agrupacion;

    return this.http.get<AnalyticsResponse>(`${this.apiUrl}/api/bonos/analytics`, { params });
  }
}
