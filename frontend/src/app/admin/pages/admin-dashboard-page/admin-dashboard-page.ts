import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import * as XLSX from 'xlsx';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
} from 'chart.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BaseAdministrativaBono,
  BonoResumenDiarioRow,
  BonoStatsDiarias,
  BonoTipo,
  DisponibilidadBono,
} from '../../../students/interfaces/bono.interface';
import { type Student } from '../../../students/interfaces/student.interface';
import { BonosService } from '../../../students/services/bonos.service';
import { AdminAuthService } from '../../services/admin-auth.service';
import {
  AdminStudentsImportService,
  ImportResult,
  type StudentsPage,
} from '../../services/admin-students-import.service';
import {
  SystemService,
  type SystemSettings,
  type WorkingDay,
  type Holiday,
  type OperationalStatus,
  type DailyClosureResumen,
  type DailyClosureConfirmacionesResponse,
} from '../../services/system.service';
import {
  AdminAnalyticsService,
  type AnalyticsResponse,
  type AnalyticsFilters,
} from '../../services/admin-analytics.service';
import {
  AdminAssignmentService,
  type AdminAsignacionesResponse,
} from '../../services/admin-assignment.service';
import {
  ProviderOperationsService,
  type ProviderResumenResponse,
  type ProviderConciliacionesResponse,
} from '../../services/provider-operations.service';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  Filler,
);

type AdminModule =
  | 'dashboard'
  | 'bonos'
  | 'resumen'
  | 'asignaciones'
  | 'proveedor'
  | 'base_de_datos'
  | 'gestion_estudiantes'
  | 'configuracion'
  | 'cierre_diario';

const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;

const FORMATO_DIA: Record<string, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
};

@Component({
  selector: 'admin-dashboard-page',
  imports: [RouterModule],
  templateUrl: './admin-dashboard-page.html',
})
export class AdminDashboardPage implements OnInit {
  private authService = inject(AdminAuthService);
  private bonosService = inject(BonosService);
  private studentsService = inject(AdminStudentsImportService);
  private systemService = inject(SystemService);
  private analyticsService = inject(AdminAnalyticsService);
  private assignmentService = inject(AdminAssignmentService);
  private providerService = inject(ProviderOperationsService);
  private router = inject(Router);

  readonly tiposDocumento = ['TI', 'CC', 'CR', 'PPT', 'CE', 'PA', 'RC'] as const;

  readonly programas: Record<string, string> = {
    '3845': 'Administración de empresas',
    '3857': 'Comercio exterior',
    '2134': 'Tecnología en análisis y laboratorio químico',
    '2724': 'Tecnología en desarrollo de software',
    '2725': 'Tecnología en electrónica industrial',
    '2839': 'Tecnología en gestión logística',
    '2722': 'Tecnología en mantenimiento de sistemas electromecánicos',
  };

  readonly programasCodigos = Object.keys(this.programas);

  ngOnInit() {
    this.checkOperationalStatus();
    this.refreshDisponibilidad();
    this.refreshBaseAdministrativa();
    this.refreshStats();
    this.loadSystemConfig();
    this.loadAnalytics();
  }

  // ── Estado general ──

  admin = this.authService.currentAdmin;
  selectedModule = signal<AdminModule>('dashboard');
  sidebarOpen = signal(false);
  disponibilidades = signal<Partial<Record<BonoTipo, DisponibilidadBono>>>({});
  stats = signal<BonoStatsDiarias | null>(null);
  loading = signal(false);
  message = signal('');
  errorMessage = signal('');
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  private errorTimer: ReturnType<typeof setTimeout> | null = null;

  private setMessage(msg: string) {
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.message.set(msg);
    this.messageTimer = setTimeout(() => this.message.set(''), 5000);
  }

  private setError(msg: string) {
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorMessage.set(msg);
    this.errorTimer = setTimeout(() => this.errorMessage.set(''), 7000);
  }

  // ── Resumen diario ──

  resumenRows = signal<BonoResumenDiarioRow[]>([]);
  resumenTotal = signal(0);
  resumenTotalPages = signal(1);
  resumenPage = signal(1);
  resumenLimit = signal(10);
  filtroTipo = signal('');
  filtroModalidad = signal('');
  filtroEstado = signal('');
  filtroCodigo = signal('');
  codigosBonos = signal<Record<number, string>>({});

  // ── Bonos del día ──

  baseCantidad = signal<Record<BonoTipo, number>>({ almuerzo: 0, refrigerio: 0 });
  extraCantidad = signal<Record<BonoTipo, number>>({ almuerzo: 0, refrigerio: 0 });
  liberarCantidad = signal<Record<BonoTipo, number>>({ almuerzo: 0, refrigerio: 0 });
  baseAdministrativa = signal<Partial<Record<BonoTipo, BaseAdministrativaBono>>>({});
  asignacionCodigo = signal('');
  asignacionTipo = signal<BonoTipo>('almuerzo');
  asignacionCodigoBono = signal('');
  asignacionMotivo = signal('');
  asignacionStudent = signal<Student | null>(null);
  asignacionSearching = signal(false);
  asignacionSaving = signal(false);
  asignacionAsignado = signal(false);

  // ── Historial asignaciones ──
  asignacionesData = signal<AdminAsignacionesResponse | null>(null);
  asignacionesLoading = signal(false);
  asignacionesPage = signal(1);
  asignacionesLimit = signal(10);
  asignacionesFiltroTipo = signal('');
  asignacionesFiltroFechaDesde = signal('');
  asignacionesFiltroFechaHasta = signal('');
  asignacionesFiltroStudentId = signal('');
  asignacionesFiltroCodigoBono = signal('');

  // ── Operación proveedor ──
  providerResumen = signal<ProviderResumenResponse | null>(null);
  providerLoading = signal(false);
  providerFecha = signal(new Date().toISOString().slice(0, 10));
  providerConciliacionTipo = signal<BonoTipo>('almuerzo');
  providerCantidad = signal('');
  providerObservaciones = signal('');
  providerSaving = signal(false);
  providerConciliaciones = signal<ProviderConciliacionesResponse | null>(null);
  providerConciliacionesLoading = signal(false);
  providerConciliacionesPage = signal(1);
  providerConciliacionesFiltroTipo = signal('');
  providerConciliacionesFiltroFechaDesde = signal('');
  providerConciliacionesFiltroFechaHasta = signal('');
  providerConciliacionesFiltroEstado = signal('');

