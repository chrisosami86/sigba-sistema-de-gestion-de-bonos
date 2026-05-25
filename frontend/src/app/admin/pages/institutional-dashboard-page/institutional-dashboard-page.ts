import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  DoughnutController,
  ArcElement,
  type ChartConfiguration,
} from 'chart.js';
import {
  InstitutionalAnalyticsService,
  type DashboardV2Response,
  type SubsidyDayData,
} from '../../services/institutional-analytics.service';

Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  CategoryScale, LinearScale,
  DoughnutController, ArcElement,
  Title, Tooltip, Legend, Filler,
);

@Component({
  selector: 'app-institutional-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './institutional-dashboard-page.html',
})
export class InstitutionalDashboardPage implements OnInit, OnDestroy {
  private analyticsV2 = inject(InstitutionalAnalyticsService);

  data = signal<DashboardV2Response | null>(null);
  loading = signal(false);
  error = signal('');
  fechaInicio = signal('');
  fechaFin = signal('');
  selectedSubsidyDay = signal<string>('');

  private charts: Chart[] = [];

  ngOnInit() {
    const today = new Date().toISOString().slice(0, 10);
    this.fechaInicio.set(today);
    this.fechaFin.set(today);
    this.loadDashboard();
  }

  ngOnDestroy() {
    this.destroyAllCharts();
  }

