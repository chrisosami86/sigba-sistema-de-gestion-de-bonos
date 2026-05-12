import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import * as XLSX from 'xlsx';
import {
  BonoResumenDiarioRow,
  BonoStatsDiarias,
  BonoTipo,
  DisponibilidadBono,
} from '../../../students/interfaces/bono.interface';
import { BonosService } from '../../../students/services/bonos.service';
import { AdminAuthService } from '../../services/admin-auth.service';
import {
  AdminStudentsImportService,
  ImportResult,
} from '../../services/admin-students-import.service';

@Component({
  selector: 'admin-dashboard-page',
  imports: [],
  templateUrl: './admin-dashboard-page.html',
})
export class AdminDashboardPage {
  private authService = inject(AdminAuthService);
  private bonosService = inject(BonosService);
  private studentsImportService = inject(AdminStudentsImportService);
  private router = inject(Router);

  admin = this.authService.currentAdmin;
  selectedModule = signal<'dashboard' | 'bonos' | 'resumen' | 'reportes' | 'estudiantes' | 'configuracion'>(
    'dashboard',
  );
  disponibilidades = signal<Partial<Record<BonoTipo, DisponibilidadBono>>>({});
  stats = signal<BonoStatsDiarias | null>(null);
  resumenRows = signal<BonoResumenDiarioRow[]>([]);
  resumenTotal = signal(0);
  resumenTotalPages = signal(1);
  resumenPage = signal(1);
  resumenLimit = signal(10);
  filtroTipo = signal('');
  filtroModalidad = signal('');
  filtroEstado = signal('');
  filtroCodigo = signal('');
  baseCantidad = signal<Record<BonoTipo, number>>({ almuerzo: 0, refrigerio: 0 });
  extraCantidad = signal<Record<BonoTipo, number>>({ almuerzo: 0, refrigerio: 0 });
  liberarCantidad = signal<Record<BonoTipo, number>>({ almuerzo: 0, refrigerio: 0 });
  loading = signal(false);
  message = signal('');
  errorMessage = signal('');
  importResult = signal<ImportResult | null>(null);
  studentsFile = signal<File | null>(null);
  subsidiesFile = signal<File | null>(null);

  tipos: BonoTipo[] = ['almuerzo', 'refrigerio'];

  totalDisponible = computed(() => {
    return this.tipos.reduce((total, tipo) => {
      return total + (this.disponibilidades()[tipo]?.disponibles ?? 0);
    }, 0);
  });

  constructor() {
    this.refreshDisponibilidad();
    this.refreshResumen();
    this.refreshStats();
  }

  refreshDisponibilidad() {
    this.loading.set(true);

    forkJoin({
      almuerzo: this.bonosService.getDisponibilidad('almuerzo'),
      refrigerio: this.bonosService.getDisponibilidad('refrigerio'),
    }).subscribe({
      next: (disponibilidades) => {
        this.disponibilidades.set(disponibilidades);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudo consultar la disponibilidad');
        this.loading.set(false);
      },
    });
  }

  refreshResumen(page = this.resumenPage()) {
    this.loading.set(true);
    this.resumenPage.set(page);

    this.bonosService
      .getResumenDiario({
        tipo: this.filtroTipo(),
        modalidad: this.filtroModalidad(),
        estado: this.filtroEstado(),
        codigo: this.filtroCodigo(),
        page,
        limit: this.resumenLimit(),
      })
      .subscribe({
        next: (resumen) => {
          this.resumenRows.set(resumen.rows);
          this.resumenTotal.set(resumen.total);
          this.resumenTotalPages.set(resumen.totalPages || 1);
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('No se pudo consultar el resumen diario');
          this.loading.set(false);
        },
      });
  }

  refreshStats() {
    this.bonosService.getStatsDiarias().subscribe({
      next: (stats) => {
        this.stats.set(stats);
      },
    });
  }

  setFiltroTipo(value: string) {
    this.filtroTipo.set(value);
    this.refreshResumen(1);
  }

  setFiltroModalidad(value: string) {
    this.filtroModalidad.set(value);
    this.refreshResumen(1);
  }