  // ── QR Scanner removed — navega a /admin/scan ──

  goScanPage() {
    this.router.navigate(['/admin/scan']);
  }

  tipos: BonoTipo[] = ['almuerzo', 'refrigerio'];

  totalDisponible = computed(() => {
    return this.tipos.reduce((total, tipo) => {
      return total + (this.disponibilidades()[tipo]?.disponibles ?? 0);
    }, 0);
  });

  showBonoCards = computed(() => {
    const mod = this.selectedModule();
    return mod === 'dashboard' || mod === 'bonos' || mod === 'resumen';
  });

  periodosDisponibles = computed(() => {
    const currentYear = new Date().getFullYear();
    const periodos: string[] = [];

    for (let year = currentYear; year <= currentYear + 2; year++) {
      periodos.push(`${year}-1`, `${year}-2`);
    }

    return periodos;
  });

  // ── Base de datos ──

  importResult = signal<ImportResult | null>(null);
  studentsFile = signal<File | null>(null);
  subsidiesFile = signal<File | null>(null);

  // ── Gestión de estudiantes ──

  estudiantesPage = signal(1);
  estudiantesLimit = signal(20);
  estudiantesFiltroTipo = signal('');
  estudiantesFiltroBeca = signal('');
  estudiantesFiltroCodigo = signal('');
  estudiantesFiltroActivo = signal('');
  estudiantesData = signal<StudentsPage | null>(null);
  estudiantesLoading = signal(false);

  // -- Modal editar --
  showEditModal = signal(false);
  editingStudentId = signal<number | null>(null);
  editCodigo = signal('');
  editTipoDocumento = signal('');
  editNumeroDocumento = signal('');
  editNombre = signal('');
  editCorreo = signal('');
  editProgramaCodigo = signal('');
  editProgramaNombre = signal('');
  editTipoEstudiante = signal('');
  editTieneBeca = signal(false);
  editDias = signal<string[]>([]);
  editSaving = signal(false);
  editPeriodo = signal('');

  // -- Modal crear --
  showCreateModal = signal(false);
  createCodigo = signal('');
  createTipoDocumento = signal('CC');
  createNumeroDocumento = signal('');
  createNombre = signal('');
  createCorreo = signal('');
  createProgramaCodigo = signal('');
  createProgramaNombre = signal('');
  createTipoEstudiante = signal('no_subsidiado');
  createPeriodo = signal('');
  createTieneBeca = signal(false);
  createDias = signal<string[]>([]);
  createSaving = signal(false);

  // -- Confirmación eliminar (deprecated, kept for template cleanup) --
  showDeleteConfirm = signal(false);
  deletingStudentId = signal<number | null>(null);
  deletingStudentNombre = signal('');

  // -- Configuración del periodo --
  systemSettings = signal<SystemSettings | null>(null);
  workingDays = signal<WorkingDay[]>([]);
  holidays = signal<Holiday[]>([]);
  configPeriodo = signal('');
  configFechaInicio = signal('');
  configFechaFin = signal('');
  newHolidayFecha = signal('');
  newHolidayDescripcion = signal('');
  configPeriodoSaving = signal(false);
  configPeriodoLoading = signal(false);
  configResumenVisible = signal(false);
  configLastUpdate = signal('');

  // ── Estado operacional ──

  operationalStatus = signal<OperationalStatus | null>(null);
  isHistoricalMode = computed(() => this.operationalStatus()?.isHistoricalMode ?? false);
  canOperate = computed(() => this.operationalStatus()?.canOperate ?? true);

  // ── Cierre diario ──

  cierreResumen = signal<DailyClosureResumen | null>(null);
  cierreLoading = signal(false);
  cierreFecha = signal(new Date().toISOString().slice(0, 10));
  cierreObservaciones = signal('');
  cierreSaving = signal(false);
  cierreConfirmaciones = signal<DailyClosureConfirmacionesResponse | null>(null);
  cierreConfirmacionesLoading = signal(false);
  cierreConfirmacionesPage = signal(1);

  // ── Modal cambio de contraseña ──

  showChangePasswordModal = signal(false);
  changePassCurrent = signal('');
  changePassNew = signal('');
  changePassConfirm = signal('');
  changePassSaving = signal(false);
  showChangePass = signal(false);

  // ── Analytics Dashboard ──

  analyticsData = signal<AnalyticsResponse | null>(null);
  analyticsLoading = signal(false);
  analyticsFiltroDia = signal('');
  analyticsFiltroTipo = signal('');
  analyticsFiltroFechaInicio = signal('');
  analyticsFiltroFechaFin = signal('');
  showVentaLibre = signal(false);
  showReutilizacion = signal(false);
  private chartInstance: Chart | null = null;

  // -- Toggle activo --
  toggleStudentActivo(id: number) {
    this.studentsService.toggleActivo(id).subscribe({
      next: (result) => {
        this.setMessage(result.message);
        this.refreshEstudiantes();
      },
      error: (err) => {
        this.setError(err.error?.message || 'No se pudo cambiar el estado');
      },
    });
  }