  loadDashboard() {
    this.loading.set(true);
    this.error.set('');
    this.destroyAllCharts();

    this.analyticsV2.getDashboard(this.fechaInicio(), this.fechaFin()).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
        if (res.subsidy?.byDay?.length > 0 && !this.selectedSubsidyDay()) {
          this.selectedSubsidyDay.set(res.subsidy.byDay[0].dia);
        }
        setTimeout(() => this.renderAllCharts(), 100);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Error al cargar el dashboard institucional.');
        this.loading.set(false);
      },
    });
  }

  onSubsidyDayChange(dia: string) {
    this.selectedSubsidyDay.set(dia);
    this.destroyAllCharts();
    const d = this.data();
    if (!d) return;
    setTimeout(() => {
      this.renderSubsidyChart(d);
      this.renderOperationalChart(d);
      this.renderProviderChart(d);
      this.renderAdminChart(d);
      this.renderHistoricalChart(d);
    }, 50);
  }

  getSelectedSubsidyDayData(): SubsidyDayData | null {
    const d = this.data();
    if (!d?.subsidy?.byDay) return null;
    return d.subsidy.byDay.find(s => s.dia === this.selectedSubsidyDay()) || null;
  }

  formatDia(dia: string): string {
    const map: Record<string, string> = {
      lunes: 'Lunes', martes: 'Martes', miercoles: 'Miercoles',
      jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sabado', domingo: 'Domingo',
    };
    return map[dia] || dia;
  }

  getSeveridadClass(s: string): string {
    if (s === 'ALTA') return 'badge badge-error';
    if (s === 'MEDIA') return 'badge badge-warning';
    return 'badge badge-ghost';
  }

  getAlertaIcon(tipo: string): string {
    switch (tipo) {
      case 'PERIODO_POR_FINALIZAR': return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
      case 'ALTA_INASISTENCIA': return 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6';
      case 'ESTUDIANTES_CRITICOS': return 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'CONCILIACIONES_PENDIENTES': return 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2';
      default: return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }

  private renderAllCharts() {
    this.destroyAllCharts();
    const d = this.data();
    if (!d) return;

    this.renderOperationalChart(d);
    this.renderSubsidyChart(d);
    this.renderProviderChart(d);
    this.renderAdminChart(d);
    this.renderHistoricalChart(d);
  }

  private renderOperationalChart(d: DashboardV2Response) {
    const canvas = document.getElementById('chart-op-today') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cfg: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: ['Reclamados', 'Expirados', 'No Util.', 'Admin'],
        datasets: [{
          label: 'Hoy',
          data: [d.operational.reclamados, d.operational.expirados, d.operational.noUtilizados, d.operational.administrativos],
          backgroundColor: ['#22c55e', '#ef4444', '#f59e0b', '#8b5cf6'],
        }],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    };
    this.charts.push(new Chart(ctx, cfg));
  }

  private renderSubsidyChart(d: DashboardV2Response) {
    const sd = this.getSelectedSubsidyDayData();
    if (!sd) return;

    const chartCanvas = document.getElementById('chart-subsidy-trend') as HTMLCanvasElement | null;
    if (chartCanvas) {
      const ctx = chartCanvas.getContext('2d');
      if (ctx) {
        const cfg: ChartConfiguration = {
          type: 'line',
          data: {
            labels: sd.chartData.map(p => p.fecha),
            datasets: [
              { label: 'Reclamados', data: sd.chartData.map(p => p.reclamados), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3 },
              { label: 'Inasistencias', data: sd.chartData.map(p => p.inasistencias), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3 },
            ],
          },
          options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
        };
        this.charts.push(new Chart(ctx, cfg));
      }
    }

    const progCanvas = document.getElementById('chart-subsidy-programs') as HTMLCanvasElement | null;
    if (progCanvas) {
      const ctx = progCanvas.getContext('2d');
      if (ctx) {
        const top = sd.programasCriticos.slice(0, 8);
        const cfg: ChartConfiguration = {
          type: 'bar',
          data: {
            labels: top.map(p => p.programa),
            datasets: [{
              label: '% Inasistencia',
              data: top.map(p => p.porcentajeInasistencia),
              backgroundColor: top.map((_, i) => `hsl(${10 + i * 30}, 70%, 55%)`),
            }],
          },
          options: { responsive: true, indexAxis: 'y' as const, plugins: { legend: { display: false } } },
        };
        this.charts.push(new Chart(ctx, cfg));
      }
    }
  }

  private renderProviderChart(d: DashboardV2Response) {
    const canvas = document.getElementById('chart-provider-trend') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cfg: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: d.provider.chartData.map(p => p.fecha),
        datasets: [{
          label: 'Diferencias',
          data: d.provider.chartData.map(p => p.diferencias),
          backgroundColor: d.provider.chartData.map(p => p.criticas > 0 ? '#ef4444' : '#f59e0b'),
        }],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    };
    this.charts.push(new Chart(ctx, cfg));
  }

  private renderAdminChart(d: DashboardV2Response) {
    const canvas = document.getElementById('chart-admin-motives') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const top = d.administrative.motivosFrecuentes.slice(0, 5);
    const cfg: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: top.map(m => m.motivo),
        datasets: [{
          data: top.map(m => m.total),
          backgroundColor: top.map((_, i) => `hsl(${260 + i * 25}, 60%, 55%)`),
        }],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    };
    this.charts.push(new Chart(ctx, cfg));
  }

  private renderHistoricalChart(d: DashboardV2Response) {
    const weeklyCanvas = document.getElementById('chart-historical-weekly') as HTMLCanvasElement | null;
    if (weeklyCanvas) {
      const ctx = weeklyCanvas.getContext('2d');
      if (ctx) {
        const cfg: ChartConfiguration = {
          type: 'line',
          data: {
            labels: d.historical.weekly.map(w => w.semana),
            datasets: [
              { label: 'Eficiencia %', data: d.historical.weekly.map(w => w.eficiencia), borderColor: '#22c55e', tension: 0.3 },
              { label: 'Desperdicio %', data: d.historical.weekly.map(w => w.desperdicio), borderColor: '#f59e0b', tension: 0.3 },
            ],
          },
          options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
        };
        this.charts.push(new Chart(ctx, cfg));
      }
    }

    const monthlyCanvas = document.getElementById('chart-historical-monthly') as HTMLCanvasElement | null;
    if (monthlyCanvas) {
      const ctx = monthlyCanvas.getContext('2d');
      if (ctx) {
        const cfg: ChartConfiguration = {
          type: 'bar',
          data: {
            labels: d.historical.monthly.map(m => m.mes),
            datasets: [
              { label: 'Reclamados', data: d.historical.monthly.map(m => m.recl), backgroundColor: '#22c55e' },
              { label: 'Expirados', data: d.historical.monthly.map(m => m.exp), backgroundColor: '#ef4444' },
              { label: 'No Utilizados', data: d.historical.monthly.map(m => m.noUt), backgroundColor: '#f59e0b' },
            ],
          },
          options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true } } },
        };
        this.charts.push(new Chart(ctx, cfg));
      }
    }
  }

  private destroyAllCharts() {
    for (const c of this.charts) {
      try { c.destroy(); } catch (_) { /* ignore */ }
    }
    this.charts = [];
  }
}