  setFiltroEstado(value: string) {
    this.filtroEstado.set(value);
    this.refreshResumen(1);
  }

  buscarCodigo(value: string) {
    this.filtroCodigo.set(value.trim());
    this.refreshResumen(1);
  }

  limpiarFiltros() {
    this.filtroTipo.set('');
    this.filtroModalidad.set('');
    this.filtroEstado.set('');
    this.filtroCodigo.set('');
    this.refreshResumen(1);
  }

  setExtraCantidad(tipo: BonoTipo, cantidad: string) {
    this.extraCantidad.update((actual) => ({
      ...actual,
      [tipo]: Number(cantidad),
    }));
  }

  setBaseCantidad(tipo: BonoTipo, cantidad: string) {
    this.baseCantidad.update((actual) => ({
      ...actual,
      [tipo]: Number(cantidad),
    }));
  }

  setLiberarCantidad(tipo: BonoTipo, cantidad: string) {
    this.liberarCantidad.update((actual) => ({
      ...actual,
      [tipo]: Number(cantidad),
    }));
  }

  cargarExtra(tipo: BonoTipo) {
    const cantidad = this.extraCantidad()[tipo];

    if (!cantidad || cantidad <= 0) {
      this.errorMessage.set('Ingresa una cantidad extra valida');
      return;
    }

    this.runAdminAction(() => this.bonosService.cargarExtra(tipo, cantidad), 'Carga extra registrada');
  }

  establecerBase(tipo: BonoTipo) {
    const cantidad = this.baseCantidad()[tipo];

    if (!cantidad || cantidad <= 0) {
      this.errorMessage.set('Ingresa una cantidad base valida');
      return;
    }

    this.runAdminAction(
      () => this.bonosService.establecerBase(tipo, cantidad),
      'Cantidad base actualizada',
    );
  }

  liberarExpirados(tipo: BonoTipo) {
    const cantidad = this.liberarCantidad()[tipo];

    if (!cantidad || cantidad <= 0) {
      this.errorMessage.set('Ingresa una cantidad a liberar valida');
      return;
    }

    this.runAdminAction(
      () => this.bonosService.liberarExpirados(tipo, cantidad),
      'Bonos expirados liberados',
    );
  }

  marcarReclamado(redencionId: number) {
    this.runAdminAction(() => this.bonosService.reclamar(redencionId), 'Bono marcado como reclamado');
  }

  descargarResumen() {
    this.bonosService
      .getResumenDiario({
        tipo: this.filtroTipo(),
        modalidad: this.filtroModalidad(),
        estado: this.filtroEstado(),
        codigo: this.filtroCodigo(),
        page: 1,
        limit: 1000,
      })
      .subscribe({
        next: (resumen) => {
          const html = this.buildExcelResumen(resumen.rows);
          const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');

          link.href = url;
          link.download = `resumen-diario-sigba-${new Date().toISOString().slice(0, 10)}.xls`;
          link.click();
          URL.revokeObjectURL(url);
        },
      });
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

  logout() {
    this.authService.logout();
    this.router.navigate(['/admin/login']);
  }

  setStudentsFile(fileList: FileList | null) {
    this.studentsFile.set(fileList?.item(0) ?? null);
  }

  setSubsidiesFile(fileList: FileList | null) {
    this.subsidiesFile.set(fileList?.item(0) ?? null);
  }

  cargarEstudiantes() {
    const file = this.studentsFile();

    if (!file) {
      this.errorMessage.set('Selecciona el archivo de estudiantes');
      return;
    }

    this.runImport(() => this.studentsImportService.importStudents(file));
  }

  cargarSubsidiados() {
    const file = this.subsidiesFile();

    if (!file) {
      this.errorMessage.set('Selecciona el archivo de subsidiados');
      return;
    }

    this.runImport(() => this.studentsImportService.importSubsidies(file));
  }

  descargarPlantillaEstudiantes() {
    const rows = [
      ['codigo', 'tipo_documento', 'numero_documento', 'nombre', 'correo', 'programa_codigo', 'programa_nombre'],
      ['20231234', 'CC', '12345678', 'Nombre Apellido', 'estudiante@correo.com', '2711', 'Desarrollo de software'],
    ];

    this.downloadExcelTemplate('plantilla-estudiantes-sigba.xlsx', 'Plantilla estudiantes', rows);
  }

  descargarPlantillaSubsidiados() {
    const rows = [
      ['codigo', 'tiene_beca', 'dias'],
      ['20231234', 'si', 'lunes,martes,miercoles'],
    ];

    this.downloadExcelTemplate('plantilla-subsidiados-sigba.xlsx', 'Plantilla subsidiados', rows);
  }

  private runAdminAction(action: () => ReturnType<BonosService['cargarExtra']>, successMessage: string) {
    this.loading.set(true);
    this.message.set('');
    this.errorMessage.set('');

    action().subscribe({
      next: () => {
        this.message.set(successMessage);
        this.loading.set(false);
        this.refreshDisponibilidad();
        this.refreshResumen();
        this.refreshStats();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'No se pudo completar la operacion');
        this.loading.set(false);
      },
    });
  }

