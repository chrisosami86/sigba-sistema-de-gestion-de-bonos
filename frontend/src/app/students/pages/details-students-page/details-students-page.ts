import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FooterComponent } from '../../../shared/components/footer/footer.component';
import { LogoSIGBA } from '../../../shared/components/logoSIGBA/logoSIGBA';
import { CountdownBonos } from '../../components/countdown-bonos/countdown-bonos';
import {
  BonoHistorial,
  BonoTipo,
  DisponibilidadBono,
  EstadoSistemaBono,
} from '../../interfaces/bono.interface';
import { BonosService } from '../../services/bonos.service';
import { StudentAuthService } from '../../services/student-auth.service';
import { StudentService } from '../../services/student.service';

@Component({
  selector: 'details-students-page',
  imports: [FooterComponent, LogoSIGBA, CountdownBonos],
  templateUrl: './details-students-page.html',
})
export class DetailsStudentsPage implements OnDestroy {
  private bonosService = inject(BonosService);
  private authService = inject(StudentAuthService);
  private studentService = inject(StudentService);
  private router = inject(Router);

  student = this.authService.currentStudent;
  historial = signal<BonoHistorial[]>([]);
  disponibilidades = signal<Partial<Record<BonoTipo, DisponibilidadBono>>>({});
  estados = signal<Record<BonoTipo, EstadoSistemaBono>>({
    almuerzo: { estado: 'cerrado', mensaje: 'Sistema fuera de horario' },
    refrigerio: { estado: 'cerrado', mensaje: 'Sistema fuera de horario' },
  });
  loadingSolicitud = signal(false);
  solicitudMessage = signal('');
  solicitudError = signal('');
  private estadoIntervalId: ReturnType<typeof setInterval>;

  tipoDisponible = computed<BonoTipo | null>(() => {
    const estados = this.estados();

    if (estados.almuerzo.estado === 'subsidiado' || estados.almuerzo.estado === 'venta_libre') {
      return 'almuerzo';
    }

    if (
      estados.refrigerio.estado === 'subsidiado' ||
      estados.refrigerio.estado === 'venta_libre'
    ) {
      return 'refrigerio';
    }

    return null;
  });

  solicitudLabel = computed(() => {
    const tipo = this.tipoDisponible();

    if (!tipo) return 'Solicitud no disponible';

    return `Solicitar ${tipo}`;
  });

  constructor() {
    const student = this.student();

    if (student) {
      this.refreshStudent(student.id);
      this.loadHistorial(student.id);
      this.refreshEstados();
      this.refreshDisponibilidad();
    }

    this.estadoIntervalId = setInterval(() => {
      this.refreshEstados();
    }, 30000);
  }

  ngOnDestroy() {
    clearInterval(this.estadoIntervalId);
  }

  historialResumen = computed(() => {
    return {
      almuerzo: this.countByTipo('almuerzo'),
      refrigerio: this.countByTipo('refrigerio'),
    };
  });

  loadHistorial(studentId: number) {
    this.bonosService.getHistorial(studentId).subscribe({
      next: (historial) => {
        this.historial.set(historial);
      },
      error: () => {
        this.solicitudError.set('No se pudo cargar el historial de bonos');
      },
    });
  }

  refreshStudent(studentId: number) {
    this.studentService.getStudentsById(studentId).subscribe({
      next: (student) => {
        this.authService.updateCurrentStudent({
          id: student.id,
          codigo: student.codigo,
          nombre: student.nombre,
          programa_codigo: student.programa_codigo,
          programa_nombre: student.programa_nombre,
          tipo_estudiante: student.tipo_estudiante,
          tiene_beca: student.tiene_beca,
          dias: student.dias,
          must_change_password: false,
        });
      },
    });
  }

  refreshEstados() {
    forkJoin({
      almuerzo: this.bonosService.getEstado('almuerzo'),
      refrigerio: this.bonosService.getEstado('refrigerio'),
    }).subscribe({
      next: (estados) => {
        this.estados.set(estados);
      },
    });
  }

  refreshDisponibilidad() {
    forkJoin({
      almuerzo: this.bonosService.getDisponibilidad('almuerzo'),
      refrigerio: this.bonosService.getDisponibilidad('refrigerio'),
    }).subscribe({
      next: (disponibilidades) => {
        this.disponibilidades.set(disponibilidades);
      },
    });
  }

  solicitarBono() {
    const studentId = this.student()?.id;
    const tipo = this.tipoDisponible();

    if (!studentId || !tipo) return;

    this.loadingSolicitud.set(true);
    this.solicitudMessage.set('');
    this.solicitudError.set('');

    this.bonosService.solicitar(studentId, tipo).subscribe({
      next: (response) => {
        this.solicitudMessage.set(response.message);
        this.loadingSolicitud.set(false);
        this.loadHistorial(studentId);
        this.refreshEstados();
        this.refreshDisponibilidad();
      },
      error: (err) => {
        this.solicitudError.set(err.error?.message || 'No se pudo solicitar el bono');
        this.loadingSolicitud.set(false);
      },
    });
  }

  formatDate(value: string) {
    return new Date(value).toLocaleDateString('es-CO');
  }

  formatTime(value: string | null) {
    if (!value) return '-';

    if (/^\d{2}:\d{2}/.test(value)) {
      const [hourValue, minute] = value.split(':');
      const hour = Number(hourValue);
      const period = hour >= 12 ? 'p.m.' : 'a.m.';
      const normalizedHour = hour % 12 || 12;

      return `${normalizedHour}:${minute} ${period}`;
    }

    return new Date(value).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  estadoText(estado: string) {
    const labels: Record<string, string> = {
      reservado: 'Reservado',
      reclamado: 'Reclamado',
      expirado: 'Expirado',
    };

    return labels[estado] ?? estado;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  private countByTipo(tipo: BonoTipo) {
    const bonos = this.historial().filter((bono) => bono.tipo === tipo);

    return {
      reservados: bonos.filter((bono) => bono.estado === 'reservado').length,
      reclamados: bonos.filter((bono) => bono.estado === 'reclamado').length,
      expirados: bonos.filter((bono) => bono.estado === 'expirado').length,
    };
  }
}
