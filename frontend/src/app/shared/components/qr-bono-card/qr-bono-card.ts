import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { BonosService } from '../../../students/services/bonos.service';
import QRCode from 'qrcode';

@Component({
  selector: 'qr-bono-card',
  imports: [],
  template: `
    <div class="border-base-300 rounded-box border bg-white p-4">
      <h3 class="font-bold text-lg mb-1">Mi bono de hoy</h3>

      @if (loading()) {
        <div class="flex justify-center py-6">
          <span class="loading loading-spinner loading-md"></span>
        </div>
      } @else if (activeBono()) {
        <div class="flex flex-col items-center gap-3">
          <canvas #qrCanvas class="w-48 h-48"></canvas>
          <div class="text-center">
            <p class="text-2xl font-bold capitalize">{{ activeBono()!.tipo }}</p>
            <p class="text-sm text-gray-500">Codigo: <span class="font-mono font-bold text-lg">{{ activeBono()!.codigoBono }}</span></p>
            <p class="text-xs text-gray-400">Presenta este QR en bienestar</p>
          </div>
          <span class="badge badge-success">Activo</span>
        </div>
      } @else {
        <div class="flex flex-col items-center gap-2 py-4 text-gray-400">
          <p class="text-sm">Sin bono activo para hoy</p>
          <p class="text-xs">Solicita un bono cuando esté disponible</p>
        </div>
      }

      @if (error()) {
        <div class="mt-2 alert alert-error text-sm"><span>{{ error() }}</span></div>
      }
    </div>
  `,
})
export class QrBonoCardComponent implements OnDestroy {
  private bonosService = inject(BonosService);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private currentCanvas: HTMLCanvasElement | null = null;

  loading = signal(true);
  error = signal('');
  activeBono = signal<{ tipo: string; codigoBono: number; estado: string; fecha: string } | null>(null);

  constructor() {
    this.loadActiveBonus();
    this.refreshTimer = setInterval(() => this.loadActiveBonus(), 30000);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private loadActiveBonus() {
    this.bonosService.getActiveStudentBonus().subscribe({
      next: (data) => {
        this.loading.set(false);
        this.error.set('');
        if (data.hasActive && data.bono) {
          this.activeBono.set(data.bono);
          setTimeout(() => this.renderQR(data.qrContent), 100);
        } else {
          this.activeBono.set(null);
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudo consultar el bono activo');
      },
    });
  }

  refresh() {
    this.loading.set(true);
    this.loadActiveBonus();
  }

  private renderQR(content: string) {
    const canvas = document.querySelector('qr-bono-card canvas') as HTMLCanvasElement;
    if (!canvas) return;
    QRCode.toCanvas(canvas, content, { width: 192, margin: 2, color: { dark: '#000', light: '#fff' } })
      .catch(() => {});
  }
}
