import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AnalyticsFilters {
  fechaInicio?: string;
  fechaFin?: string;
  tipo?: string;
  dia?: string;
}

export interface KpiPrincipal {
  indiceInasistencia: number;
  asistenciasEsperadas: number;
  reclamadosReales: number;
  inasistencias: number;
}

export interface KpisSecundarios {
  baseSubsidiada: number;
  diasEncontrados: number;
  asistenciasEsperadas: number;
  reclamadosReales: number;
  inasistencias: number;
  porcentajeAsistencia: number;
  porcentajeInasistencia: number;
}

export interface ChartDataPoint {
  fecha: string;
  reclamados: number;
  inasistencias: number;
}

export interface StudentInasistencia {
  id: number;
  codigo: string;
  nombre: string;
  programa: string;
  diasHabilitados: number;
  reclamados: number;
  inasistencias: number;
  porcentajeAsistencia: number;
  porcentajeInasistencia: number;
}

export interface VentaLibreStats {
  solicitudes: number;
  reclamados: number;
  expirados: number;
  efectividad: number;
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
  filtros: AnalyticsFilters & { diasEncontrados: number; festivosExcluidos: number };
  kpiPrincipal: KpiPrincipal;
  kpisSecundarios: KpisSecundarios;
  chartData: ChartDataPoint[];
  estudiantesInasistencia: StudentInasistencia[];
  estudiantesMejorAsistencia: StudentInasistencia[];
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
    if (filters.fechaInicio) params['fechaInicio'] = filters.fechaInicio;
    if (filters.fechaFin) params['fechaFin'] = filters.fechaFin;
    if (filters.tipo) params['tipo'] = filters.tipo;
    if (filters.dia) params['dia'] = filters.dia;

    return this.http.get<AnalyticsResponse>(`${this.apiUrl}/api/bonos/analytics`, { params });
  }
}
