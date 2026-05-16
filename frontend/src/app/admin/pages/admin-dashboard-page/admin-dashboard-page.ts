import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
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
import { SystemService, type SystemSettings, type WorkingDay, type Holiday } from '../../services/system.service';
import {
  AdminAnalyticsService,
  type AnalyticsResponse,
  type AnalyticsFilters,
} from '../../services/admin-analytics.service';

Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  CategoryScale, LinearScale, TimeScale,
  Title, Tooltip, Legend, Filler,
);

type AdminModule = 'dashboard' | 'bonos' | 'resumen' | 'base_de_datos' | 'gestion_estudiantes' | 'configuracion';

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
  imports: [],
  templateUrl: './admin-dashboard-page.html',
})
export class AdminDashboardPage implements OnInit {
  private authService = inject(AdminAuthService);
  private bonosService = inject(BonosService);
  private studentsService = inject(AdminStudentsImportService);
  private systemService = inject(SystemService);
  private analyticsService = inject(AdminAnalyticsService);
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
    this.refreshDisponibilidad();
    this.refreshStats();
    this.loadSystemConfig();
    this.loadAnalytics();
  }

  // ── Estado general ──

  admin = this.authService.currentAdmin;
  selectedModule = signal<AdminModule>('dashboard');
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

  // -- Configuración --
  configCurrentPassword = signal('');
  configNewPassword = signal('');
  configConfirmPassword = signal('');
  configSaving = signal(false);
  showConfigPasswords = signal(false);

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

  cargarExtra(tipo: BonoTipo) {
    const cantidad = this.extraCantidad()[tipo];
    if (!cantidad || cantidad <= 0) {
      this.setError('Ingresa una cantidad extra valida');
      return;
    }
    this.runAdminAction(() => this.bonosService.cargarExtra(tipo, cantidad), 'Carga extra registrada');
  }

  establecerBase(tipo: BonoTipo) {
    const cantidad = this.baseCantidad()[tipo];
    if (!cantidad || cantidad <= 0) {
      this.setError('Ingresa una cantidad base valida');
      return;
    }
    this.runAdminAction(() => this.bonosService.establecerBase(tipo, cantidad), 'Cantidad base actualizada');
  }

  liberarExpirados(tipo: BonoTipo) {
    const cantidad = this.liberarCantidad()[tipo];
    if (!cantidad || cantidad <= 0) {
      this.setError('Ingresa una cantidad a liberar valida');
      return;
    }
    this.runAdminAction(() => this.bonosService.liberarExpirados(tipo, cantidad), 'Bonos expirados liberados');
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
    return new Date(value).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
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
    if (this.analyticsFiltroFechaInicio() && this.analyticsFiltroFechaFin()
      && this.analyticsFiltroTipo() && this.analyticsFiltroDia()) {
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
          y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Cantidad' } },
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
      ['Codigo', 'Nombre', 'Programa', 'Dias Hab.', 'Reclamados', 'Inasistencias', '% Asistencia', '% Inasistencia'],
      ...data.estudiantesInasistencia.map((s) => [
        s.codigo, s.nombre, s.programa, s.diasHabilitados, s.reclamados, s.inasistencias,
        `${s.porcentajeAsistencia}%`, `${s.porcentajeInasistencia}%`,
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
    doc.text(`Asistencias Esperadas: ${data.kpiPrincipal.asistenciasEsperadas} | Reclamados: ${data.kpiPrincipal.reclamadosReales} | Inasistencias: ${data.kpiPrincipal.inasistencias}`, 14, 40);
    doc.text(`Base Subsidiada: ${data.kpisSecundarios.baseSubsidiada} estudiantes`, 14, 48);

    autoTable(doc, {
      startY: 58,
      head: [['Codigo', 'Nombre', 'Programa', 'Dias Hab.', 'Reclamados', 'Inasistencias', '% Inasistencia']],
      body: data.estudiantesInasistencia.map((s) => [
        s.codigo, s.nombre, s.programa, s.diasHabilitados, s.reclamados, s.inasistencias, `${s.porcentajeInasistencia}%`,
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
  //  Configuración
  // ============================================================

  changePassword() {
    const current = this.configCurrentPassword().trim();
    const newPw = this.configNewPassword().trim();
    const confirm = this.configConfirmPassword().trim();

    if (!current || !newPw || !confirm) {
      this.setError('Todos los campos son obligatorios');
      return;
    }

    if (newPw.length < 6) {
      this.setError('La nueva contrasena debe tener al menos 6 caracteres');
      return;
    }

    if (newPw !== confirm) {
      this.setError('Las contrasenas no coinciden');
      return;
    }

    this.configSaving.set(true);
    this.setMessage('');
    this.setError('');

    this.authService.changePassword(current, newPw).subscribe({
      next: (result) => {
        this.setMessage(result.message);
        this.configCurrentPassword.set('');
        this.configNewPassword.set('');
        this.configConfirmPassword.set('');
        this.configSaving.set(false);
      },
      error: (err) => {
        this.setError(err.error?.message || 'No se pudo cambiar la contrasena');
        this.configSaving.set(false);
      },
    });
  }

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

    this.systemService.updateSettings({
      periodo_actual: periodo,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
    }).subscribe({
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
  //  Helpers
  // ============================================================

  diasSeleccionados(dias: string[]) {
    return dias.length === 0
      ? '-'
      : dias.map((d) => FORMATO_DIA[d] ?? d).join(', ');
  }

  private clearMessages() {
    if (this.messageTimer) { clearTimeout(this.messageTimer); this.messageTimer = null; }
    if (this.errorTimer) { clearTimeout(this.errorTimer); this.errorTimer = null; }
    this.message.set('');
    this.errorMessage.set('');
  }

  private runAdminAction(action: () => ReturnType<BonosService['cargarExtra']>, successMessage: string) {
    this.loading.set(true);
    this.clearMessages();

    action().subscribe({
      next: () => {
        this.setMessage(successMessage);
        this.loading.set(false);
        this.refreshDisponibilidad();
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
        const sectionRows = rows.filter(
          (row) => row.tipo === section.tipo && row.modalidad === section.modalidad,
        );

        const body = sectionRows.length
          ? sectionRows
              .map(
                (row) => `
                  <tr>
                    <td>${escapeHtml(row.codigo)}</td>
                    <td>${escapeHtml(row.nombre)}</td>
                    <td>${escapeHtml(row.tiene_beca ? 'Si' : 'No')}</td>
                    <td>${escapeHtml(`${row.programa_codigo} - ${row.programa_nombre}`)}</td>
                    <td>${escapeHtml(row.estado)}</td>
                    <td>${escapeHtml(this.formatTime(row.hora_solicitud))}</td>
                    <td>${escapeHtml(this.formatTime(row.hora_reclamo))}</td>
                    <td>${escapeHtml(row.codigo_bono ?? '-')}</td>
                  </tr>
                `,
              )
              .join('')
          : '<tr><td colspan="8">Sin registros</td></tr>';

        return `
          <h2>${escapeHtml(section.title)}</h2>
          <table>
            <thead>
              <tr>
                <th>Codigo estudiante</th>
                <th>Nombre</th>
                <th>Beca</th>
                <th>Programa academico</th>
                <th>Estado del bono</th>
                <th>Hora solicitud</th>
                <th>Hora reclamo</th>
                <th>Codigo bono</th>
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
