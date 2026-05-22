import { AfterViewInit, Component, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Html5Qrcode } from 'html5-qrcode';
import { BonosService } from '../../../students/services/bonos.service';
import { AdminAuthService } from '../../services/admin-auth.service';

type ScanStatus = 'idle' | 'scanning' | 'success' | 'error' | 'loading';

@Component({
  selector: 'admin-scan-page',
  imports: [],
  templateUrl: './admin-scan-page.html',
  styles: `
    @keyframes scanPulse {
      0%,
      100% {
        border-color: rgb(239 68 68);
      }
      50% {
        border-color: rgb(239 68 68 / 30%);
      }
    }
    .scanning-border {
      animation: scanPulse 1.2s ease-in-out infinite;
    }
  `,
})
export class AdminScanPage implements AfterViewInit, OnDestroy {
  private bonosService = inject(BonosService);
  private authService = inject(AdminAuthService);
  private router = inject(Router);

  private scanner: Html5Qrcode | null = null;
  cameraId: string | null = null;
  private lastScanned = '';
  private scanCooldown = false;

  status = signal<ScanStatus>('idle');
  resultMessage = signal('');
  resultStudent = signal('');
  resultTipo = signal('');
  resultError = signal(false);
  cameraReady = signal(false);
  cameras: Array<{ id: string; label: string }> = [];

  ngAfterViewInit() {
    this.initCameras();
  }

  ngOnDestroy() {
    this.stopScanner();
  }

  private async initCameras() {
    try {
      // Forzar permisos reales del navegador
      await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      const devices = await Html5Qrcode.getCameras();

      console.log('[QR] Cameras detected:', devices);

      this.cameras = devices.map((d) => ({
        id: d.id,
        label: d.label || `Camara ${d.id.slice(0, 8)}`,
      }));

      if (this.cameras.length > 0) {
        this.cameraId = this.cameras[0].id;
        this.cameraReady.set(true);

        console.log('[QR] Using camera:', this.cameraId);

        this.startScanner();
      } else {
        console.log('[QR] No cameras returned');
        this.cameraReady.set(false);
      }
    } catch (e) {
      console.error('[QR] initCameras failed:', e);
      this.cameraReady.set(false);
    }
  }

  startScanner() {
    if (!this.cameraId) return;
    this.stopScanner();

    this.scanner = new Html5Qrcode('qr-reader');
    this.status.set('scanning');
    this.resultMessage.set('');
    this.resultStudent.set('');

    this.scanner
      .start(
        this.cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText: string) => this.onScanSuccess(decodedText),
        () => {},
      )
      .catch(() => {
        this.status.set('error');
        this.showResult('No se pudo acceder a la camara', true);
      });
  }

  stopScanner() {
    if (this.scanner) {
      this.scanner.stop().catch(() => {});
      this.scanner = null;
    }
    this.status.set('idle');
  }

  private onScanSuccess(decodedText: string) {
    if (this.scanCooldown) return;
    if (decodedText === this.lastScanned) return;
    this.lastScanned = decodedText;

    const parsed = this.parseQR(decodedText);
    if (!parsed) {
      this.showResult('QR INVALIDO — el formato no es reconocido', true);
      return;
    }

    this.scanCooldown = true;
    this.status.set('loading');

    this.bonosService.claimByQr(parsed.codigoBono, parsed.tipo).subscribe({
      next: (res) => {
        const student = res.student as Record<string, unknown>;
        this.resultError.set(false);
        this.resultMessage.set('BONO RECLAMADO');
        this.resultStudent.set(`${student['codigo']} — ${student['nombre']}`);
        this.resultTipo.set(parsed.tipo);
        this.status.set('success');
        this.lastScanned = '';
        setTimeout(() => {
          this.scanCooldown = false;
          this.status.set('scanning');
        }, 2500);
      },
      error: (err) => {
        const msg = err.error?.message || 'Error al reclamar';
        this.showResult(msg, true);
        this.lastScanned = '';
        setTimeout(() => {
          this.scanCooldown = false;
          this.status.set('scanning');
        }, 2000);
      },
    });
  }

  private parseQR(text: string): { codigoBono: number; tipo: string } | null {
    const parts = text.split('|');
    if (parts.length < 3 || parts[0] !== 'SIGBA') return null;
    const tipo = parts[1].toLowerCase();
    if (tipo !== 'almuerzo' && tipo !== 'refrigerio') return null;
    const codigoBono = Number(parts[2]);
    if (!Number.isInteger(codigoBono) || codigoBono <= 0) return null;
    return { codigoBono, tipo };
  }

  private showResult(message: string, isError: boolean) {
    this.resultError.set(isError);
    this.resultMessage.set(message);
    this.resultStudent.set('');
    this.resultTipo.set('');
    this.status.set('error');
  }

  selectCamera(id: string) {
    this.stopScanner();
    this.cameraId = id;
    this.startScanner();
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/admin/login']);
  }

  goDashboard() {
    this.stopScanner();
    this.router.navigate(['/admin']);
  }
}
