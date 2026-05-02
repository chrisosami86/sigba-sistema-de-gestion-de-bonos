import { Component, computed, inject, input, signal } from '@angular/core';
import { Student } from '../../interfaces/student.interface';
import { TimeService } from '../../services/time.service';

@Component({
  selector: 'countdown-bonos',
  imports: [],
  templateUrl: './countdown-bonos.html',
})
export class CountdownBonos {

  systemService = inject(TimeService)

  currentTime = signal(new Date());

  offset = signal(0);


  estado = computed(() => {
    const now = this.currentTime();

    const totalMin = now.getHours() * 60 + now.getMinutes();

    const subsidiadoFin = 10 * 60 + 15; // 10:15
    const ventaLibreInicio = 11 * 60 + 30; // 11:30

    if (totalMin < subsidiadoFin) {
      return 'subsidiado';
    } else if (totalMin < ventaLibreInicio) {
      return 'bloqueado';
    } else {
      return 'venta_libre';
    }
  });

  tiempoRestante = computed(() => {
    const now = this.currentTime();

    let objetivo = new Date(now);

    const estadoActual = this.estado();

    if (estadoActual === 'subsidiado') {
      objetivo.setHours(10, 15, 0, 0);
    } else if (estadoActual === 'bloqueado') {
      objetivo.setHours(11, 30, 0, 0);
    } else {
      return 'Disponible';
    }

    const diff = objetivo.getTime() - now.getTime();

    if (diff <= 0) return '00:00:00';

    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff / (1000 * 60)) % 60);
    const segundos = Math.floor((diff / 1000) % 60);

    return `${horas.toString().padStart(2, '0')}:${minutos
      .toString()
      .padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
  });

  constructor() {
    setInterval(() => {
       const now = new Date().getTime() + this.offset();
      this.currentTime.set(new Date(now));
    }, 1000);
  }

  syncWithServer() {
    this.systemService.getServerTime().subscribe({
      next: ({ serverTime }) => {
        const server = new Date(serverTime).getTime();
        const client = new Date().getTime();

        this.offset.set(server - client);
      }
    });
  }


}