  private runImport(action: () => ReturnType<AdminStudentsImportService['importStudents']>) {
    this.loading.set(true);
    this.message.set('');
    this.errorMessage.set('');
    this.importResult.set(null);

    action().subscribe({
      next: (result) => {
        this.importResult.set(result);
        this.message.set(result.message);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'No se pudo cargar el archivo');
        this.loading.set(false);
      },
    });
  }

  private downloadExcelTemplate(
  filename: string,
  sheetName: string,
  rows: string[][]
) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, filename);
}

  private buildExcelResumen(rows: BonoResumenDiarioRow[]) {
    const sections = [
      { title: 'Bono almuerzo subsidiados', tipo: 'almuerzo', modalidad: 'subsidiado' },
      { title: 'Bono almuerzo venta libre', tipo: 'almuerzo', modalidad: 'venta_libre' },
      { title: 'Bono refrigerio subsidiados', tipo: 'refrigerio', modalidad: 'subsidiado' },
      { title: 'Bono refrigerio venta libre', tipo: 'refrigerio', modalidad: 'venta_libre' },
    ];

    const escapeHtml = (value: unknown) => {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    const sectionTables = sections
      .map((section) => {
        const sectionRows = rows.filter((row) => {
          return row.tipo === section.tipo && row.modalidad === section.modalidad;
        });

        const body = sectionRows.length
          ? sectionRows
              .map((row) => {
                return `
                  <tr>
                    <td>${escapeHtml(row.codigo)}</td>
                    <td>${escapeHtml(row.nombre)}</td>
                    <td>${escapeHtml(`${row.programa_codigo} - ${row.programa_nombre}`)}</td>
                    <td>${escapeHtml(row.estado)}</td>
                    <td>${escapeHtml(this.formatTime(row.hora_solicitud))}</td>
                    <td>${escapeHtml(this.formatTime(row.hora_reclamo))}</td>
                  </tr>
                `;
              })
              .join('')
          : '<tr><td colspan="6">Sin registros</td></tr>';

        return `
          <h2>${escapeHtml(section.title)}</h2>
          <table>
            <thead>
              <tr>
                <th>Codigo estudiante</th>
                <th>Nombre</th>
                <th>Programa academico</th>
                <th>Estado del bono</th>
                <th>Hora solicitud</th>
                <th>Hora reclamo</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        `;
      })
      .join('<br />');

    return `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body { font-family: Arial, sans-serif; }
            h1 { color: #991b1b; }
            h2 { margin-top: 24px; color: #111827; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
            th { background: #991b1b; color: #ffffff; font-weight: bold; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            td { mso-number-format: "\\@"; }
          </style>
        </head>
        <body>
          <h1>Resumen diario SIGBA</h1>
          <p>Fecha de descarga: ${escapeHtml(new Date().toLocaleDateString('es-CO'))}</p>
          ${sectionTables}
        </body>
      </html>
    `;
  }
}
