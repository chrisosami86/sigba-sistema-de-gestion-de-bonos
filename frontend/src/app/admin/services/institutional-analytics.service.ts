import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface OperationalSnapshot {
  fecha: string;
  reclamados: number;
  expirados: number;
  noUtilizados: number;
  administrativos: number;
  conciliacionesPendientes: number;
  diferenciasProveedor: number;
  conciliacionesCriticas: number;
}

export interface SubsidyDayData {
  dia: string;
  baseSubsidiada: number;
  diasHabiles: number;
  asistenciasEsperadas: number;
  reclamadosReales: number;
  inasistencias: number;
  porcentajeAsistencia: number;
  porcentajeInasistencia: number;
  chartData: { fecha: string; reclamados: number; inasistencias: number }[];
  estudiantesCriticos: StudentRanking[];
  mejorAsistencia: StudentRanking[];
  programasCriticos: ProgramRanking[];
}

export interface StudentRanking {
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

export interface ProgramRanking {
  programa: string;
  estudiantes: number;
  esperados: number;
  reclamados: number;
  inasistencias: number;
  porcentajeInasistencia: number;
}

export interface SubsidyAnalytics {
  baseSubsidiadaTotal: number;
  byDay: SubsidyDayData[];
}

export interface ProviderAnalytics {
  total: number;
  conciliados: number;
  pendientes: number;
  diferenciaMenor: number;
  diferenciaCritica: number;
  diferenciaAcumulada: number;
  porcentajeConciliacion: number;
  chartData: { fecha: string; diferencias: number; criticas: number }[];
  diasCriticos: { fecha: string; tipo: string; diferencia: number; estado: string; observaciones: string }[];
}

export interface AdministrativeAnalytics {
  totalAdministrativos: number;
  motivosFrecuentes: { motivo: string; total: number }[];
  adminsRanking: { admin: string; total: number }[];
  porPeriodo: { fecha: string; total: number }[];
}

export interface HistoricalKpis {
  totalOperativo: number;
  totalReclamados: number;
  totalExpirados: number;
  totalNoUtilizados: number;
  totalAdministrativos: number;
  totalBaja: number;
  diasConOperacion: number;
  eficiencia: number;
  desperdicio: number;
  cobertura: number;
}

export interface HistoricalDaily {
  fecha: string;
  totalOperativo: number;
  reclamados: number;
  expirados: number;
  noUtilizados: number;
  administrativos: number;
  eficiencia: number;
  desperdicio: number;
  cobertura: number;
}

export interface HistoricalWeekly {
  semana: string;
  totalOp: number;
  recl: number;
  exp: number;
  noUt: number;
  adm: number;
  days: number;
  eficiencia: number;
  desperdicio: number;
}

export interface HistoricalMonthly {
  mes: string;
  totalOp: number;
  recl: number;
  exp: number;
  noUt: number;
  adm: number;
  days: number;
  eficiencia: number;
  desperdicio: number;
}

export interface HistoricalAnalytics {
  kpis: HistoricalKpis;
  daily: HistoricalDaily[];
  weekly: HistoricalWeekly[];
  monthly: HistoricalMonthly[];
}

export interface Alerta {
  tipo: string;
  mensaje: string;
  severidad: 'ALTA' | 'MEDIA' | 'BAJA';
}

export interface DashboardV2Response {
  timestamp: string;
  fechaInicio: string;
  fechaFin: string;
  operational: OperationalSnapshot;
  subsidy: SubsidyAnalytics;
  provider: ProviderAnalytics;
  administrative: AdministrativeAnalytics;
  historical: HistoricalAnalytics;
  alertas: Alerta[];
}

@Injectable({ providedIn: 'root' })
export class InstitutionalAnalyticsService {
  private http = inject(HttpClient);
  private apiUrl = environment.API_URL;

  getDashboard(fechaInicio?: string, fechaFin?: string, fechaSnapshot?: string): Observable<DashboardV2Response> {
    const params: Record<string, string> = {};
    if (fechaInicio) params['fechaInicio'] = fechaInicio;
    if (fechaFin) params['fechaFin'] = fechaFin;
    if (fechaSnapshot) params['fechaSnapshot'] = fechaSnapshot;

    return this.http.get<DashboardV2Response>(`${this.apiUrl}/api/analytics-v2/dashboard`, { params });
  }
}