  // ============================================================
  //  Dashboard / Bonos / Resumen (código existente sin cambios)
  // ============================================================

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
        this.setError('No se pudo consultar la disponibilidad');
        this.loading.set(false);
      },
    });
  }

  refreshBaseAdministrativa() {
    this.bonosService.getBaseAdministrativa().subscribe({
      next: (base) => {
        this.baseAdministrativa.set(base);
      },
      error: () => {
        this.setError('No se pudo consultar la base administrativa');
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

          const bonosMap: Record<number, string> = {};
          for (const row of resumen.rows) {
            if (row.codigo_bono) {
              bonosMap[row.id] = String(row.codigo_bono);
            }
          }
          this.codigosBonos.set(bonosMap);

          this.loading.set(false);
        },
        error: () => {
          this.setError('No se pudo consultar el resumen diario');
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

  setCodigoBono(rowId: number, value: string) {
    this.codigosBonos.update((map) => ({ ...map, [rowId]: value }));
  }

  setExtraCantidad(tipo: BonoTipo, cantidad: string) {
    this.extraCantidad.update((actual) => ({ ...actual, [tipo]: Number(cantidad) }));
  }

  setBaseCantidad(tipo: BonoTipo, cantidad: string) {
    this.baseCantidad.update((actual) => ({ ...actual, [tipo]: Number(cantidad) }));
  }

  setLiberarCantidad(tipo: BonoTipo, cantidad: string) {
    this.liberarCantidad.update((actual) => ({ ...actual, [tipo]: Number(cantidad) }));
  }

  setAsignacionTipo(value: string) {
    if (value === 'almuerzo' || value === 'refrigerio') {
      this.asignacionTipo.set(value);
    }
  }

  buscarEstudianteAsignacion(value: string) {
    const codigo = value.trim();
    this.asignacionCodigo.set(codigo);
    this.asignacionStudent.set(null);

    if (!codigo) {
      return;
    }

    this.asignacionSearching.set(true);
    this.studentsService.getStudents({ codigo, activo: 'true', page: 1, limit: 5 }).subscribe({
      next: (data) => {
        const exact = data.rows.find((student) => student.codigo === codigo);
        this.asignacionStudent.set(exact ?? data.rows[0] ?? null);
        this.asignacionSearching.set(false);
      },
      error: () => {
        this.setError('No se pudo buscar el estudiante');
        this.asignacionSearching.set(false);
      },
    });
  }

  setAsignacionCodigoBono(value: string) {
    this.asignacionCodigoBono.set(value.trim());
  }

  setAsignacionMotivo(value: string) {
    this.asignacionMotivo.set(value);
  }

  cargarExtra(tipo: BonoTipo) {
    const cantidad = this.extraCantidad()[tipo];
    if (!cantidad || cantidad <= 0) {
      this.setError('Ingresa una cantidad extra valida');
      return;
    }
    this.runAdminAction(
      () => this.bonosService.cargarExtra(tipo, cantidad),
      'Carga extra registrada',
    );
  }

  establecerBase(tipo: BonoTipo) {
    const cantidad = this.baseCantidad()[tipo];
    if (!cantidad || cantidad <= 0) {
      this.setError('Ingresa una cantidad base valida');
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
      this.setError('Ingresa una cantidad a liberar valida');
      return;
    }
    this.runAdminAction(
      () => this.bonosService.liberarExpirados(tipo, cantidad),
      'Bonos expirados liberados',
    );
  }

  asignarAdministrativamente() {
    const student = this.asignacionStudent();
    const codigoBono = this.asignacionCodigoBono().trim();
    const motivo = this.asignacionMotivo().trim();

    if (!student) {
      this.setError('Busca y selecciona un estudiante activo');
      return;
    }

    if (!codigoBono) {
      this.setError('Debe ingresar el codigo del bono');
      return;
    }

    if (!motivo) {
      this.setError('Debe ingresar el motivo administrativo');
      return;
    }

    this.asignacionSaving.set(true);
    this.clearMessages();

    this.bonosService
      .asignarAdministrativamente({
        tipo: this.asignacionTipo(),
        studentId: student.id,
        codigoBono,
        motivo,
      })
      .subscribe({
        next: (result) => {
          this.setMessage(result.message);
          this.asignacionCodigo.set('');
          this.asignacionCodigoBono.set('');
          this.asignacionMotivo.set('');
          this.asignacionStudent.set(null);
          this.asignacionSaving.set(false);
          this.asignacionAsignado.set(true);
          setTimeout(() => this.asignacionAsignado.set(false), 4000);
          this.refreshBaseAdministrativa();
          this.refreshAsignaciones(1);
        },
        error: (err) => {
          this.setError(err.error?.message || 'No se pudo registrar la asignacion administrativa');
          this.asignacionSaving.set(false);
        },
      });
  }

  // ── Asignaciones administrativas (institucional) ──

  refreshAsignaciones(page = this.asignacionesPage()) {
    this.asignacionesLoading.set(true);
    this.asignacionesPage.set(page);

    this.assignmentService
      .getAsignaciones({
        tipo: (this.asignacionesFiltroTipo() as BonoTipo | '') || '',
        fechaDesde: this.asignacionesFiltroFechaDesde() || undefined,
        fechaHasta: this.asignacionesFiltroFechaHasta() || undefined,
        codigoBono: this.asignacionesFiltroCodigoBono(),
        page,
        limit: this.asignacionesLimit(),
      })
      .subscribe({
        next: (data) => {
          this.asignacionesData.set(data);
          this.asignacionesLoading.set(false);
        },
        error: () => {
          this.setError('No se pudo consultar el historial administrativo');
          this.asignacionesLoading.set(false);
        },
      });
  }

  applyAsignacionesFilters() {
    this.refreshAsignaciones(1);
  }

  clearAsignacionesFilters() {
    this.asignacionesFiltroTipo.set('');
    this.asignacionesFiltroFechaDesde.set('');
    this.asignacionesFiltroFechaHasta.set('');
    this.asignacionesFiltroStudentId.set('');
    this.asignacionesFiltroCodigoBono.set('');
    this.refreshAsignaciones(1);
  }

  // ── Operación proveedor ──

  refreshProviderResumen() {
    this.providerLoading.set(true);
    this.providerService.getResumen(this.providerFecha()).subscribe({
      next: (resumen: ProviderResumenResponse) => {
        this.providerResumen.set(resumen);
        this.providerLoading.set(false);
      },
      error: () => {
        this.setError('No se pudo consultar el resumen del proveedor');
        this.providerLoading.set(false);
      },
    });
  }

  registrarConciliacion() {
    const tipo = this.providerConciliacionTipo();
    const cantidad = Number(this.providerCantidad());
    if (!cantidad || cantidad < 0) {
      this.setError('Ingresa una cantidad valida');
      return;
    }

    this.providerSaving.set(true);
    this.clearMessages();

    this.providerService
      .registrarConciliacion({
        fecha: this.providerFecha(),
        tipo,
        cantidadProveedor: cantidad,
        observaciones: this.providerObservaciones() || undefined,
      })
      .subscribe({
        next: (result) => {
          this.setMessage(result.message);
          this.providerCantidad.set('');
          this.providerObservaciones.set('');
          this.providerSaving.set(false);
          this.refreshProviderResumen();
          this.refreshProviderConciliaciones(1);
        },
        error: (err) => {
          this.setError(err.error?.message || 'No se pudo registrar la conciliacion');
          this.providerSaving.set(false);
        },
      });
  }

  refreshProviderConciliaciones(page = this.providerConciliacionesPage()) {
    this.providerConciliacionesLoading.set(true);
    this.providerConciliacionesPage.set(page);

    this.providerService
      .getConciliaciones({
        tipo: (this.providerConciliacionesFiltroTipo() as BonoTipo | '') || '',
        fechaDesde: this.providerConciliacionesFiltroFechaDesde() || undefined,
        fechaHasta: this.providerConciliacionesFiltroFechaHasta() || undefined,
        estado: this.providerConciliacionesFiltroEstado() || undefined,
        page,
        limit: 10,
      })
      .subscribe({
        next: (data) => {
          this.providerConciliaciones.set(data);
          this.providerConciliacionesLoading.set(false);
        },
        error: () => {
          this.setError('No se pudo consultar el historial de conciliaciones');
          this.providerConciliacionesLoading.set(false);
        },
      });
  }

  applyProviderFilters() {
    this.refreshProviderConciliaciones(1);
  }

  clearProviderFilters() {
    this.providerConciliacionesFiltroTipo.set('');
    this.providerConciliacionesFiltroFechaDesde.set('');
    this.providerConciliacionesFiltroFechaHasta.set('');
    this.providerConciliacionesFiltroEstado.set('');
    this.refreshProviderConciliaciones(1);
  }

  descargarExcel(resumen: ProviderResumenResponse) {
    const rows: string[][] = [];
    for (const tipo of ['almuerzo', 'refrigerio'] as BonoTipo[]) {
      const d = resumen[tipo];
      rows.push(['Tipo', d.tipo]);
      rows.push(['Fecha', d.fecha]);
      rows.push(['Total operativo', String(d.totalOperativo)]);
      rows.push(['Reclamados operacionales', String(d.reclamados)]);
      rows.push(['Asignaciones administrativas', String(d.administrativos)]);
      rows.push(['Total entregado SIGBA', String(d.totalEntregado)]);
      rows.push(['Expirados', String(d.expirados)]);
      rows.push(['No utilizados', String(d.noUtilizados)]);
      rows.push(['Reutilizables', String(d.reutilizables)]);
      rows.push(['Base administrativa', String(d.baseAdministrativa)]);
      if (d.ultimaConciliacion) {
        rows.push(['Reportado proveedor', String(d.ultimaConciliacion.cantidad_proveedor)]);
        rows.push(['Diferencia', String(d.ultimaConciliacion.diferencia)]);
        rows.push(['Estado', d.ultimaConciliacion.estado]);
      }
      rows.push([]);
    }

    const html = `<html><head><meta charset="UTF-8"></head><body>
      <table border="1">${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
    </table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `resumen-proveedor-sigba-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  marcarReclamado(redencionId: number) {
    const codigo = this.codigosBonos()[redencionId];

    if (!codigo || codigo.trim() === '') {
      this.setError('Debe ingresar el codigo del bono');
      return;
    }

    this.loading.set(true);
    this.clearMessages();

    this.bonosService.reclamar(redencionId, codigo.trim()).subscribe({
      next: () => {
        this.setMessage('Bono reclamado correctamente');
        this.loading.set(false);
        this.refreshDisponibilidad();
        this.refreshResumen();
        this.refreshStats();
      },
      error: (err) => {
        this.setError(err.error?.message || 'No se pudo reclamar el bono');
        this.loading.set(false);
      },
    });
  }

  exportarResumenPDF() {
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
          const today = new Date();
          const dateStr = today.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
          const isoDate = today.toISOString().slice(0, 10);

          const pdf = new jsPDF('p', 'mm', 'a4');
          let cursorY = 12;
          const margin = 12;

          pdf.setFontSize(18);
          pdf.setTextColor(185, 28, 28);
          pdf.text('SIGBA', margin, cursorY);
          cursorY += 6;

          pdf.setFontSize(10);
          pdf.setTextColor(100, 100, 100);
          pdf.text('Sistema de Gestion de Bonos Alimentarios', margin, cursorY);
          cursorY += 10;

          pdf.setFontSize(13);
          pdf.setTextColor(40, 40, 40);
          pdf.text('Resumen diario SIGBA', margin, cursorY);
          cursorY += 5;

          pdf.setFontSize(9);
          pdf.setTextColor(120, 120, 120);
          pdf.text(dateStr, margin, cursorY);
          cursorY += 8;

          const sections = [
            { title: 'Bono almuerzo subsidiados', tipo: 'almuerzo', modalidad: 'subsidiado' },
            { title: 'Bono almuerzo venta libre', tipo: 'almuerzo', modalidad: 'venta_libre' },
            { title: 'Bono refrigerio subsidiados', tipo: 'refrigerio', modalidad: 'subsidiado' },
            { title: 'Bono refrigerio venta libre', tipo: 'refrigerio', modalidad: 'venta_libre' },
          ];

          const headStyle = { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 };
          const bodyStyle = { fontSize: 7, cellPadding: 2 };
          const columns = ['Codigo', 'Nombre', 'Beca', 'Programa', 'Franja', 'Modalidad', 'Estado', 'Hora sol.', 'Hora rec.', 'Cod. bono'];

          for (const section of sections) {
            const rows = resumen.rows
              .filter((r) => r.tipo === section.tipo && r.modalidad === section.modalidad)
              .map((r) => [
                String(r.codigo ?? ''),
                String(r.nombre ?? ''),
                r.tiene_beca ? 'Si' : 'No',
                `${r.programa_codigo ?? ''} - ${r.programa_nombre ?? ''}`,
                r.modalidad === 'venta_libre' ? 'Venta libre' : r.modalidad,
                r.modalidad_operacional ?? 'Legacy',
                String(r.estado ?? ''),
                this.formatTime(r.hora_solicitud),
                this.formatTime(r.hora_reclamo),
                String(r.codigo_bono ?? '-'),
              ]);

            pdf.setFontSize(11);
            pdf.setTextColor(40, 40, 40);
            pdf.text(section.title, margin, cursorY);
            cursorY += 5;

            if (rows.length === 0) {
              pdf.setFontSize(9);
              pdf.setTextColor(150, 150, 150);
              pdf.text('Sin registros', margin, cursorY);
              cursorY += 8;
            } else {
              (autoTable as any)(pdf, {
                startY: cursorY,
                head: [columns],
                body: rows,
                headStyles: headStyle,
                styles: bodyStyle,
                margin: { left: margin, right: margin },
                theme: 'grid',
              });
              cursorY = (pdf as any).lastAutoTable.finalY + 6;
            }
          }

          pdf.save('resumen-diario-sigba-' + isoDate + '.pdf');
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

  absValue(value: number) {
    return Math.abs(value);
  }

  getProviderExportUrl(tipo: string) {
    return this.providerService.getExportUrl(tipo as 'resumen' | 'conciliaciones');
  }

  // ============================================================
  //  Analytics Dashboard
  // ============================================================

  loadAnalytics() {
    this.analyticsLoading.set(true);

    const filters: AnalyticsFilters = {};
    const tipo = this.analyticsFiltroTipo();
    const dia = this.analyticsFiltroDia();
    const fechaInicio = this.analyticsFiltroFechaInicio();
    const fechaFin = this.analyticsFiltroFechaFin();

    if (tipo) filters.tipo = tipo;
    if (dia) filters.dia = dia;
    if (fechaInicio) filters.fechaInicio = fechaInicio;
    if (fechaFin) filters.fechaFin = fechaFin;

    this.analyticsService.getAnalytics(filters).subscribe({
      next: (data) => {
        this.analyticsData.set(data);
        this.analyticsLoading.set(false);
        setTimeout(() => this.renderChart(), 100);
      },
      error: (err) => {
        this.setError(err.error?.message || 'No se pudieron cargar las analiticas');
        this.analyticsLoading.set(false);
      },
    });
  }

  setAnalyticsDia(value: string) {
    this.analyticsFiltroDia.set(value);
    this.loadAnalytics();
  }

  setAnalyticsTipo(value: string) {
    this.analyticsFiltroTipo.set(value);
    this.loadAnalytics();
  }

  setAnalyticsFechaInicio(value: string) {
    this.analyticsFiltroFechaInicio.set(value);
  }

  setAnalyticsFechaFin(value: string) {
    this.analyticsFiltroFechaFin.set(value);
  }

  aplicarFiltros() {
    if (
      this.analyticsFiltroFechaInicio() &&
      this.analyticsFiltroFechaFin() &&
      this.analyticsFiltroTipo() &&
      this.analyticsFiltroDia()
    ) {
      this.loadAnalytics();
    }
  }

  destroyChart() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  renderChart() {
    this.destroyChart();
    const data = this.analyticsData();
    if (!data || data.chartData.length === 0) return;

    const canvas = document.getElementById('analytics-chart') as HTMLCanvasElement | null;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = data.chartData.map((p) => {
      const d = new Date(p.fecha + 'T00:00:00');
      return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
    });

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Reclamados',
            data: data.chartData.map((p) => p.reclamados),
            backgroundColor: '#22c55e',
            borderRadius: 4,
          },
          {
            label: 'Inasistencias',
            data: data.chartData.map((p) => p.inasistencias),
            backgroundColor: '#ef4444',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}` } },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            title: { display: true, text: 'Cantidad' },
          },
          x: { title: { display: true, text: 'Fecha' } },
        },
      },
    };

    this.chartInstance = new Chart(ctx, config);
  }

  // Exportación

  exportarAnalyticsExcel() {
    const data = this.analyticsData();
    if (!data) return;

    const wb = XLSX.utils.book_new();

    const resumen = [
      ['Indice de Inasistencia', `${data.kpiPrincipal.indiceInasistencia}%`],
      ['Asistencias Esperadas', data.kpiPrincipal.asistenciasEsperadas],
      ['Reclamados Reales', data.kpiPrincipal.reclamadosReales],
      ['Inasistencias', data.kpiPrincipal.inasistencias],
      ['Base Subsidiada', data.kpisSecundarios.baseSubsidiada],
      ['Dias Encontrados', data.kpisSecundarios.diasEncontrados],
      ['% Asistencia', `${data.kpisSecundarios.porcentajeAsistencia}%`],
      ['% Inasistencia', `${data.kpisSecundarios.porcentajeInasistencia}%`],
      [],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');

    const inasistencia = [
      [
        'Codigo',
        'Nombre',
        'Programa',
        'Dias Hab.',
        'Reclamados',
        'Inasistencias',
        '% Asistencia',
        '% Inasistencia',
      ],
      ...data.estudiantesInasistencia.map((s) => [
        s.codigo,
        s.nombre,
        s.programa,
        s.diasHabilitados,
        s.reclamados,
        s.inasistencias,
        `${s.porcentajeAsistencia}%`,
        `${s.porcentajeInasistencia}%`,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inasistencia), 'Inasistencia');

    XLSX.writeFile(wb, `inasistencia-sigba-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  exportarAnalyticsPDF() {
    const data = this.analyticsData();
    if (!data) return;

    const doc = new jsPDF();
    const titulo = 'Reporte de Inasistencia Subsidiada - SIGBA';
    doc.setFontSize(16);
    doc.text(titulo, 14, 20);

    doc.setFontSize(10);
    doc.text(`Indice de Inasistencia: ${data.kpiPrincipal.indiceInasistencia}%`, 14, 32);
    doc.text(
      `Asistencias Esperadas: ${data.kpiPrincipal.asistenciasEsperadas} | Reclamados: ${data.kpiPrincipal.reclamadosReales} | Inasistencias: ${data.kpiPrincipal.inasistencias}`,
      14,
      40,
    );
    doc.text(`Base Subsidiada: ${data.kpisSecundarios.baseSubsidiada} estudiantes`, 14, 48);

    autoTable(doc, {
      startY: 58,
      head: [
        [
          'Codigo',
          'Nombre',
          'Programa',
          'Dias Hab.',
          'Reclamados',
          'Inasistencias',
          '% Inasistencia',
        ],
      ],
      body: data.estudiantesInasistencia.map((s) => [
        s.codigo,
        s.nombre,
        s.programa,
        s.diasHabilitados,
        s.reclamados,
        s.inasistencias,
        `${s.porcentajeInasistencia}%`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] },
    });

    doc.save(`reporte-inasistencia-sigba-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/admin/login']);
  }

  // ============================================================
  //  Base de datos (ex-Estudiantes)
  // ============================================================

  setStudentsFile(fileList: FileList | null) {
    this.studentsFile.set(fileList?.item(0) ?? null);
  }

  setSubsidiesFile(fileList: FileList | null) {
    this.subsidiesFile.set(fileList?.item(0) ?? null);
  }

  cargarEstudiantes() {
    const file = this.studentsFile();
    if (!file) {
      this.setError('Selecciona el archivo de estudiantes');
      return;
    }
    this.runImport(() => this.studentsService.importStudents(file));
  }

  cargarSubsidiados() {
    const file = this.subsidiesFile();
    if (!file) {
      this.setError('Selecciona el archivo de subsidiados');
      return;
    }
    this.runImport(() => this.studentsService.importSubsidies(file));
  }

  descargarPlantillaEstudiantes() {
    const rows = [
      [
        'codigo',
        'tipo_documento',
        'numero_documento',
        'nombre',
        'correo',
        'programa_codigo',
        'programa_nombre',
      ],
      [
        '20231234',
        'CC',
        '12345678',
        'Nombre Apellido',
        'estudiante@correo.com',
        '2711',
        'Desarrollo de software',
      ],
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

  // ============================================================
  //  Gestión de estudiantes
  // ============================================================

  refreshEstudiantes(page = this.estudiantesPage()) {
    this.estudiantesLoading.set(true);
    this.estudiantesPage.set(page);

    this.studentsService
      .getStudents({
        tipo: this.estudiantesFiltroTipo(),
        beca: this.estudiantesFiltroBeca(),
        codigo: this.estudiantesFiltroCodigo(),
        activo: this.estudiantesFiltroActivo(),
        page,
        limit: this.estudiantesLimit(),
      })
      .subscribe({
        next: (data) => {
          this.estudiantesData.set(data);
          this.estudiantesLoading.set(false);
        },
        error: () => {
          this.setError('No se pudo consultar la lista de estudiantes');
          this.estudiantesLoading.set(false);
        },
      });
  }

  setEstudiantesFiltroTipo(value: string) {
    this.estudiantesFiltroTipo.set(value);
    this.refreshEstudiantes(1);
  }

  setEstudiantesFiltroBeca(value: string) {
    this.estudiantesFiltroBeca.set(value);
    this.refreshEstudiantes(1);
  }

  buscarEstudianteCodigo(value: string) {
    this.estudiantesFiltroCodigo.set(value.trim());
    this.refreshEstudiantes(1);
  }

  setEstudiantesFiltroActivo(value: string) {
    this.estudiantesFiltroActivo.set(value);
    this.refreshEstudiantes(1);
  }

  limpiarFiltrosEstudiantes() {
    this.estudiantesFiltroTipo.set('');
    this.estudiantesFiltroBeca.set('');
    this.estudiantesFiltroCodigo.set('');
    this.estudiantesFiltroActivo.set('');
    this.refreshEstudiantes(1);
  }

  // -- Modal crear --

  openCreateModal() {
    this.createCodigo.set('');
    this.createTipoDocumento.set('CC');
    this.createNumeroDocumento.set('');
    this.createNombre.set('');
    this.createCorreo.set('');
    this.createProgramaCodigo.set('');
    this.createProgramaNombre.set('');
    this.createTipoEstudiante.set('no_subsidiado');
    this.createPeriodo.set(this.systemSettings()?.periodo_actual || '');
    this.createTieneBeca.set(false);
    this.createDias.set([]);
    this.createSaving.set(false);
    this.setMessage('');
    this.setError('');
    this.showCreateModal.set(true);
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
  }

  toggleCreateDia(dia: string) {
    this.createDias.update((dias) =>
      dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia],
    );
  }

  setCreateProgramaCodigo(value: string) {
    this.createProgramaCodigo.set(value);
    this.createProgramaNombre.set(this.programas[value] || '');
  }

  saveCreateStudent() {
    const codigo = this.createCodigo().trim();
    const numeroDocumento = this.createNumeroDocumento().trim();
    const nombre = this.createNombre().trim();
    const correo = this.createCorreo().trim();
    const programaCodigo = this.createProgramaCodigo().trim();
    const programaNombre = this.createProgramaNombre().trim();
    const tipoEstudiante = this.createTipoEstudiante();
    const periodoActual = this.createPeriodo().trim();

    if (!codigo || !numeroDocumento || !nombre || !correo || !programaCodigo || !programaNombre) {
      this.setError('Todos los campos son obligatorios');
      return;
    }

    if (!periodoActual) {
      this.setError('Debe seleccionar un periodo academico');
      return;
    }

    if (tipoEstudiante === 'subsidiado' && this.createDias().length === 0) {
      this.setError('Debe seleccionar al menos un día de subsidio');
      return;
    }

    this.createSaving.set(true);
    this.setMessage('');
    this.setError('');

    this.studentsService
      .createStudent({
        codigo,
        tipo_documento: this.createTipoDocumento(),
        numero_documento: numeroDocumento,
        nombre,
        correo,
        programa_codigo: programaCodigo,
        programa_nombre: programaNombre,
        tipo_estudiante: tipoEstudiante,
        periodo_actual: periodoActual,
        tiene_beca: tipoEstudiante === 'subsidiado' ? this.createTieneBeca() : undefined,
        dias: tipoEstudiante === 'subsidiado' ? this.createDias() : [],
      })
      .subscribe({
        next: () => {
          this.setMessage('Estudiante creado correctamente');
          this.createSaving.set(false);
          this.showCreateModal.set(false);
          this.refreshEstudiantes();
        },
        error: (err) => {
          this.setError(err.error?.message || 'No se pudo crear el estudiante');
          this.createSaving.set(false);
        },
      });
  }

  // -- Modal editar --

  openEditModal(student: Student) {
    this.editingStudentId.set(student.id);
    this.editCodigo.set(student.codigo);
    this.editTipoDocumento.set(student.tipo_documento);
    this.editNumeroDocumento.set(student.numero_documento);
    this.editNombre.set(student.nombre);
    this.editCorreo.set(student.correo);
    this.editProgramaCodigo.set(student.programa_codigo);
    this.editProgramaNombre.set(student.programa_nombre);
    this.editTipoEstudiante.set(student.tipo_estudiante);
    this.editTieneBeca.set(student.tiene_beca);
    this.editDias.set([...student.dias]);
    this.editSaving.set(false);
    this.editPeriodo.set(student.periodo_actual || '');
    this.setMessage('');
    this.setError('');
    this.showEditModal.set(true);
  }

  closeEditModal() {
    this.showEditModal.set(false);
    this.editingStudentId.set(null);
  }

  toggleEditDia(dia: string) {
    this.editDias.update((dias) =>
      dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia],
    );
  }

  setEditProgramaCodigo(value: string) {
    this.editProgramaCodigo.set(value);
    this.editProgramaNombre.set(this.programas[value] || '');
  }

  saveEditStudent() {
    const id = this.editingStudentId();
    if (!id) return;

    const codigo = this.editCodigo().trim();
    const numeroDocumento = this.editNumeroDocumento().trim();
    const nombre = this.editNombre().trim();
    const correo = this.editCorreo().trim();
    const programaCodigo = this.editProgramaCodigo().trim();
    const programaNombre = this.editProgramaNombre().trim();
    const tipoEstudiante = this.editTipoEstudiante();

    if (!codigo || !numeroDocumento || !nombre || !correo || !programaCodigo || !programaNombre) {
      this.setError('Todos los campos son obligatorios');
      return;
    }

    if (tipoEstudiante === 'subsidiado' && this.editDias().length === 0) {
      this.setError('Debe seleccionar al menos un día de subsidio');
      return;
    }

    this.editSaving.set(true);
    this.setMessage('');
    this.setError('');

    this.studentsService
      .updateStudent(id, {
        codigo,
        tipo_documento: this.editTipoDocumento(),
        numero_documento: numeroDocumento,
        nombre,
        correo,
        programa_codigo: programaCodigo,
        programa_nombre: programaNombre,
        tipo_estudiante: tipoEstudiante,
        periodo_actual: this.editPeriodo().trim() || null,
        tiene_beca: tipoEstudiante === 'subsidiado' ? this.editTieneBeca() : undefined,
        dias: tipoEstudiante === 'subsidiado' ? this.editDias() : [],
      })
      .subscribe({
        next: () => {
          this.setMessage('Estudiante actualizado correctamente');
          this.editSaving.set(false);
          this.showEditModal.set(false);
          this.editingStudentId.set(null);
          this.refreshEstudiantes();
        },
        error: (err) => {
          this.setError(err.error?.message || 'No se pudo actualizar el estudiante');
          this.editSaving.set(false);
        },
      });
  }

  // ============================================================
  //  Dashboard / Bonos / Resumen (código existente sin cambios)
  // ============================================================

  // ============================================================
  //  Periodo
  // ============================================================

  loadSystemConfig() {
    this.configPeriodoLoading.set(true);

    this.systemService.getSettings().subscribe({
      next: (settings) => {
        this.systemSettings.set(settings);
        this.configPeriodo.set(settings.periodo_actual);
        this.configFechaInicio.set(settings.fecha_inicio || '');
        this.configFechaFin.set(settings.fecha_fin || '');
        if (settings.updated_at) {
          this.configLastUpdate.set(
            new Date(settings.updated_at).toLocaleString('es-CO', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          );
        }
        this.configPeriodoLoading.set(false);
        this.configResumenVisible.set(true);
      },
      error: () => {
        this.configPeriodoLoading.set(false);
      },
    });

    this.systemService.getWorkingDays().subscribe({
      next: (days) => {
        this.workingDays.set(days);
      },
    });

    this.systemService.getHolidays().subscribe({
      next: (holidays) => {
        this.holidays.set(holidays);
      },
    });
  }

  toggleWorkingDay(dia: string) {
    this.workingDays.update((days) =>
      days.map((d) => (d.dia === dia ? { ...d, activo: !d.activo } : d)),
    );
  }

  addHoliday() {
    const fecha = this.newHolidayFecha().trim();
    const descripcion = this.newHolidayDescripcion().trim();

    if (!fecha) {
      this.setError('Selecciona una fecha para el festivo');
      return;
    }

    this.systemService.createHoliday(fecha, descripcion).subscribe({
      next: (holiday) => {
        this.holidays.update((list) => [...list, holiday]);
        this.newHolidayFecha.set('');
        this.newHolidayDescripcion.set('');
        this.setMessage('Festivo agregado correctamente');
      },
      error: (err) => {
        this.setError(err.error?.message || 'No se pudo agregar el festivo');
      },
    });
  }

  removeHoliday(id: number) {
    this.systemService.deleteHoliday(id).subscribe({
      next: () => {
        this.holidays.update((list) => list.filter((h) => h.id !== id));
        this.setMessage('Festivo eliminado correctamente');
      },
      error: (err) => {
        this.setError(err.error?.message || 'No se pudo eliminar el festivo');
      },
    });
  }

  savePeriodConfig() {
    const periodo = this.configPeriodo().trim();
    const fechaInicio = this.configFechaInicio().trim();
    const fechaFin = this.configFechaFin().trim();

    if (!periodo) {
      this.setError('Selecciona un periodo academico');
      return;
    }

    this.configPeriodoSaving.set(true);
    this.setMessage('');
    this.setError('');

    this.systemService
      .updateSettings({
        periodo_actual: periodo,
        fecha_inicio: fechaInicio || null,
        fecha_fin: fechaFin || null,
      })
      .subscribe({
        next: (settings) => {
          this.systemSettings.set(settings);

          this.systemService.updateWorkingDays(this.workingDays()).subscribe({
            next: () => {
              this.configResumenVisible.set(true);
              this.configLastUpdate.set(
                new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }),
              );
              this.setMessage('Configuracion del periodo guardada correctamente');
              this.configPeriodoSaving.set(false);
            },
            error: (err) => {
              this.setError(err.error?.message || 'Error al guardar dias habiles');
              this.configPeriodoSaving.set(false);
            },
          });
        },
        error: (err) => {
          this.setError(err.error?.message || 'Error al guardar configuracion');
          this.configPeriodoSaving.set(false);
        },
      });
  }

  // ============================================================
  //  Estado operacional & históricos
  // ============================================================

  checkOperationalStatus() {
    this.systemService.getOperationalStatus().subscribe({
      next: (status) => {
        this.operationalStatus.set(status);
      },
    });
  }

  // ============================================================
  //  Cierre diario
  // ============================================================

  loadCierreResumen() {
    this.cierreLoading.set(true);
    this.systemService.getDailyClosureResumen(this.cierreFecha()).subscribe({
      next: (resumen) => {
        this.cierreResumen.set(resumen);
        this.cierreLoading.set(false);
      },
      error: (err) => {
        this.setError(err.error?.message || 'Error cargando resumen de cierre');
        this.cierreLoading.set(false);
      },
    });
  }

  confirmarCierreDiario() {
    this.cierreSaving.set(true);
    this.clearMessages();
    this.systemService
      .confirmarCierreDiario(this.cierreFecha(), this.cierreObservaciones())
      .subscribe({
        next: (result) => {
          this.setMessage(result.message);
          this.cierreSaving.set(false);
          this.cierreObservaciones.set('');
          this.loadCierreResumen();
          this.refreshCierreConfirmaciones();
        },
        error: (err) => {
          this.setError(err.error?.message || 'Error al confirmar cierre');
          this.cierreSaving.set(false);
        },
      });
  }

  refreshCierreConfirmaciones(page = 1) {
    this.cierreConfirmacionesPage.set(page);
    this.cierreConfirmacionesLoading.set(true);
    this.systemService
      .getConfirmaciones({
        fechaDesde: '',
        fechaHasta: '',
        page,
        limit: 20,
      })
      .subscribe({
        next: (data) => {
          this.cierreConfirmaciones.set(data);
          this.cierreConfirmacionesLoading.set(false);
        },
        error: (err) => {
          this.setError(err.error?.message || 'Error cargando confirmaciones');
          this.cierreConfirmacionesLoading.set(false);
        },
      });
  }

  // ============================================================
  //  Modal cambio de contraseña
  // ============================================================

  openChangePasswordModal() {
    this.changePassCurrent.set('');
    this.changePassNew.set('');
    this.changePassConfirm.set('');
    this.showChangePass.set(false);
    this.showChangePasswordModal.set(true);
  }

  closeChangePasswordModal() {
    this.showChangePasswordModal.set(false);
  }

  changeAdminPassword() {
    const current = this.changePassCurrent().trim();
    const newPass = this.changePassNew().trim();
    const confirm = this.changePassConfirm().trim();

    if (!current || !newPass) {
      this.setError('Todos los campos son obligatorios');
      return;
    }

    if (newPass.length < 6) {
      this.setError('La nueva contrasena debe tener al menos 6 caracteres');
      return;
    }

    if (newPass !== confirm) {
      this.setError('Las contrasenas no coinciden');
      return;
    }

    this.changePassSaving.set(true);
    this.clearMessages();

    this.authService.changePassword(current, newPass).subscribe({
      next: () => {
        this.setMessage('Contrasena actualizada correctamente');
        this.changePassSaving.set(false);
        this.showChangePasswordModal.set(false);
      },
      error: (err) => {
        this.setError(err.error?.message || 'Error al cambiar contrasena');
        this.changePassSaving.set(false);
      },
    });
  }

  // ============================================================
  //  Helpers
  // ============================================================

  diasSeleccionados(dias: string[]) {
    return dias.length === 0 ? '-' : dias.map((d) => FORMATO_DIA[d] ?? d).join(', ');
  }

  private clearMessages() {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
    this.message.set('');
    this.errorMessage.set('');
  }

  private runAdminAction(
    action: () => ReturnType<BonosService['cargarExtra']>,
    successMessage: string,
  ) {
    this.loading.set(true);
    this.clearMessages();

    action().subscribe({
      next: () => {
        this.setMessage(successMessage);
        this.loading.set(false);
        this.refreshDisponibilidad();
        this.refreshBaseAdministrativa();
        this.refreshResumen();
        this.refreshStats();
      },
      error: (err) => {
        this.setError(err.error?.message || 'No se pudo completar la operacion');
        this.loading.set(false);
      },
    });
  }

  private runImport(action: () => ReturnType<AdminStudentsImportService['importStudents']>) {
    this.loading.set(true);
    this.clearMessages();
    this.importResult.set(null);

    action().subscribe({
      next: (result) => {
        this.importResult.set(result);
        this.setMessage(result.message);
        this.loading.set(false);
      },
      error: (err) => {
        this.setError(err.error?.message || 'No se pudo cargar el archivo');
        this.loading.set(false);
      },
    });
  }

  private downloadExcelTemplate(filename: string, sheetName: string, rows: string[][]) {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  }
}
