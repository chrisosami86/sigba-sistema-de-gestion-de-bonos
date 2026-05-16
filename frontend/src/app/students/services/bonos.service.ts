import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  BonoHistorial,
  BonoResumenDiarioResponse,
  BonoStatsDiarias,
  BonoTipo,
  DisponibilidadBono,
  EstadoSistemaBono,
  SolicitudBonoResponse,
} from '../interfaces/bono.interface';

@Injectable({
  providedIn: 'root',
})
export class BonosService {
  private http = inject(HttpClient);
  private apiUrl = environment.API_URL;

  getEstado(tipo: BonoTipo) {
    return this.http.get<EstadoSistemaBono>(`${this.apiUrl}/api/bonos/estado/${tipo}`);
  }

  getDisponibilidad(tipo: BonoTipo) {
    return this.http.get<DisponibilidadBono>(`${this.apiUrl}/api/bonos/disponibilidad/${tipo}`);
  }

  getHistorial(studentId: number) {
    return this.http.get<BonoHistorial[]>(`${this.apiUrl}/api/bonos/student/${studentId}`);
  }

  getResumenDiario(filters: {
    tipo?: string;
    modalidad?: string;
    estado?: string;
    codigo?: string;
    page?: number;
    limit?: number;
  }) {
    return this.http.get<BonoResumenDiarioResponse>(
      `${this.apiUrl}/api/bonos/admin/resumen-diario`,
      { params: this.cleanParams(filters) },
    );
  }

  getStatsDiarias() {
    return this.http.get<BonoStatsDiarias>(`${this.apiUrl}/api/bonos/admin/stats-diarias`);
  }

  solicitar(studentId: number, tipo: BonoTipo) {
    return this.http.post<SolicitudBonoResponse>(`${this.apiUrl}/api/bonos/solicitar`, {
      studentId,
      tipo,
    });
  }

  liberarExpirados(tipo: BonoTipo, cantidad: number) {
    return this.http.patch(`${this.apiUrl}/api/bonos/liberar`, {
      tipo,
      cantidad,
    });
  }

  cargarExtra(tipo: BonoTipo, cantidad: number) {
    return this.http.patch(`${this.apiUrl}/api/bonos/extra`, {
      tipo,
      cantidad,
    });
  }

  establecerBase(tipo: BonoTipo, cantidad: number) {
    return this.http.patch(`${this.apiUrl}/api/bonos/base`, {
      tipo,
      cantidad,
    });
  }

  reclamar(redencionId: number, codigoBono: string) {
    return this.http.patch(`${this.apiUrl}/api/bonos/reclamar/${redencionId}`, { codigoBono });
  }

  private cleanParams(filters: Record<string, string | number | undefined>) {
    return Object.entries(filters).reduce<Record<string, string>>((params, [key, value]) => {
      if (value !== undefined && value !== '') {
        params[key] = String(value);
      }

      return params;
    }, {});
  }
}
