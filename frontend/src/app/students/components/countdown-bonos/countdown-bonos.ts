import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { BonoTipo, EstadoSistemaBono } from '../../interfaces/bono.interface';
import { BonosService } from '../../services/bonos.service';
import { TimeService } from '../../services/time.service';

@Component({
  selector: 'countdown-bonos',
  imports: [],
  templateUrl: './countdown-bonos.html',
})
export class CountdownBonos implements OnDestroy {
  private timeService = inject(TimeService);
  private bonosService = inject(BonosService);
  private clockIntervalId: ReturnType<typeof setInterval>;
  private refreshIntervalId: ReturnType<typeof setInterval>;

  currentTime = signal(new Date());
  offset = signal(0);
  loading = signal(true);
  errorMessage = signal('');

  estados = signal<Record<BonoTipo, EstadoSistemaBono>>({
    almuerzo: { estado: 'cerrado', mensaje: 'Consultando estado de almuerzo' },
    refrigerio: { estado: 'cerrado', mensaje: 'Consultando estado de refrigerio' },
  });

  horaActual = computed(() => {
    return this.currentTime().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  });

  mensajePrincipal = computed(() => {
    const estados = this.estados();
    const almuerzo = estados.almuerzo;
    const refrigerio = estados.refrigerio;

    if (almuerzo.estado === 'subsidiado') return 'Bono almuerzo subsidiado activo';
    if (almuerzo.estado === 'venta_libre') return 'Bono almuerzo en venta libre';
    if (almuerzo.estado === 'bloqueado') return 'Almuerzo en pausa antes de venta libre';
    if (refrigerio.estado === 'subsidiado') return 'Bono refrigerio subsidiado activo';
    if (refrigerio.estado === 'venta_libre') return 'Bono refrigerio en venta libre';
    if (refrigerio.estado === 'bloqueado') return 'Refrigerio en pausa antes de venta libre';

    return 'Sistema fuera de horario de bonos';
  });

  constructor() {
    this.syncWithServer();
    this.refreshBonos();

    this.clockIntervalId = setInterval(() => {
      const now = new Date().getTime() + this.offset();
      this.currentTime.set(new Date(now));
    }, 1000);

    this.refreshIntervalId = setInterval(() => {
      this.refreshBonos();
    }, 30000);
  }

  ngOnDestroy() {
    clearInterval(this.clockIntervalId);
    clearInterval(this.refreshIntervalId);
  }

  private syncWithServer() {
    this.timeService.getServerTime().subscribe({
      next: ({ serverTime }) => {
        const server = new Date(serverTime).getTime();
        const client = new Date().getTime();

        this.offset.set(server - client);
      },
    });
  }

  private refreshBonos() {
    this.loading.set(true);

    forkJoin({
      estadoAlmuerzo: this.bonosService.getEstado('almuerzo'),
      estadoRefrigerio: this.bonosService.getEstado('refrigerio'),
    }).subscribe({
      next: (data) => {
        this.estados.set({
          almuerzo: data.estadoAlmuerzo,
          refrigerio: data.estadoRefrigerio,
        });
        this.errorMessage.set('');
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudo consultar el estado de bonos');
        this.loading.set(false);
      },
    });
  }
}
